package pipeline

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/example/doctor-appointment-rag/services/rag/internal/config"
	"github.com/example/doctor-appointment-rag/services/rag/internal/ingestion"
	"github.com/example/doctor-appointment-rag/services/rag/internal/intent"
	"github.com/example/doctor-appointment-rag/services/rag/internal/llm"
	"github.com/example/doctor-appointment-rag/services/rag/internal/relevance"
	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

const FallbackAnswer = "I don't have enough information in the uploaded knowledge documents to answer that question. The question has been submitted for review."

type SyncRequest struct {
	DocumentID string `json:"documentId"`
	Version    int    `json:"version"`
	Title      string `json:"title"`
	FileURL    string `json:"fileUrl"`
}

type Source struct {
	Title string  `json:"title"`
	Page  int     `json:"page,omitempty"`
	Score float64 `json:"score,omitempty"`
}

type ChatResult struct {
	Sufficient bool     `json:"sufficient"`
	Answer     string   `json:"answer"`
	Sources    []Source `json:"sources"`
	Reason     string   `json:"reason,omitempty"`
	TopScore   float64  `json:"topScore"`
	Confidence float64  `json:"confidence"`
}

type StatusCallback func(ctx context.Context, documentID, status, indexError string) error

// ChunkStore is the subset of vectorstore.Store the pipeline needs, so tests can inject a fake.
type ChunkStore interface {
	UpsertMany(ctx context.Context, chunks []vectorstore.Chunk) error
	DeleteByDocument(ctx context.Context, documentID string) error
	Search(ctx context.Context, embedding []float32, limit int) ([]vectorstore.ScoredChunk, error)
}

type Pipeline struct {
	cfg      config.Config
	store    ChunkStore
	embedder llm.Embedder
	generate llm.Generator
	http     *http.Client
	secret   string
	callback StatusCallback
}

func New(cfg config.Config, store ChunkStore, embedder llm.Embedder, generate llm.Generator, callback StatusCallback) *Pipeline {
	return &Pipeline{
		cfg:      cfg,
		store:    store,
		embedder: embedder,
		generate: generate,
		http:     &http.Client{Timeout: 120 * time.Second},
		secret:   cfg.InternalSecret,
		callback: callback,
	}
}

func (p *Pipeline) IngestURL(ctx context.Context, req SyncRequest) error {
	if req.DocumentID == "" || req.FileURL == "" {
		return fmt.Errorf("documentId and fileUrl are required")
	}
	if req.Version < 1 {
		req.Version = 1
	}

	data, err := p.download(ctx, req.FileURL)
	if err != nil {
		return err
	}
	return p.IngestBytes(ctx, req, data)
}

func (p *Pipeline) IngestBytes(ctx context.Context, req SyncRequest, data []byte) error {
	slog.Info("extracting pdf",
		"documentId", req.DocumentID,
		"bytes", len(data),
		"title", req.Title,
	)

	pages, err := ingestion.ExtractPDF(data)
	if err != nil {
		return err
	}

	parts := ingestion.SplitPages(pages)
	if len(parts) == 0 {
		return fmt.Errorf("no chunks produced from document %s", req.DocumentID)
	}

	texts := make([]string, len(parts))
	totalChars := 0
	for i, part := range parts {
		texts[i] = part.Text
		totalChars += len(part.Text)
	}

	preview := texts[0]
	if len(preview) > 160 {
		preview = preview[:160] + "…"
	}
	slog.Info("pdf text ready for embedding",
		"documentId", req.DocumentID,
		"pages", len(pages),
		"chunks", len(parts),
		"chars", totalChars,
		"preview", preview,
	)

	vectors, err := p.embedTexts(ctx, texts, "document")
	if err != nil {
		return fmt.Errorf("embed: %w", err)
	}

	chunks := make([]vectorstore.Chunk, len(parts))
	for i, part := range parts {
		chunks[i] = vectorstore.Chunk{
			ID:         fmt.Sprintf("%s:%d", req.DocumentID, part.ChunkIndex),
			DocumentID: req.DocumentID,
			Title:      req.Title,
			Text:       part.Text,
			Embedding:  vectors[i],
			Source:     req.Title,
			Page:       part.Page,
			ChunkIndex: part.ChunkIndex,
			Version:    req.Version,
		}
	}

	// Delete-then-insert so a new version cannot leave stale vectors (ADR-010).
	if err := p.store.DeleteByDocument(ctx, req.DocumentID); err != nil {
		return err
	}
	if err := p.store.UpsertMany(ctx, chunks); err != nil {
		return err
	}

	slog.Info("ingested document",
		"documentId", req.DocumentID,
		"chunks", len(chunks),
		"version", req.Version,
		"embeddingDim", len(vectors[0]),
	)
	return nil
}

func (p *Pipeline) Delete(ctx context.Context, documentID string) error {
	return p.store.DeleteByDocument(ctx, documentID)
}

func (p *Pipeline) Ask(ctx context.Context, question string) (ChatResult, error) {
	question = strings.TrimSpace(question)
	if question == "" {
		return ChatResult{Answer: FallbackAnswer, Reason: string(relevance.ReasonNoResults)}, nil
	}

	switch kind := intent.Classify(question); kind {
	case intent.KindGreeting, intent.KindIdentity:
		slog.Info("chat intent", "kind", kind, "question", truncate(question, 80))
		return p.converse(ctx, kind, question)
	}

	vectors, err := p.embedTexts(ctx, []string{question}, "query")
	if err != nil {
		return ChatResult{}, fmt.Errorf("embed question: %w", err)
	}

	hits, err := p.store.Search(ctx, vectors[0], 8)
	if err != nil {
		return ChatResult{}, err
	}

	gates := p.gates(ctx)
	decision := relevance.Evaluate(hits, question, gates)

	if !decision.Pass && (decision.Reason == relevance.ReasonNoResults || decision.Reason == relevance.ReasonBelowThreshold) {
		if searcher, ok := p.store.(lexicalSearcher); ok {
			lex, lexErr := searcher.SearchLexical(ctx, question, 8)
			if lexErr != nil {
				slog.Warn("lexical search failed", "error", lexErr)
			} else if len(lex) > 0 {
				hits = mergeHits(hits, lex)
				decision = relevance.Evaluate(hits, question, gates)
				slog.Info("chat lexical fallback",
					"lexHits", len(lex),
					"merged", len(hits),
					"pass", decision.Pass,
					"reason", string(decision.Reason),
					"coverage", decision.Coverage,
					"topScore", decision.TopScore,
				)
			}
		}
	}

	decision.Kept = llm.LimitContextChunks(decision.Kept)

	slog.Info("chat retrieval",
		"question", truncate(question, 120),
		"hits", len(hits),
		"kept", len(decision.Kept),
		"topScore", decision.TopScore,
		"coverage", decision.Coverage,
		"pass", decision.Pass,
		"reason", string(decision.Reason),
		"topTitle", firstTitle(hits),
		"topTextLen", firstTextLen(hits),
	)

	if !decision.Pass {
		return ChatResult{
			Sufficient: false,
			Answer:     FallbackAnswer,
			Sources:    nil,
			Reason:     string(decision.Reason),
			TopScore:   decision.TopScore,
			Confidence: 0,
		}, nil
	}

	genStarted := time.Now()
	raw, err := p.generate.Generate(ctx, llm.SystemPrompt, llm.BuildUserPrompt(question, decision.Kept))
	if err != nil {
		slog.Error("chat generate failed",
			"error", err,
			"elapsedMs", time.Since(genStarted).Milliseconds(),
			"contextChunks", len(decision.Kept),
		)
		return ChatResult{}, fmt.Errorf("generate: %w", err)
	}
	slog.Info("chat generate done",
		"elapsedMs", time.Since(genStarted).Milliseconds(),
		"rawLen", len(raw),
		"contextChunks", len(decision.Kept),
	)

	parsed, ok := llm.ParseGeneration(raw)
	if !ok || !parsed.Sufficient || strings.TrimSpace(parsed.Answer) == "" {
		slog.Info("chat llm declined or malformed",
			"ok", ok,
			"sufficient", parsed.Sufficient,
			"answerLen", len(strings.TrimSpace(parsed.Answer)),
			"rawPreview", truncate(raw, 240),
		)
		return ChatResult{
			Sufficient: false,
			Answer:     FallbackAnswer,
			Reason:     string(relevance.ReasonLLMDeclined),
			TopScore:   decision.TopScore,
			Confidence: 0,
		}, nil
	}

	confidence := parsed.Confidence
	if confidence <= 0 || confidence > 1 {
		confidence = decision.TopScore
	}

	return ChatResult{
		Sufficient: true,
		Answer:     strings.TrimSpace(parsed.Answer),
		Sources:    sourcesFor(parsed.SourceChunkIDs, decision.Kept),
		TopScore:   decision.TopScore,
		Confidence: confidence,
	}, nil
}

type lexicalSearcher interface {
	SearchLexical(ctx context.Context, question string, limit int) ([]vectorstore.ScoredChunk, error)
}

type taskEmbedder interface {
	EmbedTask(ctx context.Context, texts []string, task string) ([][]float32, error)
}

type textGenerator interface {
	GenerateText(ctx context.Context, system, user string) (string, error)
}

func (p *Pipeline) embedTexts(ctx context.Context, texts []string, task string) ([][]float32, error) {
	if te, ok := p.embedder.(taskEmbedder); ok {
		return te.EmbedTask(ctx, texts, task)
	}
	return p.embedder.Embed(ctx, texts)
}

func (p *Pipeline) converse(ctx context.Context, kind intent.Kind, question string) (ChatResult, error) {
	raw, err := p.generateText(ctx, llm.ConversationalSystem, llm.ConversationalUser(string(kind), question))
	answer := ""
	if err != nil {
		slog.Warn("conversational generate failed", "kind", kind, "error", err)
	} else {
		answer = llm.PlainReply(raw)
	}
	if answer == "" {
		answer = intent.FallbackReply(kind)
	}

	return ChatResult{
		Sufficient: true,
		Answer:     answer,
		Reason:     string(kind),
		Confidence: 1,
	}, nil
}

func (p *Pipeline) generateText(ctx context.Context, system, user string) (string, error) {
	if tg, ok := p.generate.(textGenerator); ok {
		return tg.GenerateText(ctx, system, user)
	}
	return p.generate.Generate(ctx, system, user)
}

func (p *Pipeline) gates(ctx context.Context) relevance.Gates {
	g := relevance.Gates{
		MinScore:    p.cfg.MinScore,
		StrongScore: p.cfg.StrongScore,
		MinChunks:   p.cfg.MinChunks,
		MinCoverage: p.cfg.MinCoverage,
	}
	if p.cfg.PayloadURL == "" {
		return g
	}
	settings, err := llm.FetchSettings(ctx, p.cfg.PayloadURL, p.secret)
	if err != nil {
		return g
	}
	if settings.MinChunks >= 1 {
		g.MinChunks = settings.MinChunks
	}
	if settings.MinScore > 0 {
		g.MinScore = settings.MinScore
	}
	if settings.StrongScore > 0 {
		g.StrongScore = settings.StrongScore
	}
	if settings.MinCoverage > 0 {
		g.MinCoverage = settings.MinCoverage
	}
	return g
}

func mergeHits(primary, extra []vectorstore.ScoredChunk) []vectorstore.ScoredChunk {
	byID := make(map[string]vectorstore.ScoredChunk, len(primary)+len(extra))
	add := func(chunk vectorstore.ScoredChunk) {
		id := chunk.ID
		if id == "" {
			id = fmt.Sprintf("%s:%d", chunk.DocumentID, chunk.ChunkIndex)
			chunk.ID = id
		}
		if existing, ok := byID[id]; ok {
			if chunk.Score > existing.Score {
				byID[id] = chunk
			}
			return
		}
		byID[id] = chunk
	}
	for _, chunk := range primary {
		add(chunk)
	}
	for _, chunk := range extra {
		add(chunk)
	}
	out := make([]vectorstore.ScoredChunk, 0, len(byID))
	for _, chunk := range byID {
		out = append(out, chunk)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func firstTitle(hits []vectorstore.ScoredChunk) string {
	if len(hits) == 0 {
		return ""
	}
	return hits[0].Title
}

func firstTextLen(hits []vectorstore.ScoredChunk) int {
	if len(hits) == 0 {
		return 0
	}
	return len(hits[0].Text)
}

func (p *Pipeline) ReportStatus(ctx context.Context, documentID, status, indexError string) {
	if p.callback == nil {
		return
	}
	if err := p.callback(ctx, documentID, status, indexError); err != nil {
		slog.Error("index status callback failed", "documentId", documentID, "error", err)
	}
}

func (p *Pipeline) download(ctx context.Context, fileURL string) ([]byte, error) {
	if !strings.HasPrefix(fileURL, "http://") && !strings.HasPrefix(fileURL, "https://") {
		return nil, fmt.Errorf("unsupported file url")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fileURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-RAG-Internal-Secret", p.secret)

	res, err := p.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download pdf: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("download pdf: status %d", res.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(res.Body, 20<<20))
	if err != nil {
		return nil, err
	}
	return data, nil
}

func sourcesFor(ids []string, chunks []vectorstore.ScoredChunk) []Source {
	byID := make(map[string]vectorstore.ScoredChunk, len(chunks))
	for _, chunk := range chunks {
		byID[chunk.ID] = chunk
	}

	seen := map[string]struct{}{}
	var out []Source
	appendSource := func(chunk vectorstore.ScoredChunk) {
		key := fmt.Sprintf("%s:%d", chunk.Title, chunk.Page)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, Source{Title: chunk.Title, Page: chunk.Page, Score: chunk.Score})
	}

	for _, id := range ids {
		if chunk, ok := byID[id]; ok {
			appendSource(chunk)
		}
	}
	if len(out) == 0 {
		for _, chunk := range chunks {
			appendSource(chunk)
		}
	}
	return out
}

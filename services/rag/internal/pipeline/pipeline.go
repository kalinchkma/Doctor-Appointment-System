package pipeline

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/example/doctor-appointment-rag/services/rag/internal/config"
	"github.com/example/doctor-appointment-rag/services/rag/internal/ingestion"
	"github.com/example/doctor-appointment-rag/services/rag/internal/llm"
	"github.com/example/doctor-appointment-rag/services/rag/internal/relevance"
	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

const FallbackAnswer = "I don't have enough information in the available healthcare documents to answer that question. The question has been submitted for review."

type SyncRequest struct {
	DocumentID string `json:"documentId"`
	Version    int    `json:"version"`
	Title      string `json:"title"`
	FileURL    string `json:"fileUrl"`
}

type Source struct {
	Title string `json:"title"`
	Page  int    `json:"page,omitempty"`
}

type ChatResult struct {
	Sufficient bool     `json:"sufficient"`
	Answer     string   `json:"answer"`
	Sources    []Source `json:"sources"`
	Reason     string   `json:"reason,omitempty"`
	TopScore   float64  `json:"topScore"`
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
		http:     &http.Client{Timeout: 30 * time.Second},
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
	pages, err := ingestion.ExtractPDF(data)
	if err != nil {
		return err
	}

	parts := ingestion.SplitPages(pages)
	if len(parts) == 0 {
		return fmt.Errorf("no chunks produced from document %s", req.DocumentID)
	}

	texts := make([]string, len(parts))
	for i, part := range parts {
		texts[i] = part.Text
	}

	vectors, err := p.embedder.Embed(ctx, texts)
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

	slog.Info("ingested document", "documentId", req.DocumentID, "chunks", len(chunks), "version", req.Version)
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

	vectors, err := p.embedder.Embed(ctx, []string{question})
	if err != nil {
		return ChatResult{}, fmt.Errorf("embed question: %w", err)
	}

	hits, err := p.store.Search(ctx, vectors[0], 6)
	if err != nil {
		return ChatResult{}, err
	}

	decision := relevance.Evaluate(hits, question, relevance.Gates{
		MinScore:    p.cfg.MinScore,
		StrongScore: p.cfg.StrongScore,
		MinChunks:   p.cfg.MinChunks,
		MinCoverage: p.cfg.MinCoverage,
	})

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
		}, nil
	}

	raw, err := p.generate.Generate(ctx, llm.SystemPrompt, llm.BuildUserPrompt(question, decision.Kept))
	if err != nil {
		return ChatResult{}, fmt.Errorf("generate: %w", err)
	}

	parsed, ok := llm.ParseGeneration(raw)
	if !ok || !parsed.Sufficient || strings.TrimSpace(parsed.Answer) == "" {
		slog.Info("chat llm declined or malformed", "ok", ok, "sufficient", parsed.Sufficient, "answerLen", len(strings.TrimSpace(parsed.Answer)))
		return ChatResult{
			Sufficient: false,
			Answer:     FallbackAnswer,
			Reason:     string(relevance.ReasonLLMDeclined),
			TopScore:   decision.TopScore,
		}, nil
	}

	return ChatResult{
		Sufficient: true,
		Answer:     strings.TrimSpace(parsed.Answer),
		Sources:    sourcesFor(parsed.SourceChunkIDs, decision.Kept),
		TopScore:   decision.TopScore,
	}, nil
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
		out = append(out, Source{Title: chunk.Title, Page: chunk.Page})
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

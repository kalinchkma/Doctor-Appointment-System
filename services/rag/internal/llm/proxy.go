package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"
)

// Proxy calls Payload's internal embed/chat endpoints. Provider keys and vendor
// quirks stay in the CMS; this client only knows one secret and two URLs.
type Proxy struct {
	baseURL    string
	secret     string
	dimensions int
	http       *http.Client
	maxRetries int
}

func NewProxy(payloadURL, secret string, dimensions int) *Proxy {
	return &Proxy{
		baseURL:    strings.TrimRight(payloadURL, "/"),
		secret:     secret,
		dimensions: dimensions,
		http:       &http.Client{Timeout: 180 * time.Second},
		maxRetries: 3,
	}
}

func (p *Proxy) Dimensions() int { return p.dimensions }

func (p *Proxy) SetDimensions(n int) {
	if n >= 8 {
		p.dimensions = n
	}
}

type Settings struct {
	EmbedDimensions int     `json:"embedDimensions"`
	MinScore        float64 `json:"minScore"`
	StrongScore     float64 `json:"strongScore"`
	MinChunks       int     `json:"minChunks"`
	MinCoverage     float64 `json:"minCoverage"`
	MaxConcurrency  int     `json:"maxConcurrency"`
	ChatProvider    string  `json:"chatProvider"`
	ChatModel       string  `json:"chatModel"`
	EmbedProvider   string  `json:"embedProvider"`
	EmbedModel      string  `json:"embedModel"`
}

func FetchSettings(ctx context.Context, payloadURL, secret string) (Settings, error) {
	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(payloadURL, "/")+"/api/internal/rag-settings", nil)
	if err != nil {
		return Settings{}, err
	}
	req.Header.Set("X-RAG-Internal-Secret", secret)

	res, err := client.Do(req)
	if err != nil {
		return Settings{}, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode >= 400 {
		return Settings{}, fmt.Errorf("rag-settings status %d", res.StatusCode)
	}

	var settings Settings
	if err := json.NewDecoder(res.Body).Decode(&settings); err != nil {
		return Settings{}, err
	}
	return settings, nil
}

func (p *Proxy) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	return p.EmbedTask(ctx, texts, "document")
}

func (p *Proxy) EmbedTask(ctx context.Context, texts []string, task string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	if task == "" {
		task = "document"
	}

	const batch = 16
	out := make([][]float32, len(texts))
	for start := 0; start < len(texts); start += batch {
		end := start + batch
		if end > len(texts) {
			end = len(texts)
		}
		chunk, err := p.embedBatch(ctx, texts[start:end], task)
		if err != nil {
			return nil, err
		}
		copy(out[start:end], chunk)
	}
	return out, nil
}

func (p *Proxy) embedBatch(ctx context.Context, texts []string, task string) ([][]float32, error) {
	body, err := p.post(ctx, "/api/internal/embeddings", map[string]any{"input": texts, "task": task})
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Data []struct {
			Index     *int      `json:"index"`
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("decode embeddings: %w", err)
	}
	if len(parsed.Data) != len(texts) {
		return nil, fmt.Errorf("embeddings: expected %d vectors, got %d", len(texts), len(parsed.Data))
	}

	sequential := false
	for _, item := range parsed.Data {
		if item.Index == nil {
			sequential = true
			break
		}
	}

	vectors := make([][]float32, len(texts))
	for i, item := range parsed.Data {
		idx := i
		if !sequential && item.Index != nil {
			idx = *item.Index
		}
		if idx < 0 || idx >= len(texts) {
			return nil, fmt.Errorf("embeddings: out-of-range index %d", idx)
		}
		vectors[idx] = item.Embedding
	}
	for i, vec := range vectors {
		if len(vec) == 0 {
			return nil, fmt.Errorf("embeddings: empty vector at %d", i)
		}
	}
	return vectors, nil
}

func (p *Proxy) Generate(ctx context.Context, system, user string) (string, error) {
	return p.complete(ctx, system, user, "json")
}

func (p *Proxy) GenerateText(ctx context.Context, system, user string) (string, error) {
	return p.complete(ctx, system, user, "text")
}

func (p *Proxy) complete(ctx context.Context, system, user, format string) (string, error) {
	body, err := p.post(ctx, "/api/internal/chat/completions", map[string]string{
		"system": system,
		"user":   user,
		"format": format,
	})
	if err != nil {
		return "", err
	}

	var parsed struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("decode completion: %w", err)
	}
	if parsed.Content == "" {
		return "", fmt.Errorf("completion: empty")
	}
	return parsed.Content, nil
}

func (p *Proxy) post(ctx context.Context, path string, payload any) ([]byte, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	var last error
	for attempt := 0; attempt <= p.maxRetries; attempt++ {
		if attempt > 0 {
			delay := time.Duration(math.Pow(2, float64(attempt-1))) * 200 * time.Millisecond
			delay += time.Duration(rand.IntN(120)) * time.Millisecond
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+path, bytes.NewReader(encoded))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-RAG-Internal-Secret", p.secret)

		res, err := p.http.Do(req)
		if err != nil {
			last = err
			continue
		}

		body, readErr := io.ReadAll(io.LimitReader(res.Body, 4<<20))
		_ = res.Body.Close()
		if readErr != nil {
			last = readErr
			continue
		}

		if res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500 {
			last = fmt.Errorf("payload proxy status %d", res.StatusCode)
			continue
		}
		if res.StatusCode >= 400 {
			return nil, fmt.Errorf("payload proxy status %d", res.StatusCode)
		}
		return body, nil
	}
	return nil, fmt.Errorf("payload proxy request failed: %w", last)
}

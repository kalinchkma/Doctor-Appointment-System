package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/example/doctor-appointment-rag/services/rag/internal/config"
	"github.com/example/doctor-appointment-rag/services/rag/internal/llm"
	"github.com/example/doctor-appointment-rag/services/rag/internal/pipeline"
	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

type memoryStore struct{}

func (memoryStore) UpsertMany(context.Context, []vectorstore.Chunk) error { return nil }
func (memoryStore) DeleteByDocument(context.Context, string) error        { return nil }
func (memoryStore) Search(context.Context, []float32, int) ([]vectorstore.ScoredChunk, error) {
	return nil, nil
}

type blockingEmbedder struct {
	started chan struct{}
	hold    chan struct{}
	llm.FakeEmbedder
}

func (b blockingEmbedder) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	select {
	case <-b.started:
	default:
		close(b.started)
	}
	select {
	case <-b.hold:
		return b.FakeEmbedder.Embed(ctx, texts)
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func testServer(t *testing.T, cfg config.Config, embedder llm.Embedder) http.Handler {
	t.Helper()
	pipe := pipeline.New(cfg, memoryStore{}, embedder, llm.ScriptedGenerator{Response: `{"sufficient":false}`}, nil)
	return New(cfg, pipe)
}

func TestMissingSecretUnauthorized(t *testing.T) {
	cfg := config.Config{InternalSecret: "s3cret", MaxConcurrency: 2, ChatTimeoutSec: 2}
	handler := testServer(t, cfg, llm.FakeEmbedder{Dim: 8})

	req := httptest.NewRequest(http.MethodPost, "/internal/v1/chat", bytes.NewBufferString(`{"question":"hi"}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("missing secret: got %d", res.Code)
	}
}

func TestWrongSecretUnauthorized(t *testing.T) {
	cfg := config.Config{InternalSecret: "s3cret", MaxConcurrency: 2, ChatTimeoutSec: 2}
	handler := testServer(t, cfg, llm.FakeEmbedder{Dim: 8})

	req := httptest.NewRequest(http.MethodPost, "/internal/v1/chat", bytes.NewBufferString(`{"question":"hi"}`))
	req.Header.Set("X-RAG-Internal-Secret", "nope")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("wrong secret: got %d", res.Code)
	}
}

func TestCorrectSecretPassesThrough(t *testing.T) {
	cfg := config.Config{InternalSecret: "s3cret", MaxConcurrency: 2, ChatTimeoutSec: 2, MinScore: 0.9, StrongScore: 0.95, MinChunks: 2}
	handler := testServer(t, cfg, llm.FakeEmbedder{Dim: 8})

	req := httptest.NewRequest(http.MethodPost, "/internal/v1/chat", bytes.NewBufferString(`{"question":"folic acid"}`))
	req.Header.Set("X-RAG-Internal-Secret", "s3cret")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("correct secret: got %d body %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["sufficient"] != false {
		t.Fatalf("empty store should fall back, got %#v", body)
	}
}

func TestConcurrencyLimitReturns503(t *testing.T) {
	started := make(chan struct{})
	hold := make(chan struct{})
	cfg := config.Config{InternalSecret: "s3cret", MaxConcurrency: 1, ChatTimeoutSec: 1}
	handler := testServer(t, cfg, blockingEmbedder{started: started, hold: hold, FakeEmbedder: llm.FakeEmbedder{Dim: 8}})

	go func() {
		req := httptest.NewRequest(http.MethodPost, "/internal/v1/chat", bytes.NewBufferString(`{"question":"Why is folic acid used in pregnancy?"}`))
		req.Header.Set("X-RAG-Internal-Secret", "s3cret")
		handler.ServeHTTP(httptest.NewRecorder(), req)
	}()

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("first request did not start")
	}

	req := httptest.NewRequest(http.MethodPost, "/internal/v1/chat", bytes.NewBufferString(`{"question":"What foods help pregnancy nutrition?"}`))
	req.Header.Set("X-RAG-Internal-Secret", "s3cret")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 under concurrency pressure, got %d", res.Code)
	}
	close(hold)
}

func TestChatAcceptsHistory(t *testing.T) {
	cfg := config.Config{InternalSecret: "s3cret", MaxConcurrency: 2, ChatTimeoutSec: 2, MinScore: 0.9, StrongScore: 0.95, MinChunks: 2}
	handler := testServer(t, cfg, llm.FakeEmbedder{Dim: 8})

	body := `{"question":"What about iron?","history":[{"role":"user","content":"Which micronutrients matter?"},{"role":"assistant","content":"Folate and iron."}]}`
	req := httptest.NewRequest(http.MethodPost, "/internal/v1/chat", bytes.NewBufferString(body))
	req.Header.Set("X-RAG-Internal-Secret", "s3cret")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("history chat: got %d body %s", res.Code, res.Body.String())
	}
}

func TestHealthzOpen(t *testing.T) {
	cfg := config.Config{InternalSecret: "s3cret", MaxConcurrency: 1, ChatTimeoutSec: 1}
	handler := testServer(t, cfg, llm.FakeEmbedder{Dim: 8})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("healthz: got %d", res.Code)
	}
}

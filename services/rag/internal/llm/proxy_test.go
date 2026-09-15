package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestProxyGenerate(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/internal/chat/completions" {
			t.Fatalf("path %s", r.URL.Path)
		}
		if r.Header.Get("X-RAG-Internal-Secret") != "s3cret" {
			t.Fatal("missing secret")
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"content": `{"sufficient": true, "answer": "ok"}`,
		})
	}))
	defer server.Close()

	client := NewProxy(server.URL, "s3cret", 8)
	got, err := client.Generate(context.Background(), "sys", "user")
	if err != nil {
		t.Fatal(err)
	}
	parsed, ok := ParseGeneration(got)
	if !ok || !parsed.Sufficient {
		t.Fatalf("got %q", got)
	}
}

func TestProxyRetriesOn429(t *testing.T) {
	hits := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if hits < 3 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"content": `{"sufficient": false}`})
	}))
	defer server.Close()

	client := NewProxy(server.URL, "s3cret", 8)
	if _, err := client.Generate(context.Background(), "sys", "user"); err != nil {
		t.Fatal(err)
	}
	if hits != 3 {
		t.Fatalf("expected 3 attempts, got %d", hits)
	}
}

func TestProxyStopsAtRetryLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer server.Close()

	client := NewProxy(server.URL, "s3cret", 8)
	client.maxRetries = 1
	if _, err := client.Generate(context.Background(), "sys", "user"); err == nil {
		t.Fatal("expected error after retries")
	}
}

func TestProxyHonoursCancel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	client := NewProxy(server.URL, "s3cret", 8)
	if _, err := client.Generate(ctx, "sys", "user"); err == nil {
		t.Fatal("expected cancellation error")
	}
}

func TestFetchSettings(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/internal/rag-settings" {
			t.Fatalf("path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"embedDimensions": 1536, "minScore": 0.7, "chatProvider": "openai"})
	}))
	defer server.Close()

	got, err := FetchSettings(context.Background(), server.URL, "s3cret")
	if err != nil {
		t.Fatal(err)
	}
	if got.EmbedDimensions != 1536 || got.ChatProvider != "openai" {
		t.Fatalf("%+v", got)
	}
}

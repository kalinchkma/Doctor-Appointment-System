//go:build integration

package vectorstore

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/example/doctor-appointment-rag/services/rag/internal/llm"
)

func testURI(t *testing.T) string {
	t.Helper()
	uri := os.Getenv("RAG_DATABASE_URI")
	if uri == "" {
		t.Skip("RAG_DATABASE_URI is not set")
	}
	return uri
}

func TestIndexLifecycleAndRoundTrip(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	store, err := New(ctx, testURI(t), "rag_vectors_test", 32)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close(ctx) }()

	if err := store.EnsureSearchIndex(ctx); err != nil {
		t.Fatal(err)
	}
	if err := store.EnsureSearchIndex(ctx); err != nil {
		t.Fatal("EnsureSearchIndex should be idempotent")
	}

	embedder := llm.FakeEmbedder{Dim: 32}
	texts := []string{
		"Folic acid helps the neural tube close in early pregnancy.",
		"Children should not be given honey before twelve months.",
	}
	vectors, err := embedder.Embed(ctx, texts)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.DeleteByDocument(ctx, "doc-v1"); err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertMany(ctx, []Chunk{
		{ID: "doc-v1:0", DocumentID: "doc-v1", Title: "Pregnancy Nutrition Guide", Text: texts[0], Embedding: vectors[0], Page: 1, Version: 1},
		{ID: "doc-v1:1", DocumentID: "doc-v1", Title: "Pregnancy Nutrition Guide", Text: texts[1], Embedding: vectors[1], Page: 2, Version: 1},
	}); err != nil {
		t.Fatal(err)
	}

	query, err := embedder.Embed(ctx, []string{"folic acid neural tube pregnancy"})
	if err != nil {
		t.Fatal(err)
	}

	// Atlas Local may need a moment after the first write before search is consistent.
	var hits []ScoredChunk
	for i := 0; i < 8; i++ {
		hits, err = store.Search(ctx, query[0], 4)
		if err != nil {
			t.Fatal(err)
		}
		if len(hits) > 0 && hits[0].ID == "doc-v1:0" {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if len(hits) == 0 || hits[0].ID != "doc-v1:0" {
		t.Fatalf("expected folic-acid chunk first, got %+v", hits)
	}

	v2, err := embedder.Embed(ctx, []string{"A replacement version about iron rich foods in pregnancy."})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteByDocument(ctx, "doc-v1"); err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertMany(ctx, []Chunk{
		{ID: "doc-v1:0", DocumentID: "doc-v1", Title: "Pregnancy Nutrition Guide", Text: "iron rich foods", Embedding: v2[0], Page: 1, Version: 2},
	}); err != nil {
		t.Fatal(err)
	}
	n, err := store.CountByDocument(ctx, "doc-v1")
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("re-index should replace, found %d chunks", n)
	}

	if err := store.DeleteByDocument(ctx, "doc-v1"); err != nil {
		t.Fatal(err)
	}
	n, err = store.CountByDocument(ctx, "doc-v1")
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("delete should leave zero chunks, found %d", n)
	}
}

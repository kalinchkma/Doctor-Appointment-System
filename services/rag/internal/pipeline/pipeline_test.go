package pipeline

import (
	"context"
	"strings"
	"testing"

	"github.com/example/doctor-appointment-rag/services/rag/internal/config"
	"github.com/example/doctor-appointment-rag/services/rag/internal/llm"
	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

type emptyStore struct{}

func (emptyStore) UpsertMany(context.Context, []vectorstore.Chunk) error { return nil }
func (emptyStore) DeleteByDocument(context.Context, string) error        { return nil }
func (emptyStore) Search(context.Context, []float32, int) ([]vectorstore.ScoredChunk, error) {
	return nil, nil
}

func TestAskGreetingUsesModel(t *testing.T) {
	pipe := New(
		config.Config{MinScore: 0.5, StrongScore: 0.58, MinChunks: 1, MinCoverage: 0.25},
		emptyStore{},
		llm.FakeEmbedder{Dim: 8},
		llm.ScriptedGenerator{Response: "Hi there — ask me anything from the knowledge documents whenever you are ready."},
		nil,
	)
	got, err := pipe.Ask(context.Background(), "hello")
	if err != nil {
		t.Fatal(err)
	}
	if !got.Sufficient {
		t.Fatalf("greeting should be sufficient, got %+v", got)
	}
	if got.Reason != "greeting" {
		t.Fatalf("reason %s", got.Reason)
	}
	if !strings.Contains(strings.ToLower(got.Answer), "knowledge") {
		t.Fatalf("expected model reply, got %q", got.Answer)
	}
	if got.TopScore != 0 {
		t.Fatalf("conversational turns should not report a retrieval score, got %v", got.TopScore)
	}
}

func TestAskGreetingFallsBackWhenModelReturnsJSON(t *testing.T) {
	pipe := New(
		config.Config{},
		emptyStore{},
		llm.FakeEmbedder{Dim: 8},
		llm.ScriptedGenerator{Response: `{"sufficient":false,"answer":""}`},
		nil,
	)
	got, err := pipe.Ask(context.Background(), "hi")
	if err != nil {
		t.Fatal(err)
	}
	if !got.Sufficient || got.Answer == "" {
		t.Fatalf("expected fallback greeting, got %+v", got)
	}
}

func TestAskNonMedicalQuestionUsesKnowledgeRetrieval(t *testing.T) {
	// Previously these were classified off_topic and never searched the vector store.
	pipe := New(
		config.Config{MinScore: 0.5, StrongScore: 0.58, MinChunks: 1, MinCoverage: 0.25},
		emptyStore{},
		llm.FakeEmbedder{Dim: 8},
		llm.ScriptedGenerator{Response: `{"sufficient":false,"answer":""}`},
		nil,
	)
	got, err := pipe.Ask(context.Background(), "What is the molar mass of water?")
	if err != nil {
		t.Fatal(err)
	}
	if got.Reason == "greeting" || got.Reason == "identity" || got.Reason == "off_topic" {
		t.Fatalf("chemistry / general KB questions must hit retrieval, got reason %q", got.Reason)
	}
	if got.Sufficient {
		t.Fatalf("empty store should not invent an answer, got %+v", got)
	}
	if got.Reason != "no_results" {
		t.Fatalf("expected no_results from empty knowledge base, got %q", got.Reason)
	}
}

package intent

import (
	"strings"
	"testing"

	"github.com/example/doctor-appointment-rag/services/rag/internal/lang"
)

func TestClassifyHeuristicGreeting(t *testing.T) {
	for _, q := range []string{"hi", "Hi!", "hello", "good morning", "hey there", "thanks", "thank you", "হ্যালো", "আসসালামু আলাইকুম", "ধন্যবাদ"} {
		if got := ClassifyHeuristic(q); got != KindGreeting {
			t.Fatalf("%q => %s, want greeting", q, got)
		}
	}
}

func TestClassifyHeuristicIdentity(t *testing.T) {
	for _, q := range []string{
		"Who are you?", "what can you do", "How can you help me?", "আপনি কে", "তুমি কি করতে পারো",
		"Can you speak bangla??", "Switch to bangla", "Please reply in English",
		"Can you speak banglush?", "Reply in banglish",
	} {
		if got := ClassifyHeuristic(q); got != KindIdentity {
			t.Fatalf("%q => %s, want identity", q, got)
		}
	}
}

func TestClassifyHeuristicKnowledgeQueries(t *testing.T) {
	for _, q := range []string{
		"At what age should complementary foods start?",
		"What is the purpose of antenatal care?",
		"What is the molar mass of water?",
		"Explain covalent bonding",
		"tell me about gym",
		"What is the capital of France?",
	} {
		if got := ClassifyHeuristic(q); got != KindKnowledge {
			t.Fatalf("%q => %s, want knowledge (RAG path)", q, got)
		}
	}
}

func TestParseTriage(t *testing.T) {
	cases := map[string]Kind{
		`{"kind":"greeting"}`:                         KindGreeting,
		`{"kind":"identity"}`:                         KindIdentity,
		`{"kind":"knowledge"}`:                        KindKnowledge,
		`{"kind":"off_topic"}`:                        KindOffTopic,
		"```json\n{\"kind\":\"off_topic\"}\n```":      KindOffTopic,
		`Sure. {"kind":"knowledge","confidence":0.9}`: KindKnowledge,
	}
	for raw, want := range cases {
		got, ok := ParseTriage(raw)
		if !ok || got != want {
			t.Fatalf("%q => (%q, %v), want %q", raw, got, ok, want)
		}
	}
	if _, ok := ParseTriage(`{"kind":"unknown"}`); ok {
		t.Fatal("unknown kind should fail")
	}
}

func TestFallbackReplyBangla(t *testing.T) {
	got := FallbackReply(KindGreeting, "হ্যালো")
	if got != lang.GreetingBN {
		t.Fatalf("got %q", got)
	}
}

func TestTriageUserIncludesTitles(t *testing.T) {
	got := TriageUser("hello", []string{"ANC Handbook", "Feeding Guide"})
	for _, part := range []string{"ANC Handbook", "Feeding Guide", "hello"} {
		if !strings.Contains(got, part) {
			t.Fatalf("expected %q in triage user prompt: %s", part, got)
		}
	}
}

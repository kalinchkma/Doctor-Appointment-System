package intent

import "testing"

func TestClassifyGreeting(t *testing.T) {
	for _, q := range []string{"hi", "Hi!", "hello", "good morning", "hey there", "thanks", "thank you"} {
		if got := Classify(q); got != KindGreeting {
			t.Fatalf("%q => %s, want greeting", q, got)
		}
	}
}

func TestClassifyIdentity(t *testing.T) {
	for _, q := range []string{"Who are you?", "what can you do", "How can you help me?"} {
		if got := Classify(q); got != KindIdentity {
			t.Fatalf("%q => %s, want identity", q, got)
		}
	}
}

func TestClassifyKnowledgeQueries(t *testing.T) {
	for _, q := range []string{
		"At what age should complementary foods start?",
		"What is the purpose of antenatal care?",
		"Does energy need to double during pregnancy?",
		"What is responsive feeding?",
		"What is the molar mass of water?",
		"Explain covalent bonding",
		"tell me about gym",
		"What is the capital of France?",
		"How do I reset Windows?",
	} {
		if got := Classify(q); got != KindKnowledge {
			t.Fatalf("%q => %s, want knowledge (RAG path)", q, got)
		}
	}
}

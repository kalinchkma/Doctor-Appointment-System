package intent

import "testing"

func TestClassifyGreeting(t *testing.T) {
	for _, q := range []string{"hi", "Hi!", "hello", "good morning", "hey there"} {
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

func TestClassifyMedical(t *testing.T) {
	for _, q := range []string{
		"At what age should complementary foods start?",
		"What is the purpose of antenatal care?",
		"Does energy need to double during pregnancy?",
		"What is responsive feeding?",
	} {
		if got := Classify(q); got != KindMedical {
			t.Fatalf("%q => %s, want medical", q, got)
		}
	}
}

func TestClassifyOffTopic(t *testing.T) {
	for _, q := range []string{"tell me about gym", "What is the capital of France?", "How do I reset Windows?"} {
		if got := Classify(q); got != KindOffTopic {
			t.Fatalf("%q => %s, want off_topic", q, got)
		}
	}
}

package intent

import (
	"strings"
	"unicode"
)

// Kind is a light pre-filter for chat turns.
// Only pure greetings / identity stay conversational. Everything else goes to RAG
// against whatever documents are currently in the knowledge base.
type Kind string

const (
	KindGreeting  Kind = "greeting"
	KindIdentity  Kind = "identity"
	KindKnowledge Kind = "knowledge"
)

var greetingExact = map[string]struct{}{
	"hi": {}, "hello": {}, "hey": {}, "hiya": {}, "howdy": {},
	"good morning": {}, "good afternoon": {}, "good evening": {}, "good night": {},
	"morning": {}, "evening": {}, "yo": {}, "sup": {}, "hi there": {}, "hello there": {},
	"hey there": {}, "greetings": {},
	"thanks": {}, "thank you": {}, "thx": {}, "ok": {}, "okay": {},
	"bye": {}, "goodbye": {}, "see you": {},
}

var identityExact = []string{
	"who are you",
	"what are you",
	"whats your name",
	"what's your name",
	"what is your name",
	"tell me about yourself",
	"tell me about you",
	"introduce yourself",
	"what can you do",
	"what can you help with",
	"what can you help me with",
	"how can you help",
	"how can you help me",
}

const (
	GreetingAnswer = "Hello! I'm the your medical assistant. Ask me anything about medical stuff I will try to answer you."
	IdentityAnswer = "I'm a knowledge-base assistant for this clinic app. I answer from my clinic knowledge-base that i have — I don't diagnose or prescribe. For personal medical advice, please speak with a clinician."
)

// FallbackReply is used only when the chat model is unavailable for a conversational turn.
func FallbackReply(kind Kind) string {
	if kind == KindIdentity {
		return IdentityAnswer
	}
	return GreetingAnswer
}

// Classify detects short chitchat. Any substantive question returns KindKnowledge
// so the pipeline always retrieves from the uploaded knowledge base.
func Classify(question string) Kind {
	q := normalize(question)
	if q == "" {
		return KindGreeting
	}

	if _, ok := greetingExact[q]; ok {
		return KindGreeting
	}

	trimmedPunct := strings.TrimRightFunc(q, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r) && !unicode.IsSpace(r)
	})
	if _, ok := greetingExact[trimmedPunct]; ok {
		return KindGreeting
	}
	if strings.HasPrefix(q, "hi ") || strings.HasPrefix(q, "hello ") || strings.HasPrefix(q, "hey ") {
		rest := strings.TrimSpace(q[strings.Index(q, " ")+1:])
		if rest == "" || rest == "there" || rest == "bot" || rest == "assistant" {
			return KindGreeting
		}
	}

	for _, pattern := range identityExact {
		if q == pattern || strings.TrimRight(q, "?") == pattern {
			return KindIdentity
		}
	}

	return KindKnowledge
}

func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.Join(strings.Fields(s), " ")
	return s
}

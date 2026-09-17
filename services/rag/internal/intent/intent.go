package intent

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode"
)

// Kind is a pre-filter for chat turns before retrieval.
type Kind string

const (
	KindGreeting  Kind = "greeting"
	KindIdentity  Kind = "identity"
	KindKnowledge Kind = "knowledge"
	KindOffTopic  Kind = "off_topic"
)

const (
	GreetingAnswer = "Hello! I'm your clinic knowledge assistant. Ask me about topics covered in our uploaded healthcare documents and I will answer from those sources."
	IdentityAnswer = "I'm a knowledge-base assistant for this clinic app. I answer from documents the clinic uploaded — I don't diagnose or prescribe. For personal medical advice, please speak with a clinician."
	OffTopicAnswer = "I can only help with questions that relate to the clinic's uploaded knowledge documents. Try asking about those topics, or upload more documents in Admin if you need broader coverage."
)

// TriageSystem asks the chat model to classify a turn before retrieval.
const TriageSystem = `You are a triage classifier for a clinic knowledge assistant.
The assistant may ONLY answer from documents currently in the clinic knowledge base (titles listed by the user).
Classify the user's message as exactly one kind:

- greeting: pure hello/thanks/bye with no real question
- identity: asking who/what the assistant is or what it can do
- knowledge: a substantive question that might be answerable from the knowledge base titles/topics
- off_topic: clearly unrelated to the listed knowledge documents (e.g. sports scores, coding, unrelated trivia)

Rules:
- Prefer knowledge when unsure — retrieval will decide if evidence exists.
- Prefer off_topic only when the question clearly cannot relate to any listed document.
- Reply with ONE JSON object only, no markdown:
{"kind":"greeting"|"identity"|"knowledge"|"off_topic"}`

// FallbackReply is used when the chat model is unavailable for a conversational turn.
func FallbackReply(kind Kind) string {
	switch kind {
	case KindIdentity:
		return IdentityAnswer
	case KindOffTopic:
		return OffTopicAnswer
	default:
		return GreetingAnswer
	}
}

// TriageUser builds the classifier user prompt with optional document titles.
func TriageUser(question string, documentTitles []string) string {
	var b strings.Builder
	b.WriteString("Knowledge base document titles:\n")
	if len(documentTitles) == 0 {
		b.WriteString("(none indexed yet)\n")
	} else {
		for i, title := range documentTitles {
			if i >= 40 {
				b.WriteString("…\n")
				break
			}
			fmt.Fprintf(&b, "- %s\n", title)
		}
	}
	b.WriteString("\nMessage to classify:\n")
	b.WriteString(strings.TrimSpace(question))
	b.WriteString("\n")
	return b.String()
}

// ParseTriage extracts a Kind from a model triage response.
func ParseTriage(raw string) (Kind, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	if start := strings.Index(raw, "{"); start >= 0 {
		if end := strings.LastIndex(raw, "}"); end > start {
			raw = raw[start : end+1]
		}
	}
	var parsed struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return "", false
	}
	switch Kind(strings.ToLower(strings.TrimSpace(parsed.Kind))) {
	case KindGreeting, KindIdentity, KindKnowledge, KindOffTopic:
		return Kind(strings.ToLower(strings.TrimSpace(parsed.Kind))), true
	default:
		return "", false
	}
}

// ClassifyHeuristic is a tiny offline fallback when the triage model is unavailable.
// Prefer AI triage in the pipeline; this only covers empty / obvious chitchat.
func ClassifyHeuristic(question string) Kind {
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

	// Without the model, send everything else through retrieval.
	return KindKnowledge
}

// Classify keeps the old name for callers/tests; delegates to the heuristic fallback.
func Classify(question string) Kind {
	return ClassifyHeuristic(question)
}

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

func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.Join(strings.Fields(s), " ")
	return s
}

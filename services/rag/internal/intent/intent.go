package intent

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode"

	"github.com/example/doctor-appointment-rag/services/rag/internal/lang"
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
	GreetingAnswer = lang.GreetingEN
	IdentityAnswer = lang.IdentityEN
	OffTopicAnswer = lang.OffTopicEN
)

// TriageSystem asks the chat model to classify a turn before retrieval.
const TriageSystem = `You are a triage classifier for a clinic knowledge assistant.
The assistant may ONLY answer from documents currently in the clinic knowledge base (titles listed by the user).
Classify the user's message as exactly one kind:

- greeting: pure hello/thanks/bye with no real question
- identity: who/what the assistant is, what it can do, whether it can speak a language, or a request to switch reply language
- knowledge: a substantive question that might be answerable from the knowledge base titles/topics
- off_topic: clearly unrelated to the listed knowledge documents (e.g. sports scores, coding, unrelated trivia)

Rules:
- Prefer knowledge when unsure — retrieval will decide if evidence exists.
- Prefer off_topic only when the question clearly cannot relate to any listed document.
- "Can you speak Bangla?", "Can you speak Banglish?", "Switch to Bangla", "Reply in Banglish", "Reply in English" are identity — not knowledge and not off_topic.
- Greetings and identity may be English, Bengali script, or Banglish (হ্যালো, kemon acho, আসসালামু আলাইকুম).
- Reply with ONE JSON object only, no markdown:
{"kind":"greeting"|"identity"|"knowledge"|"off_topic"}`

// FallbackReply is used when the chat model is unavailable for a conversational turn.
func FallbackReply(kind Kind, question string) string {
	return FallbackReplyPref(kind, lang.Resolve(question, nil))
}

func FallbackReplyPref(kind Kind, pref lang.Preference) string {
	switch kind {
	case KindIdentity:
		return lang.IdentityFor(pref)
	case KindOffTopic:
		return lang.OffTopicFor(pref)
	default:
		return lang.GreetingFor(pref)
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

	if lang.IsLanguageTurn(question) {
		return KindIdentity
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
	"হ্যালো": {}, "হাই": {}, "নমস্কার": {}, "আসসালামু আলাইকুম": {}, "সালাম": {},
	"কেমন আছো": {}, "কেমন আছেন": {}, "কেমন আছ": {},
	"শুভ সকাল": {}, "শুভ সন্ধ্যা": {}, "ধন্যবাদ": {}, "আল্লাহ হাফেজ": {},
	"kemon acho": {}, "kemon achen": {}, "ki khobor": {}, "assalamualaikum": {},
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
	"তুমি কে",
	"আপনি কে",
	"তুমি কী",
	"আপনি কী",
	"তোমার নাম কি",
	"আপনার নাম কি",
	"তুমি কী করতে পারো",
	"আপনি কী করতে পারেন",
	"তুমি কি করতে পারো",
	"আপনি কি করতে পারেন",
}

func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.Join(strings.Fields(s), " ")
	return s
}

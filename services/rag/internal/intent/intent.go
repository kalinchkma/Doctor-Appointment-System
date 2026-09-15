package intent

import (
	"regexp"
	"strings"
	"unicode"
)

type Kind string

const (
	KindGreeting  Kind = "greeting"
	KindIdentity  Kind = "identity"
	KindOffTopic  Kind = "off_topic"
	KindMedical   Kind = "medical"
)

// Healthcare / maternal-child topic signals used to keep medical questions on the RAG path.
// Stem-style alternates (pregnan, nutrit, …) must NOT require a trailing \b after the group.
var medicalTerms = regexp.MustCompile(`(?i)\b(?:pregnan\w*|prenatal|antenatal|fetal|foetal|matern\w*|trimester|birth|labour|labor|breastfeed\w*|lactat\w*|infant\w*|newborn|neonat\w*|child\w*|bab(?:y|ies)|paediat\w*|pediat\w*|nutrit\w*|diet\w*|foods?|meals?|feeding|complementary|micronutrient\w*|folate|folic|iron|iodine|calcium|vitamin\w*|hydrat\w*|nausea|vomit\w*|constipat\w*|heartburn|warning|symptom\w*|vaccine\w*|infect\w*|growth|milk|honey|choking|responsive\s+feeding|doctors?|clinic\w*|healthcare|medical|medicine|drugs?|doses?|dosage|tablets?|pain|fever|diabetes|blood\s+pressure|ultrasound|energy|protein|who\s+2016|contacts?)`)

var greetingExact = map[string]struct{}{
	"hi": {}, "hello": {}, "hey": {}, "hiya": {}, "howdy": {},
	"good morning": {}, "good afternoon": {}, "good evening": {}, "good night": {},
	"morning": {}, "evening": {}, "yo": {}, "sup": {}, "hi there": {}, "hello there": {},
	"hey there": {}, "greetings": {},
}

var identityPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)^(who\s+are\s+you|what\s+are\s+you|what'?s?\s+your\s+name)\??$`),
	regexp.MustCompile(`(?i)^(tell\s+me\s+about\s+(yourself|you)|introduce\s+yourself)\??$`),
	regexp.MustCompile(`(?i)^what\s+can\s+you\s+(do|help\s+with|help\s+me\s+with)\??$`),
	regexp.MustCompile(`(?i)^how\s+can\s+you\s+help(\s+me)?\??$`),
}

const (
	GreetingAnswer = "Hello! I'm the healthcare information assistant for this clinic app. Ask me about pregnancy nutrition, prenatal care, or child nutrition from our knowledge documents."
	IdentityAnswer = "I'm a healthcare information assistant. I answer questions using the clinic's pregnancy, prenatal-care, and child-nutrition documents. I don't diagnose or prescribe — for personal medical advice, please speak with a clinician."
	OffTopicAnswer = "I can chat briefly, but I'm only intended to answer healthcare questions covered by our pregnancy, prenatal-care, and child-nutrition documents. Please ask something in that medical scope, or contact a clinician for personal advice."
)

// Classify routes short chitchat away from RAG and keeps medical questions on the retrieval path.
func Classify(question string) Kind {
	q := normalize(question)
	if q == "" {
		return KindGreeting
	}

	if _, ok := greetingExact[q]; ok {
		return KindGreeting
	}
	// "hi!" / "hello?"
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

	for _, re := range identityPatterns {
		if re.MatchString(q) {
			return KindIdentity
		}
	}

	if medicalTerms.MatchString(q) {
		return KindMedical
	}

	// Very short non-medical prompts (thanks, ok) stay conversational.
	words := strings.Fields(q)
	if len(words) <= 3 {
		switch q {
		case "thanks", "thank you", "thx", "ok", "okay", "bye", "goodbye", "see you":
			return KindGreeting
		}
	}

	return KindOffTopic
}

func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.Join(strings.Fields(s), " ")
	return s
}

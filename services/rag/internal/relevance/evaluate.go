package relevance

import (
	"strings"
	"unicode"

	"github.com/example/doctor-appointment-rag/services/rag/internal/lang"
	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

type Reason string

const (
	ReasonNone           Reason = ""
	ReasonNoResults      Reason = "no_results"
	ReasonBelowThreshold Reason = "below_threshold"
	ReasonLowCoverage    Reason = "low_coverage"
	ReasonLLMDeclined    Reason = "llm_declined"
)

type Gates struct {
	MinScore    float64
	StrongScore float64
	MinChunks   int
	MinCoverage float64
}

type Decision struct {
	Pass     bool
	Reason   Reason
	Kept     []vectorstore.ScoredChunk
	Coverage float64
	TopScore float64
}

// Evaluate applies gates 1 and 2. Gate 3 (LLM self-assessment) lives in the pipeline
// because it needs a generator. Atlas cosine scores are (1+cos)/2, so ~0.5 is orthogonal.
//
// A question passes when we have enough chunks above the floor AND either a strong
// vector hit or enough lexical overlap. High vector scores with poor lexical coverage
// stay low_coverage (assignment Test 3 — related corpus, unanswered question).
func Evaluate(chunks []vectorstore.ScoredChunk, question string, gates Gates) Decision {
	decision := Decision{Reason: ReasonNoResults}
	if len(chunks) > 0 {
		decision.TopScore = chunks[0].Score
	}

	var above []vectorstore.ScoredChunk
	for _, chunk := range chunks {
		if chunk.Score >= gates.MinScore {
			above = append(above, chunk)
		}
	}
	if len(above) == 0 {
		return decision
	}
	decision.Kept = above
	decision.TopScore = above[0].Score
	decision.Coverage = LexicalCoverage(question, above)

	strong := 0
	for _, chunk := range above {
		if chunk.Score >= gates.StrongScore {
			strong++
		}
	}

	// Bangla questions against English PDFs have no lexical overlap; a strong
	// vector hit is enough — the LLM translates from the passages.
	crossLingual := lang.CrossLingualQuestion(question)
	if !crossLingual && decision.Coverage < gates.MinCoverage && strong >= 1 {
		decision.Reason = ReasonLowCoverage
		return decision
	}
	if len(above) < gates.MinChunks {
		decision.Reason = ReasonBelowThreshold
		return decision
	}
	if strong < 1 && decision.Coverage < gates.MinCoverage {
		decision.Reason = ReasonBelowThreshold
		return decision
	}

	decision.Pass = true
	decision.Reason = ReasonNone
	return decision
}

func LexicalCoverage(question string, chunks []vectorstore.ScoredChunk) float64 {
	terms := ContentWords(question)
	if len(terms) == 0 {
		return 1
	}

	var blob strings.Builder
	for _, chunk := range chunks {
		blob.WriteString(" ")
		blob.WriteString(strings.ToLower(chunk.Text))
	}
	haystack := blob.String()

	hits := 0
	for _, term := range terms {
		if strings.Contains(haystack, term) {
			hits++
		}
	}
	return float64(hits) / float64(len(terms))
}

var stopwords = map[string]struct{}{
	"a": {}, "an": {}, "the": {}, "and": {}, "or": {}, "but": {}, "if": {}, "in": {},
	"on": {}, "at": {}, "to": {}, "for": {}, "of": {}, "as": {}, "is": {}, "are": {},
	"was": {}, "were": {}, "be": {}, "been": {}, "being": {}, "it": {}, "its": {},
	"this": {}, "that": {}, "these": {}, "those": {}, "with": {}, "from": {},
	"by": {}, "about": {}, "into": {}, "over": {}, "after": {}, "before": {},
	"what": {}, "which": {}, "who": {}, "whom": {}, "how": {}, "when": {}, "where": {},
	"why": {}, "can": {}, "could": {}, "should": {}, "would": {}, "do": {}, "does": {},
	"did": {}, "have": {}, "has": {}, "had": {}, "i": {}, "you": {}, "we": {},
	"they": {}, "me": {}, "my": {}, "your": {}, "our": {}, "please": {},
}

func ContentWords(text string) []string {
	var (
		b   strings.Builder
		out []string
	)
	flush := func() {
		word := b.String()
		b.Reset()
		if word == "" {
			return
		}
		if _, stop := stopwords[word]; stop {
			return
		}
		if len(word) < 3 {
			return
		}
		out = append(out, word)
	}
	for _, r := range strings.ToLower(text) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(r)
			continue
		}
		flush()
	}
	flush()
	return out
}

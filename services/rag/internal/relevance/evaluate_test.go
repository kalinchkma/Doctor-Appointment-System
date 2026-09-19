package relevance

import (
	"testing"

	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

func chunks(scores []float64, texts ...string) []vectorstore.ScoredChunk {
	out := make([]vectorstore.ScoredChunk, len(scores))
	for i, score := range scores {
		text := "general prenatal nutrition advice"
		if i < len(texts) {
			text = texts[i]
		}
		out[i] = vectorstore.ScoredChunk{
			Chunk: vectorstore.Chunk{ID: string(rune('a' + i)), Text: text},
			Score: score,
		}
	}
	return out
}

var gates = Gates{MinScore: 0.50, StrongScore: 0.58, MinChunks: 1, MinCoverage: 0.25}

func TestEvaluateClearlyAnswerable(t *testing.T) {
	got := Evaluate(
		chunks(
			[]float64{0.88, 0.81, 0.79, 0.76, 0.70},
			"folic acid helps the neural tube close in early pregnancy",
			"folic acid supplement is recommended in the first twelve weeks",
			"leafy greens beans and fortified cereals provide folate",
			"iron needs rise later in pregnancy",
			"hydration matters during pregnancy",
		),
		"Why is folic acid important during pregnancy?",
		gates,
	)
	if !got.Pass {
		t.Fatalf("expected sufficient, got %+v", got)
	}
}

func TestEvaluateOffDomain(t *testing.T) {
	got := Evaluate(chunks([]float64{0.31, 0.22}, "pregnancy nutrition", "child meals"), "Who won the world cup?", gates)
	if got.Pass || got.Reason != ReasonNoResults {
		t.Fatalf("off-domain should be no_results, got %+v", got)
	}
}

func TestEvaluateBelowFloor(t *testing.T) {
	got := Evaluate(chunks([]float64{0.49}, "pregnancy nutrition guide"), "What should I eat in pregnancy?", gates)
	if got.Pass || got.Reason != ReasonNoResults {
		t.Fatalf("below the score floor should be no_results, got %+v", got)
	}
}

func TestEvaluateLexicalRescue(t *testing.T) {
	got := Evaluate(
		chunks(
			[]float64{0.54, 0.53},
			"energy needs increase during pregnancy but they do not double",
			"pregnancy nutrition covers energy protein and micronutrients",
		),
		"Does energy need to double during pregnancy?",
		gates,
	)
	if !got.Pass {
		t.Fatalf("moderate scores with strong lexical coverage should pass, got %+v", got)
	}
}

func TestEvaluateModerateUnrelated(t *testing.T) {
	got := Evaluate(
		chunks([]float64{0.54, 0.53}, "clinic opening hours and parking", "staff rota for next week"),
		"Does energy need to double during pregnancy?",
		gates,
	)
	if got.Pass || got.Reason != ReasonBelowThreshold {
		t.Fatalf("moderate scores with poor coverage should be below_threshold, got %+v", got)
	}
}

func TestEvaluateRelatedTopicWrongQuestion(t *testing.T) {
	// Assignment Test 3: high embedding similarity to pregnancy material, no coverage of the answer.
	got := Evaluate(
		chunks(
			[]float64{0.81, 0.78, 0.76, 0.70},
			"eat leafy greens beans and drink water during pregnancy",
			"iron rich foods include lentils and dark green vegetables",
			"avoid unpasteurised cheese and high mercury fish",
			"this document does not contain medicine dosages",
		),
		"What paracetamol dosage is safe in the third trimester?",
		gates,
	)
	if got.Pass || got.Reason != ReasonLowCoverage {
		t.Fatalf("related-topic wrong question should be low_coverage, got %+v", got)
	}
}

func TestEvaluateBanglaQuestionStrongHitPasses(t *testing.T) {
	got := Evaluate(
		chunks(
			[]float64{0.81, 0.76},
			"eat leafy greens beans and drink water during pregnancy",
			"iron rich foods include lentils and dark green vegetables",
		),
		"গর্ভাবস্থায় কী খাওয়া উচিত?",
		gates,
	)
	if !got.Pass {
		t.Fatalf("Bangla question with a strong English hit should pass for translation, got %+v", got)
	}
}

func TestEvaluateBoundaryWithCoverage(t *testing.T) {
	got := Evaluate(
		chunks(
			[]float64{0.50, 0.50, 0.50},
			"folic acid before conception",
			"folic acid first twelve weeks",
			"folic acid neural tube",
		),
		"Why is folic acid used in pregnancy?",
		gates,
	)
	if !got.Pass {
		t.Fatalf("floor scores with lexical coverage should pass, got %+v", got)
	}
}

package llm

import (
	"context"
	"crypto/sha256"
	"math"
	"strings"
	"unicode"
)

// FakeEmbedder maps text to a deterministic bag-of-words vector so tests stay offline.
// A sentence that shares words with a chunk ranks near that chunk.
type FakeEmbedder struct {
	Dim int
}

func (f FakeEmbedder) Dimensions() int {
	if f.Dim > 0 {
		return f.Dim
	}
	return 32
}

func (f FakeEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	dim := f.Dimensions()
	out := make([][]float32, len(texts))
	for i, text := range texts {
		out[i] = hashVector(text, dim)
	}
	return out, nil
}

func hashVector(text string, dim int) []float32 {
	vec := make([]float32, dim)
	for _, word := range words(text) {
		sum := sha256.Sum256([]byte(word))
		for i := 0; i < dim; i++ {
			vec[i] += float32(sum[i%len(sum)]) / 255
		}
	}
	normalize(vec)
	return vec
}

func words(text string) []string {
	var (
		b   strings.Builder
		out []string
	)
	flush := func() {
		if b.Len() == 0 {
			return
		}
		out = append(out, b.String())
		b.Reset()
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

func normalize(vec []float32) {
	var sum float64
	for _, v := range vec {
		sum += float64(v) * float64(v)
	}
	if sum == 0 {
		return
	}
	n := float32(math.Sqrt(sum))
	for i := range vec {
		vec[i] /= n
	}
}

// ScriptedGenerator returns pre-canned completions. Used by unit tests.
// Triage prompts (system contains "triage classifier") get a synthetic JSON kind
// so pipeline tests stay offline without a real model.
type ScriptedGenerator struct {
	Response string
	Err      error
}

func (s ScriptedGenerator) Generate(_ context.Context, system, user string) (string, error) {
	if s.Err != nil {
		return "", s.Err
	}
	if strings.Contains(strings.ToLower(system), "triage classifier") {
		return scriptedTriage(user), nil
	}
	return s.Response, nil
}

func scriptedTriage(user string) string {
	msg := strings.ToLower(user)
	if i := strings.Index(msg, "message to classify:"); i >= 0 {
		msg = strings.TrimSpace(msg[i+len("message to classify:"):])
	}
	if nl := strings.IndexByte(msg, '\n'); nl >= 0 {
		msg = strings.TrimSpace(msg[:nl])
	}
	msg = strings.TrimRight(msg, "!?.")

	switch {
	case msg == "who are you",
		msg == "what can you do",
		strings.HasPrefix(msg, "how can you help"),
		strings.Contains(msg, "what can you do"),
		strings.Contains(msg, "speak bangla"),
		strings.Contains(msg, "speak bengali"),
		strings.Contains(msg, "switch to bangla"),
		strings.Contains(msg, "reply in bangla"),
		strings.Contains(msg, "talk in bangla"):
		return `{"kind":"identity"}`
	case msg == "hi", msg == "hello", msg == "hey", msg == "good morning",
		msg == "thanks", msg == "thank you", msg == "hi there", msg == "hello there":
		return `{"kind":"greeting"}`
	default:
		// Prefer knowledge so retrieval + gates decide; matches production triage bias.
		return `{"kind":"knowledge"}`
	}
}

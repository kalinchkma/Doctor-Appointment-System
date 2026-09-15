package ingestion

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSplitEmpty(t *testing.T) {
	if got := Split("", DefaultTarget, DefaultOverlap, DefaultMin); len(got) != 0 {
		t.Fatalf("empty input: got %d chunks", len(got))
	}
}

func TestSplitShorterThanMin(t *testing.T) {
	if got := Split("too short", 1000, 150, 100); len(got) != 0 {
		t.Fatalf("short input should be dropped, got %#v", got)
	}
}

func TestSplitExactTarget(t *testing.T) {
	text := strings.Repeat("a", 200)
	got := Split(text, 200, 20, 50)
	if len(got) != 1 {
		t.Fatalf("exact target: got %d chunks", len(got))
	}
}

func TestSplitOverlapAndCount(t *testing.T) {
	var b strings.Builder
	for i := 0; i < 20; i++ {
		b.WriteString("This is a complete sentence about prenatal nutrition and iron rich foods. ")
	}
	text := b.String()
	got := Split(text, 180, 40, 40)
	if len(got) < 2 {
		t.Fatalf("expected multiple chunks, got %d", len(got))
	}
	first := []rune(got[0])
	second := []rune(got[1])
	overlap := string(first[len(first)-20:])
	if !strings.Contains(string(second), overlap[:10]) {
		t.Fatalf("consecutive chunks should share an overlap window")
	}
}

func TestSplitPrefersSentenceBoundary(t *testing.T) {
	text := strings.Repeat("word ", 30) + "End of sentence. " + strings.Repeat("word ", 40)
	got := Split(text, 160, 20, 20)
	if len(got) == 0 {
		t.Fatal("expected chunks")
	}
	if !strings.HasSuffix(strings.TrimSpace(got[0]), ".") {
		t.Fatalf("first chunk should end on a sentence boundary, got %q", got[0][len(got[0])-20:])
	}
}

func TestSplitDoesNotSplitUTF8Rune(t *testing.T) {
	text := strings.Repeat("健康营养指南。", 80)
	got := Split(text, 60, 10, 10)
	if len(got) < 2 {
		t.Fatalf("expected multiple CJK chunks, got %d", len(got))
	}
	for _, chunk := range got {
		if !utf8.ValidString(chunk) {
			t.Fatalf("invalid utf8 in chunk %q", chunk)
		}
	}
}

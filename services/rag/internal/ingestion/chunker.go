package ingestion

import (
	"strings"
	"unicode"
)

const (
	DefaultTarget  = 1000
	DefaultOverlap = 150
	DefaultMin     = 100
)

// Chunk is a retrieval unit. Page is recorded so answers can cite a source page.
type Chunk struct {
	Text       string
	Page       int
	ChunkIndex int
}

// SplitPages chunks each cleaned page independently so page numbers stay accurate.
func SplitPages(pages []string) []Chunk {
	return SplitPagesSized(pages, DefaultTarget, DefaultOverlap, DefaultMin)
}

func SplitPagesSized(pages []string, target, overlap, min int) []Chunk {
	var out []Chunk
	index := 0
	for pageNum, page := range pages {
		parts := Split(page, target, overlap, min)
		for _, part := range parts {
			out = append(out, Chunk{Text: part, Page: pageNum + 1, ChunkIndex: index})
			index++
		}
	}
	return out
}

// Split recursively prefers paragraph, then sentence, then word boundaries.
// A sentence boundary within 20% of the target wins over a mid-sentence cut.
// Multi-byte runes are never split: the walker operates on []rune.
func Split(text string, target, overlap, min int) []string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) < min {
		return nil
	}
	if len(runes) <= target {
		return []string{string(runes)}
	}

	var out []string
	start := 0
	for start < len(runes) {
		remaining := runes[start:]
		if len(remaining) <= target {
			if trimmed := strings.TrimSpace(string(remaining)); runeLen(trimmed) >= min {
				out = append(out, trimmed)
			}
			break
		}

		cut := findCut(remaining, target)
		chunk := strings.TrimSpace(string(remaining[:cut]))
		if runeLen(chunk) >= min {
			out = append(out, chunk)
		}

		advance := cut - overlap
		if advance < 1 {
			advance = cut
		}
		start += advance
	}
	return out
}

func findCut(window []rune, target int) int {
	hi := min(len(window), int(float64(target)*1.2))
	lo := int(float64(target) * 0.8)
	if lo < 1 {
		lo = 1
	}

	for i := hi - 1; i >= lo; i-- {
		if window[i] == '.' && (i+1 == len(window) || unicode.IsSpace(window[i+1])) {
			return i + 1
		}
	}
	limit := min(target, len(window)-1)
	for i := limit; i >= lo; i-- {
		if unicode.IsSpace(window[i]) {
			return i
		}
	}
	return min(target, len(window))
}

func runeLen(s string) int { return len([]rune(s)) }

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

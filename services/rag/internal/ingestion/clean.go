package ingestion

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	hyphenBreak = regexp.MustCompile(`(\p{L})-\n(\p{L})`)
	spaces      = regexp.MustCompile(`[^\S\n]+`)
	blankLines  = regexp.MustCompile(`\n{3,}`)
)

// CleanPage normalises extracted PDF text: de-hyphenates wrapped words, collapses
// horizontal whitespace, and drops pages that are effectively empty.
func CleanPage(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	text = hyphenBreak.ReplaceAllString(text, "$1$2")

	lines := strings.Split(text, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(spaces.ReplaceAllString(line, " "))
		if isRepeatedHeader(line) {
			continue
		}
		kept = append(kept, line)
	}

	text = strings.Join(kept, "\n")
	text = blankLines.ReplaceAllString(text, "\n\n")
	return strings.TrimSpace(text)
}

func isRepeatedHeader(line string) bool {
	if line == "" {
		return false
	}
	letters := 0
	for _, r := range line {
		if unicode.IsLetter(r) {
			letters++
		}
	}
	// Page numbers and running headers are almost never useful retrieval units.
	return letters < 4 && len([]rune(line)) < 24
}

func AlmostEmpty(text string) bool {
	letters := 0
	for _, r := range text {
		if unicode.IsLetter(r) {
			letters++
		}
	}
	return letters < 40
}

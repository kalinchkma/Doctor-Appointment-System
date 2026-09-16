package ingestion

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/ledongthuc/pdf"
)

// ExtractPDF returns cleaned per-page text from a PDF. Pages with almost no letters
// (cover art, image-only sheets) are dropped.
func ExtractPDF(data []byte) ([]string, error) {
	reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("open pdf: %w", err)
	}

	totalPages := reader.NumPage()
	pages := make([]string, 0, totalPages)
	skippedEmpty := 0
	for i := 1; i <= totalPages; i++ {
		page := reader.Page(i)
		if page.V.IsNull() {
			skippedEmpty++
			continue
		}
		raw, err := page.GetPlainText(nil)
		if err != nil {
			return nil, fmt.Errorf("extract page %d: %w", i, err)
		}
		cleaned := CleanPage(raw)
		if AlmostEmpty(cleaned) {
			skippedEmpty++
			continue
		}
		pages = append(pages, cleaned)
	}

	if len(pages) == 0 {
		return nil, fmt.Errorf(
			"pdf contained no extractable text (%d pages scanned, %d empty/image-only) — scanned/image-only PDFs need OCR before upload",
			totalPages,
			skippedEmpty,
		)
	}
	return pages, nil
}

// JoinPages is used by tests that want the full document as one string.
func JoinPages(pages []string) string {
	return strings.Join(pages, "\n\n")
}

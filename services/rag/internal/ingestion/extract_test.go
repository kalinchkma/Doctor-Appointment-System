package ingestion

import (
	"bytes"
	"strings"
	"testing"
)

func TestExtractPDFFindsKnownText(t *testing.T) {
	var buf bytes.Buffer
	err := WritePlainPDF(&buf, "Pregnancy Nutrition Guide", []string{
		"Folic acid is important before conception and in the first twelve weeks.",
		"This run-\nning header should be rejoined so folic-acid appears as one token.",
		"xx",
	})
	if err != nil {
		t.Fatal(err)
	}

	pages, err := ExtractPDF(buf.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	joined := JoinPages(pages)
	if !strings.Contains(joined, "Folic acid is important") {
		t.Fatalf("missing known sentence: %q", joined)
	}
	if strings.Contains(joined, "run-\nning") {
		t.Fatalf("hyphenated wrap was not rejoined: %q", joined)
	}
}

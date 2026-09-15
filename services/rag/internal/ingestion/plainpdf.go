package ingestion

import (
	"fmt"
	"io"
	"strings"
)

// WritePlainPDF writes a single-page Type1 PDF that ledongthuc/pdf can extract.
// Used for fixtures and the committed knowledge documents — no CGO, no extra tool.
func WritePlainPDF(w io.Writer, title string, paragraphs []string) error {
	escapedTitle := pdfEscape(title)
	var content strings.Builder
	content.WriteString("BT\n/F1 16 Tf\n72 720 Td\n(")
	content.WriteString(escapedTitle)
	content.WriteString(") Tj\n/F1 11 Tf\n0 -28 Td\n")

	for i, para := range paragraphs {
		for _, line := range wrapPDFLine(para, 86) {
			content.WriteString("(")
			content.WriteString(pdfEscape(line))
			content.WriteString(") Tj\n0 -16 Td\n")
		}
		if i < len(paragraphs)-1 {
			content.WriteString("0 -10 Td\n")
		}
	}
	content.WriteString("ET\n")

	stream := content.String()
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}

	var buf strings.Builder
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects)+1)
	for i, obj := range objects {
		offsets[i+1] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", i+1, obj)
	}
	xref := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for i := 1; i <= len(objects); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)

	_, err := io.WriteString(w, buf.String())
	return err
}

func pdfEscape(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "(", "\\(")
	s = strings.ReplaceAll(s, ")", "\\)")
	return s
}

func wrapPDFLine(text string, width int) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	var (
		lines []string
		cur   strings.Builder
	)
	for _, word := range words {
		if cur.Len() == 0 {
			cur.WriteString(word)
			continue
		}
		if cur.Len()+1+len(word) > width {
			lines = append(lines, cur.String())
			cur.Reset()
			cur.WriteString(word)
			continue
		}
		cur.WriteByte(' ')
		cur.WriteString(word)
	}
	if cur.Len() > 0 {
		lines = append(lines, cur.String())
	}
	return lines
}

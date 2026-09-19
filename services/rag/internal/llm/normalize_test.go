package llm

import (
	"testing"

	"github.com/example/doctor-appointment-rag/services/rag/internal/lang"
)

func TestParseNormalizedQuery(t *testing.T) {
	got, ok := ParseNormalizedQuery(`{"language":"banglish","english":"From what month can I start solids?"}`)
	if !ok || got.Language != "banglish" || got.English == "" {
		t.Fatalf("got %+v ok=%v", got, ok)
	}
}

func TestPreferenceFromDetect(t *testing.T) {
	if PreferenceFromDetect("banglish", lang.Follow).Code != "bn" {
		t.Fatal("banglish questions should be answered in Bangla script")
	}
	if PreferenceFromDetect("bn", lang.Follow).Code != "bn" {
		t.Fatal("bn should map to Bengali")
	}
}

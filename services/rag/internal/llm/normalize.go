package llm

import (
	"encoding/json"
	"strings"

	"github.com/example/doctor-appointment-rag/services/rag/internal/lang"
)

// NormalizeSystem asks the chat model to detect language and rewrite the
// question in English so retrieval can hit an English knowledge base.
const NormalizeSystem = `You prepare clinic-chat questions for English knowledge-base search.
Detect the user's language:
- en: English
- bn: Bengali written in Bengali script
- banglish: Bangla written in English/Latin letters (romanized), e.g. "bachchake koy maash theke solid deya shuru korbo"
Then rewrite the question as clear English for search. Keep the medical meaning. Do not answer it.
The assistant will answer Banglish questions in Bengali script, not romanized Banglish.
Reply with ONE JSON object only:
{"language":"en"|"bn"|"banglish","english":"..."}
If the question is already English, copy it into english.`

type NormalizedQuery struct {
	Language string
	English  string
}

func NormalizeUser(question string) string {
	return "Question to normalize:\n" + strings.TrimSpace(question) + "\n"
}

func ParseNormalizedQuery(raw string) (NormalizedQuery, bool) {
	raw = extractJSON(raw)
	if raw == "" {
		return NormalizedQuery{}, false
	}
	var parsed struct {
		Language string `json:"language"`
		English  string `json:"english"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return NormalizedQuery{}, false
	}
	english := strings.TrimSpace(parsed.English)
	if english == "" {
		return NormalizedQuery{}, false
	}
	return NormalizedQuery{
		Language: strings.ToLower(strings.TrimSpace(parsed.Language)),
		English:  english,
	}, true
}

func PreferenceFromDetect(code string, fallback lang.Preference) lang.Preference {
	switch strings.ToLower(strings.TrimSpace(code)) {
	case "bn", "bangla", "bengali":
		return lang.Bengali
	case "bl", "banglish", "banglush":
		// Search used English; the user still gets a Bangla-script reply.
		return lang.Bengali
	case "en", "english":
		if fallback.Code != "" {
			return fallback
		}
		return lang.English
	default:
		return fallback
	}
}

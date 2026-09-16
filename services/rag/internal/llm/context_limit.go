package llm

import "github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"

// MaxContextChunks limits how many retrieval hits are sent to the chat model.
// More passages inflate latency on local models without improving grounding much.
const MaxContextChunks = 4

// MaxPassageRunes trims each passage in the prompt so token count stays bounded.
const MaxPassageRunes = 700

// LimitContextChunks keeps the highest-ranked passages only.
func LimitContextChunks(chunks []vectorstore.ScoredChunk) []vectorstore.ScoredChunk {
	if len(chunks) <= MaxContextChunks {
		return chunks
	}
	return chunks[:MaxContextChunks]
}

func trimRunes(text string, max int) string {
	runes := []rune(text)
	if max < 1 || len(runes) <= max {
		return text
	}
	return string(runes[:max]) + "..."
}

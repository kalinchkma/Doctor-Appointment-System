package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"

	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

// New exposes only compose-network endpoints. Payload authenticates each call with RAG_INTERNAL_SECRET.
func New(store *vectorstore.Store, secret string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, http.StatusOK, map[string]string{"status": "ok"}) })
	mux.Handle("POST /internal/v1/documents/sync", internal(secret, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The future ingestion pipeline will download the Payload-managed file, extract text,
		// embed chunks, then call store.Upsert. Keeping this boundary now avoids exposing RAG publicly.
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted", "message": "ingestion pipeline scaffolded"})
	})))
	mux.Handle("POST /internal/v1/chat", internal(secret, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Retrieval and grounded LLM generation belong here. Return an explicit safe fallback until configured.
		writeJSON(w, http.StatusNotImplemented, map[string]string{"answer": "The RAG retrieval pipeline has not been configured yet."})
	})))
	return mux
}
func internal(secret string, next http.Handler) http.Handler { return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-RAG-Internal-Secret")), []byte(secret)) != 1 { writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"}); return }; next.ServeHTTP(w, r) }) }
func writeJSON(w http.ResponseWriter, code int, body any) { w.Header().Set("Content-Type", "application/json"); w.WriteHeader(code); _ = json.NewEncoder(w).Encode(body) }

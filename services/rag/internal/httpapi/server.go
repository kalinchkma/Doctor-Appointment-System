package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/example/doctor-appointment-rag/services/rag/internal/config"
	"github.com/example/doctor-appointment-rag/services/rag/internal/llm"
	"github.com/example/doctor-appointment-rag/services/rag/internal/pipeline"
)

type Server struct {
	pipe          *pipeline.Pipeline
	secret        string
	slots         chan struct{}
	chatTimeout   time.Duration
	ingestTimeout time.Duration
}

func New(cfg config.Config, pipe *pipeline.Pipeline) http.Handler {
	ingestSec := cfg.IngestTimeoutSec
	if ingestSec < 60 {
		ingestSec = 60
	}

	s := &Server{
		pipe:          pipe,
		secret:        cfg.InternalSecret,
		slots:         make(chan struct{}, cfg.MaxConcurrency),
		chatTimeout:   time.Duration(cfg.ChatTimeoutSec) * time.Second,
		ingestTimeout: time.Duration(ingestSec) * time.Second,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.Handle("POST /internal/v1/documents/sync", s.internal(s.syncDocument))
	mux.Handle("DELETE /internal/v1/documents/{id}", s.internal(s.deleteDocument))
	mux.Handle("POST /internal/v1/chat", s.internal(s.chat))
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) syncDocument(w http.ResponseWriter, r *http.Request) {
	var req pipeline.SyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if req.DocumentID == "" || req.FileURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "documentId and fileUrl are required"})
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), s.ingestTimeout)
		defer cancel()

		slog.Info("ingest started",
			"documentId", req.DocumentID,
			"title", req.Title,
			"timeout", s.ingestTimeout.String(),
		)

		if err := s.pipe.IngestURL(ctx, req); err != nil {
			slog.Error("ingest failed", "documentId", req.DocumentID, "error", err)
			// Detach from the ingest deadline so Payload still learns the failure.
			s.reportStatusDetached(req.DocumentID, "failed", safeError(err))
			return
		}
		s.reportStatusDetached(req.DocumentID, "indexed", "")
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

func (s *Server) reportStatusDetached(documentID, status, indexError string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	s.pipe.ReportStatus(ctx, documentID, status, indexError)
}

func (s *Server) deleteDocument(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "document id is required"})
		return
	}
	if err := s.pipe.Delete(r.Context(), id); err != nil {
		slog.Error("delete vectors failed", "documentId", id, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) chat(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), s.chatTimeout)
	defer cancel()

	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	case <-ctx.Done():
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "The assistant is busy. Please try again.",
		})
		return
	}

	var body struct {
		Question string `json:"question"`
		History  []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"history"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Question) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "question is required"})
		return
	}

	history := make([]llm.HistoryTurn, 0, len(body.History))
	for _, turn := range body.History {
		role := strings.ToLower(strings.TrimSpace(turn.Role))
		content := strings.TrimSpace(turn.Content)
		if content == "" {
			continue
		}
		if role != "user" && role != "assistant" {
			role = "user"
		}
		history = append(history, llm.HistoryTurn{Role: role, Content: content})
	}

	result, err := s.pipe.Ask(ctx, body.Question, history...)
	if err != nil {
		slog.Error("chat failed", "error", err, "requestId", r.Header.Get("X-Request-Id"), "question", body.Question)
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			writeJSON(w, http.StatusGatewayTimeout, map[string]string{
				"error": "The assistant is temporarily unavailable. Please try again.",
			})
			return
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error": "The assistant is temporarily unavailable. Please try again.",
		})
		return
	}
	slog.Info("chat response",
		"requestId", r.Header.Get("X-Request-Id"),
		"sufficient", result.Sufficient,
		"reason", result.Reason,
		"topScore", result.TopScore,
		"sources", len(result.Sources),
	)
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) internal(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provided := r.Header.Get("X-RAG-Internal-Secret")
		if subtle.ConstantTimeCompare([]byte(provided), []byte(s.secret)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("write response", "error", err)
	}
}

func safeError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	msg = strings.ReplaceAll(msg, "sk-", "[redacted]")
	if len(msg) > 300 {
		return msg[:300]
	}
	return msg
}

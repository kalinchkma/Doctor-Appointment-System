package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/example/doctor-appointment-rag/services/rag/internal/httpapi"
	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

func main() {
	port := value("PORT", "8080")
	store, err := vectorstore.New(context.Background(), value("RAG_DATABASE_URI", "mongodb://127.0.0.1:27017/rag_vectors"), value("RAG_DATABASE_NAME", "rag_vectors"))
	if err != nil { slog.Error("MongoDB connection failed", "error", err); os.Exit(1) }
	defer store.Close(context.Background())

	server := &http.Server{Addr: ":" + port, Handler: httpapi.New(store, value("RAG_INTERNAL_SECRET", "development-internal-secret")), ReadHeaderTimeout: 5 * time.Second}
	go func() { slog.Info("RAG service listening", "port", port); if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed { slog.Error("server stopped", "error", err); os.Exit(1) } }()
	signals := make(chan os.Signal, 1); signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM); <-signals
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second); defer cancel(); _ = server.Shutdown(ctx)
}
func value(key, fallback string) string { if v := os.Getenv(key); v != "" { return v }; return fallback }

package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/example/doctor-appointment-rag/services/rag/internal/config"
	"github.com/example/doctor-appointment-rag/services/rag/internal/httpapi"
	"github.com/example/doctor-appointment-rag/services/rag/internal/llm"
	"github.com/example/doctor-appointment-rag/services/rag/internal/pipeline"
	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe the local /healthz endpoint and exit")
	ingestDir := flag.String("ingest", "", "ingest every PDF in this directory and exit")
	flag.Parse()

	cfg, err := config.FromEnv()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	// The distroless image has no shell, so Docker's HEALTHCHECK re-executes this
	// binary in probe mode instead of running curl or wget.
	if *healthcheck {
		os.Exit(probe(cfg.Port))
	}

	if *ingestDir != "" {
		if err := ingestFromDir(cfg, *ingestDir); err != nil {
			slog.Error("ingest failed", "error", err)
			os.Exit(1)
		}
		return
	}

	if err := run(cfg); err != nil {
		slog.Error("rag service stopped", "error", err)
		os.Exit(1)
	}
}

func run(cfg config.Config) error {
	ctx := context.Background()
	cfg = withPayloadSettings(ctx, cfg)

	store, err := vectorstore.New(ctx, cfg.DatabaseURI, cfg.DatabaseName, cfg.EmbedDimensions)
	if err != nil {
		return fmt.Errorf("connect to MongoDB: %w", err)
	}
	defer func() { _ = store.Close(ctx) }()

	// Block until the Atlas vector index is READY. Without it, $vectorSearch returns
	// zero hits and every medical question falls through to the insufficient fallback.
	indexCtx, cancelIndex := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancelIndex()
	if err := store.EnsureSearchIndex(indexCtx); err != nil {
		return fmt.Errorf("vector search index: %w", err)
	}
	slog.Info("vector search index ready", "name", vectorstore.SearchIndexName, "dimensions", cfg.EmbedDimensions)

	proxy := llm.NewProxy(cfg.PayloadURL, cfg.InternalSecret, cfg.EmbedDimensions)
	pipe := pipeline.New(cfg, store, proxy, proxy, pipeline.PayloadCallback(cfg.PayloadURL, cfg.InternalSecret))

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.New(cfg, pipe),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errs := make(chan error, 1)
	go func() {
		slog.Info("rag service listening", "port", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errs <- err
		}
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errs:
		return err
	case <-signals:
		slog.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}

func withPayloadSettings(ctx context.Context, cfg config.Config) config.Config {
	settings, err := llm.FetchSettings(ctx, cfg.PayloadURL, cfg.InternalSecret)
	if err != nil {
		slog.Warn("RAG settings unavailable; using process defaults until Payload is reachable", "error", err)
		return cfg
	}
	cfg.Apply(settings.EmbedDimensions, settings.MaxConcurrency, settings.MinChunks, settings.MinScore, settings.StrongScore, settings.MinCoverage)
	slog.Info("loaded RAG settings from Payload", "chat", settings.ChatProvider+"/"+settings.ChatModel, "embed", settings.EmbedProvider+"/"+settings.EmbedModel, "dimensions", cfg.EmbedDimensions)
	return cfg
}

func ingestFromDir(cfg config.Config, dir string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	cfg = withPayloadSettings(ctx, cfg)

	store, err := vectorstore.New(ctx, cfg.DatabaseURI, cfg.DatabaseName, cfg.EmbedDimensions)
	if err != nil {
		return err
	}
	defer func() { _ = store.Close(ctx) }()

	if err := store.EnsureSearchIndex(ctx); err != nil {
		return err
	}

	embedder := llm.NewProxy(cfg.PayloadURL, cfg.InternalSecret, cfg.EmbedDimensions)
	pipe := pipeline.New(cfg, store, embedder, nil, nil)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read %s: %w", dir, err)
	}

	ingested := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".pdf") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		data, err := os.ReadFile(path) //nolint:gosec // operator-supplied path
		if err != nil {
			return err
		}
		id := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		title := strings.ReplaceAll(id, "-", " ")
		if err := pipe.IngestBytes(ctx, pipeline.SyncRequest{
			DocumentID: id,
			Version:    1,
			Title:      title,
		}, data); err != nil {
			return fmt.Errorf("%s: %w", entry.Name(), err)
		}
		ingested++
	}
	if ingested == 0 {
		return fmt.Errorf("no PDF files found in %s", dir)
	}
	slog.Info("ingest complete", "files", ingested, "dir", dir)
	return nil
}

func probe(port string) int {
	client := &http.Client{Timeout: 3 * time.Second}

	response, err := client.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		return 1
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

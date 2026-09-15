package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/example/doctor-appointment-rag/services/rag/internal/config"
	"github.com/example/doctor-appointment-rag/services/rag/internal/llm"
	"github.com/example/doctor-appointment-rag/services/rag/internal/pipeline"
	"github.com/example/doctor-appointment-rag/services/rag/internal/vectorstore"
)

func main() {
	dir := flag.String("dir", "./docs/knowledge", "directory of PDF files to ingest")
	flag.Parse()

	cfg, err := config.FromEnv()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := run(ctx, cfg, *dir); err != nil {
		slog.Error("ingest failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, cfg config.Config, dir string) error {
	if settings, err := llm.FetchSettings(ctx, cfg.PayloadURL, cfg.InternalSecret); err == nil {
		cfg.Apply(settings.EmbedDimensions, settings.MaxConcurrency, settings.MinChunks, settings.MinScore, settings.StrongScore, settings.MinCoverage)
	}

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

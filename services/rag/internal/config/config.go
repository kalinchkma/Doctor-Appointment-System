package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config is process-level wiring (Mongo, Payload URL, the shared internal secret).
// Chat/embedding provider, model, and API keys live in the Payload RAG Settings global.
type Config struct {
	Port             string
	DatabaseURI      string
	DatabaseName     string
	InternalSecret   string
	PayloadURL       string
	MaxConcurrency   int
	MinScore         float64
	StrongScore      float64
	MinChunks        int
	MinCoverage      float64
	EmbedDimensions  int
	IngestTimeoutSec int
	ChatTimeoutSec   int
}

func FromEnv() (Config, error) {
	cfg := Config{
		Port:             env("PORT", "8080"),
		DatabaseURI:      env("RAG_DATABASE_URI", "mongodb://127.0.0.1:27017/rag_vectors"),
		DatabaseName:     env("RAG_DATABASE_NAME", "rag_vectors"),
		InternalSecret:   env("RAG_INTERNAL_SECRET", "development-internal-secret"),
		PayloadURL:       strings.TrimRight(env("PAYLOAD_INTERNAL_URL", "http://127.0.0.1:3000"), "/"),
		MaxConcurrency:   envInt("RAG_MAX_CONCURRENCY", 4),
		MinScore:         envFloat("RAG_MIN_SCORE", 0.62),
		StrongScore:      envFloat("RAG_STRONG_SCORE", 0.74),
		MinChunks:        envInt("RAG_MIN_CHUNKS", 2),
		MinCoverage:      envFloat("RAG_MIN_COVERAGE", 0.25),
		EmbedDimensions:  envInt("EMBEDDING_DIMENSIONS", 768),
		IngestTimeoutSec: envInt("RAG_INGEST_TIMEOUT_SEC", 120),
		// 60s leaves headroom for a cold Ollama model load after retrieval.
		ChatTimeoutSec:   envInt("RAG_CHAT_TIMEOUT_SEC", 60),
	}

	if cfg.EmbedDimensions < 8 {
		return Config{}, fmt.Errorf("EMBEDDING_DIMENSIONS must be at least 8, got %d", cfg.EmbedDimensions)
	}
	if cfg.MaxConcurrency < 1 {
		cfg.MaxConcurrency = 1
	}
	return cfg, nil
}

// Apply overlays live values from the Payload RAG Settings global.
func (c *Config) Apply(embedDimensions, maxConcurrency, minChunks int, minScore, strongScore, minCoverage float64) {
	if embedDimensions >= 8 {
		c.EmbedDimensions = embedDimensions
	}
	if maxConcurrency >= 1 {
		c.MaxConcurrency = maxConcurrency
	}
	if minChunks >= 1 {
		c.MinChunks = minChunks
	}
	if minScore > 0 {
		c.MinScore = minScore
	}
	if strongScore > 0 {
		c.StrongScore = strongScore
	}
	if minCoverage > 0 {
		c.MinCoverage = minCoverage
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func envFloat(key string, fallback float64) float64 {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	return value
}

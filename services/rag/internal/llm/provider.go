package llm

import "context"

// Embedder turns text into vectors. Ingestion and query must share one implementation
// and one model: mixing models produces an incompatible vector space.
type Embedder interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
	Dimensions() int
}

// Generator produces a single completion from a system + user prompt.
type Generator interface {
	Generate(ctx context.Context, system, user string) (string, error)
}

package vectorstore

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// SearchIndexName is the Atlas Vector Search index over Chunk.Embedding.
const SearchIndexName = "knowledge_vector_index"

// Chunk is one embedded passage of a knowledge document. Page and Version exist so an
// answer can cite its source and so re-indexing a document can replace exactly the
// vectors that belong to it (ADR-010).
type Chunk struct {
	ID         string    `bson:"chunkId"      json:"id"`
	DocumentID string    `bson:"documentId"   json:"documentId"`
	Title      string    `bson:"title"        json:"title"`
	Text       string    `bson:"text"         json:"text"`
	Embedding  []float32 `bson:"embedding"    json:"-"`
	Source     string    `bson:"source"       json:"source"`
	Page       int       `bson:"page"         json:"page"`
	ChunkIndex int       `bson:"chunkIndex"   json:"chunkIndex"`
	Version    int       `bson:"version"      json:"version"`
}

// ScoredChunk is a retrieval hit. Score is Atlas's (1+cos)/2 normalisation.
type ScoredChunk struct {
	Chunk
	Score float64 `bson:"score" json:"score"`
}

type Store struct {
	client     *mongo.Client
	chunks     *mongo.Collection
	dimensions int
}

func New(ctx context.Context, uri, databaseName string, dimensions int) (*Store, error) {
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}

	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, fmt.Errorf("ping MongoDB: %w", err)
	}

	return &Store{
		client:     client,
		chunks:     client.Database(databaseName).Collection("knowledge_chunks"),
		dimensions: dimensions,
	}, nil
}

func (s *Store) Close(ctx context.Context) error {
	return s.client.Disconnect(ctx)
}

func (s *Store) Dimensions() int { return s.dimensions }

func (s *Store) Upsert(ctx context.Context, chunk Chunk) error {
	return s.UpsertMany(ctx, []Chunk{chunk})
}

func (s *Store) UpsertMany(ctx context.Context, chunks []Chunk) error {
	if len(chunks) == 0 {
		return nil
	}

	models := make([]mongo.WriteModel, 0, len(chunks))
	for _, chunk := range chunks {
		models = append(models, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"chunkId": chunk.ID}).
			SetUpdate(bson.M{"$set": chunk}).
			SetUpsert(true))
	}

	if _, err := s.chunks.BulkWrite(ctx, models); err != nil {
		return fmt.Errorf("upsert chunks: %w", err)
	}
	return nil
}

func (s *Store) DeleteByDocument(ctx context.Context, documentID string) error {
	if _, err := s.chunks.DeleteMany(ctx, bson.M{"documentId": documentID}); err != nil {
		return fmt.Errorf("delete document %s: %w", documentID, err)
	}
	return nil
}

func (s *Store) CountByDocument(ctx context.Context, documentID string) (int64, error) {
	n, err := s.chunks.CountDocuments(ctx, bson.M{"documentId": documentID})
	if err != nil {
		return 0, err
	}
	return n, nil
}

func (s *Store) Search(ctx context.Context, embedding []float32, limit int) ([]ScoredChunk, error) {
	if limit < 1 {
		limit = 6
	}

	pipeline := mongo.Pipeline{
		bson.D{{Key: "$vectorSearch", Value: bson.D{
			{Key: "index", Value: SearchIndexName},
			{Key: "path", Value: "embedding"},
			{Key: "queryVector", Value: floats64(embedding)},
			{Key: "numCandidates", Value: 100},
			{Key: "limit", Value: limit},
		}}},
		bson.D{{Key: "$project", Value: bson.D{
			{Key: "chunkId", Value: 1},
			{Key: "documentId", Value: 1},
			{Key: "title", Value: 1},
			{Key: "text", Value: 1},
			{Key: "source", Value: 1},
			{Key: "page", Value: 1},
			{Key: "chunkIndex", Value: 1},
			{Key: "version", Value: 1},
			{Key: "score", Value: bson.D{{Key: "$meta", Value: "vectorSearchScore"}}},
		}}},
	}

	cursor, err := s.chunks.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("vector search: %w", err)
	}
	defer func() { _ = cursor.Close(ctx) }()

	var hits []ScoredChunk
	if err := cursor.All(ctx, &hits); err != nil {
		return nil, fmt.Errorf("decode search hits: %w", err)
	}
	return hits, nil
}

type searchIndexView struct {
	Name             string `bson:"name"`
	Status           string `bson:"status"`
	LatestDefinition struct {
		Fields []struct {
			Type          string `bson:"type"`
			Path          string `bson:"path"`
			NumDimensions int    `bson:"numDimensions"`
		} `bson:"fields"`
	} `bson:"latestDefinition"`
}

// ensureCollection creates the collection explicitly if it does not yet exist.
// MongoDB (including Atlas Local) only creates a collection on first document write, but
// the Atlas Search index API requires the collection to already exist before CreateOne can
// succeed. Calling CreateCollection on an existing collection is a no-op (CommandNotFound /
// NamespaceExists is silently swallowed).
func (s *Store) ensureCollection(ctx context.Context) error {
	err := s.chunks.Database().CreateCollection(ctx, s.chunks.Name())
	if err == nil {
		return nil
	}
	// "already exists" is not an error we care about.
	if cmdErr, ok := err.(mongo.CommandError); ok && cmdErr.Code == 48 /* NamespaceExists */ {
		return nil
	}
	return fmt.Errorf("create collection %s: %w", s.chunks.Name(), err)
}

// EnsureSearchIndex creates knowledge_vector_index if missing and waits until READY.
// If an existing index has a different dimension count, it fails rather than silently
// mixing incompatible embeddings.
//
// Atlas Local runs a mongot sidecar for search index management that starts a few
// seconds after mongod is healthy. Any SearchIndexes() call during that window returns
// "Error connecting to Search Index Management service". This function retries the
// entire setup loop (with a 5-second back-off) until the context deadline so transient
// mongot startup errors don't permanently fail the index setup.
func (s *Store) EnsureSearchIndex(ctx context.Context) error {
	// The Atlas Search index API requires the collection to exist before CreateOne is
	// called. On a fresh deployment the collection hasn't been written to yet, so we
	// create it explicitly to avoid a NamespaceNotFound error.
	if err := s.ensureCollection(ctx); err != nil {
		return err
	}

	for {
		err := s.ensureSearchIndexOnce(ctx)
		if err == nil {
			return nil
		}
		// Retry transient mongot "not yet ready" errors.
		if strings.Contains(err.Error(), "Search Index Management") ||
			strings.Contains(err.Error(), "connecting to Search Index") {
			select {
			case <-ctx.Done():
				return fmt.Errorf("vector search index setup timed out waiting for mongot: %w", ctx.Err())
			case <-time.After(5 * time.Second):
				continue
			}
		}
		return err
	}
}

func (s *Store) ensureSearchIndexOnce(ctx context.Context) error {
	existing, err := s.lookupIndex(ctx)
	if err != nil {
		return err
	}
	if existing != nil {
		for _, field := range existing.LatestDefinition.Fields {
			if field.Type == "vector" && field.NumDimensions != 0 && field.NumDimensions != s.dimensions {
				return fmt.Errorf(
					"search index %s has %d dimensions but EMBEDDING_DIMENSIONS is %d; drop the index and re-ingest",
					SearchIndexName, field.NumDimensions, s.dimensions,
				)
			}
		}
		return s.waitReady(ctx)
	}

	model := mongo.SearchIndexModel{
		Definition: bson.D{{Key: "fields", Value: bson.A{
			bson.D{
				{Key: "type", Value: "vector"},
				{Key: "path", Value: "embedding"},
				{Key: "numDimensions", Value: s.dimensions},
				{Key: "similarity", Value: "cosine"},
			},
			bson.D{
				{Key: "type", Value: "filter"},
				{Key: "path", Value: "documentId"},
			},
		}}},
		Options: options.SearchIndexes().SetName(SearchIndexName).SetType("vectorSearch"),
	}

	if _, err := s.chunks.SearchIndexes().CreateOne(ctx, model); err != nil {
		// A concurrent starter may have created it first.
		if existing, lookupErr := s.lookupIndex(ctx); lookupErr == nil && existing != nil {
			return s.waitReady(ctx)
		}
		return fmt.Errorf("create search index: %w", err)
	}
	return s.waitReady(ctx)
}

func (s *Store) lookupIndex(ctx context.Context) (*searchIndexView, error) {
	cursor, err := s.chunks.SearchIndexes().List(ctx, options.SearchIndexes().SetName(SearchIndexName))
	if err != nil {
		return nil, fmt.Errorf("list search indexes: %w", err)
	}
	defer func() { _ = cursor.Close(ctx) }()

	var indexes []searchIndexView
	if err := cursor.All(ctx, &indexes); err != nil {
		return nil, fmt.Errorf("decode search indexes: %w", err)
	}
	if len(indexes) == 0 {
		return nil, nil
	}
	return &indexes[0], nil
}

func (s *Store) waitReady(ctx context.Context) error {
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		idx, err := s.lookupIndex(ctx)
		if err != nil {
			return err
		}
		if idx != nil && (idx.Status == "READY" || idx.Status == "ready") {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return fmt.Errorf("search index %s did not become READY in time", SearchIndexName)
}

func floats64(in []float32) []float64 {
	out := make([]float64, len(in))
	for i, v := range in {
		out[i] = float64(v)
	}
	return out
}

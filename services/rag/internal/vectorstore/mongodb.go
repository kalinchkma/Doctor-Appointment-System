package vectorstore

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Chunk is the MongoDB representation used by ingestion and vector retrieval.
// Configure an Atlas Vector Search index named `knowledge_vector_index` over embedding.
type Chunk struct {
	ID         string   `bson:"chunkId" json:"id"`
	DocumentID string   `bson:"documentId" json:"documentId"`
	Text       string   `bson:"text" json:"text"`
	Embedding  []float32 `bson:"embedding" json:"-"`
	Source     string   `bson:"source" json:"source"`
}
type Store struct { client *mongo.Client; chunks *mongo.Collection }
func New(ctx context.Context, uri, databaseName string) (*Store, error) {
	client, err := mongo.Connect(options.Client().ApplyURI(uri)); if err != nil { return nil, err }
	if err = client.Ping(ctx, nil); err != nil { _ = client.Disconnect(ctx); return nil, fmt.Errorf("ping MongoDB: %w", err) }
	return &Store{client: client, chunks: client.Database(databaseName).Collection("knowledge_chunks")}, nil
}
func (s *Store) Close(ctx context.Context) error { return s.client.Disconnect(ctx) }
func (s *Store) Upsert(ctx context.Context, chunk Chunk) error {
	_, err := s.chunks.UpdateOne(ctx, map[string]string{"chunkId": chunk.ID}, map[string]any{"$set": chunk}, options.UpdateOne().SetUpsert(true)); return err
}

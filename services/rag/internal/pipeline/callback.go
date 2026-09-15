package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func PayloadCallback(baseURL, secret string) StatusCallback {
	client := &http.Client{Timeout: 8 * time.Second}

	return func(ctx context.Context, documentID, status, indexError string) error {
		body, err := json.Marshal(map[string]string{
			"indexStatus": status,
			"indexError":  indexError,
		})
		if err != nil {
			return err
		}

		url := fmt.Sprintf("%s/api/internal/knowledge-documents/%s/index-status", baseURL, documentID)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-RAG-Internal-Secret", secret)

		res, err := client.Do(req)
		if err != nil {
			return err
		}
		defer func() { _ = res.Body.Close() }()
		if res.StatusCode >= 400 {
			return fmt.Errorf("payload status %d", res.StatusCode)
		}
		return nil
	}
}

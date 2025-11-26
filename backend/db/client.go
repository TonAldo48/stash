package db

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"gitdrive-backend/config"
	"gitdrive-backend/models"
)

// Client handles communication with Supabase
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new Supabase client
func NewClient(cfg *config.Config) *Client {
	return &Client{
		baseURL: cfg.SupabaseURL + "/rest/v1",
		apiKey:  cfg.SupabaseKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// CreateUpload inserts a new upload record
func (c *Client) CreateUpload(upload *models.Upload) error {
	payload := map[string]interface{}{
		"id":              upload.ID,
		"user_id":         upload.UserID,
		"filename":        upload.Filename,
		"file_size":       upload.FileSize,
		"mime_type":       upload.MimeType,
		"target_path":     upload.TargetPath,
		"strategy":        upload.Strategy,
		"chunk_size":      upload.ChunkSize,
		"total_chunks":    upload.TotalChunks,
		"status":          upload.Status,
		"chunks_uploaded": 0,
		"bytes_uploaded":  0,
	}

	if upload.TargetRepo != "" {
		payload["target_repo"] = upload.TargetRepo
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal upload: %w", err)
	}

	req, err := http.NewRequest("POST", c.baseURL+"/uploads", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	req.Header.Set("Prefer", "return=representation")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	// Parse response to get the created record
	var results []models.Upload
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	if len(results) > 0 {
		*upload = results[0]
	}

	return nil
}

// GetUpload retrieves an upload by ID
func (c *Client) GetUpload(uploadID string) (*models.Upload, error) {
	req, err := http.NewRequest("GET", c.baseURL+"/uploads?id=eq."+uploadID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var results []models.Upload
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(results) == 0 {
		return nil, nil
	}

	return &results[0], nil
}

// GetUploadByIDAndUser retrieves an upload by ID and user ID
func (c *Client) GetUploadByIDAndUser(uploadID, userID string) (*models.Upload, error) {
	url := fmt.Sprintf("%s/uploads?id=eq.%s&user_id=eq.%s", c.baseURL, uploadID, userID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var results []models.Upload
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(results) == 0 {
		return nil, nil
	}

	return &results[0], nil
}

// UpdateUpload updates an existing upload record
func (c *Client) UpdateUpload(uploadID string, updates map[string]interface{}) error {
	body, err := json.Marshal(updates)
	if err != nil {
		return fmt.Errorf("failed to marshal updates: %w", err)
	}

	req, err := http.NewRequest("PATCH", c.baseURL+"/uploads?id=eq."+uploadID, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

// CreateChunk inserts a new chunk record
func (c *Client) CreateChunk(chunk *models.UploadChunk) error {
	payload := map[string]interface{}{
		"upload_id":   chunk.UploadID,
		"chunk_index": chunk.ChunkIndex,
		"chunk_size":  chunk.ChunkSize,
		"status":      chunk.Status,
	}

	if chunk.Checksum != "" {
		payload["checksum"] = chunk.Checksum
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal chunk: %w", err)
	}

	req, err := http.NewRequest("POST", c.baseURL+"/upload_chunks", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	req.Header.Set("Prefer", "return=representation")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var results []models.UploadChunk
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	if len(results) > 0 {
		*chunk = results[0]
	}

	return nil
}

// GetChunk retrieves a specific chunk
func (c *Client) GetChunk(uploadID string, chunkIndex int) (*models.UploadChunk, error) {
	url := fmt.Sprintf("%s/upload_chunks?upload_id=eq.%s&chunk_index=eq.%d", c.baseURL, uploadID, chunkIndex)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var results []models.UploadChunk
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(results) == 0 {
		return nil, nil
	}

	return &results[0], nil
}

// GetUploadedChunks retrieves all uploaded chunks for an upload
func (c *Client) GetUploadedChunks(uploadID string) ([]models.UploadChunk, error) {
	url := fmt.Sprintf("%s/upload_chunks?upload_id=eq.%s&status=eq.uploaded&order=chunk_index.asc", c.baseURL, uploadID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var results []models.UploadChunk
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return results, nil
}

// UpdateChunk updates a chunk record
func (c *Client) UpdateChunk(chunkID string, updates map[string]interface{}) error {
	body, err := json.Marshal(updates)
	if err != nil {
		return fmt.Errorf("failed to marshal updates: %w", err)
	}

	req, err := http.NewRequest("PATCH", c.baseURL+"/upload_chunks?id=eq."+chunkID, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

// UpsertChunk creates or updates a chunk record
func (c *Client) UpsertChunk(chunk *models.UploadChunk) error {
	payload := map[string]interface{}{
		"upload_id":       chunk.UploadID,
		"chunk_index":     chunk.ChunkIndex,
		"chunk_size":      chunk.ChunkSize,
		"status":          chunk.Status,
		"server_checksum": chunk.ServerChecksum,
	}

	if chunk.Checksum != "" {
		payload["checksum"] = chunk.Checksum
	}
	if chunk.TempPath != "" {
		payload["temp_path"] = chunk.TempPath
	}
	if chunk.BlobSHA != "" {
		payload["blob_sha"] = chunk.BlobSHA
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal chunk: %w", err)
	}

	req, err := http.NewRequest("POST", c.baseURL+"/upload_chunks", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	req.Header.Set("Prefer", "resolution=merge-duplicates,return=representation")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

// DeleteUpload deletes an upload and its chunks (cascade)
func (c *Client) DeleteUpload(uploadID string) error {
	req, err := http.NewRequest("DELETE", c.baseURL+"/uploads?id=eq."+uploadID, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

// GetActiveStorageRepo gets the active storage repo for a user
func (c *Client) GetActiveStorageRepo(userID string) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/storage_repos?user_id=eq.%s&is_active=eq.true", c.baseURL, userID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var results []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(results) == 0 {
		return nil, nil
	}

	return results[0], nil
}

// CreateFile inserts a new file record
func (c *Client) CreateFile(file map[string]interface{}) (map[string]interface{}, error) {
	body, err := json.Marshal(file)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal file: %w", err)
	}

	req, err := http.NewRequest("POST", c.baseURL+"/files", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	req.Header.Set("Prefer", "return=representation")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var results []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("no file created")
	}

	return results[0], nil
}

// UpdateStorageRepoSize updates the size of a storage repo
func (c *Client) UpdateStorageRepoSize(repoID string, sizeBytes int64) error {
	payload := map[string]interface{}{
		"size_bytes": sizeBytes,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("PATCH", c.baseURL+"/storage_repos?id=eq."+repoID, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", c.apiKey)
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
}

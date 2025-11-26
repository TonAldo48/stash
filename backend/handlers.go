package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	MAX_FILE_SIZE     = 10 * 1024 * 1024 * 1024 // 10GB
	DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024          // 5MB
	TEMP_STORAGE_DIR   = "/tmp/gitdrive-uploads"
)

type InitUploadRequest struct {
	Filename  string `json:"filename"`
	MimeType  string `json:"mime_type"`
	SizeBytes int64  `json:"size_bytes"`
	TargetPath string `json:"target_path"`
	UserID    string `json:"user_id"`
	GitHubToken string `json:"github_token"`
}

type InitUploadResponse struct {
	UploadID     string `json:"upload_id"`
	ChunkSize    int    `json:"chunk_size"`
	TotalChunks  int    `json:"total_chunks"`
	Strategy     string `json:"strategy"`
}

type ChunkUploadRequest struct {
	ChunkIndex  int    `json:"chunk_index"`
	Checksum    string `json:"checksum"`
	UploadID    string `json:"upload_id"`
	UserID      string `json:"user_id"`
}

type ChunkUploadResponse struct {
	Success            bool   `json:"success"`
	NextChunkIndex     int    `json:"next_chunk_index"`
	ServerChecksum     string `json:"server_checksum,omitempty"`
	Error              string `json:"error,omitempty"`
}

type FinalizeResponse struct {
	Success      bool   `json:"success"`
	FileID       string `json:"file_id,omitempty"`
	GitHubPath   string `json:"github_path,omitempty"`
	Error        string `json:"error,omitempty"`
}

type UploadStatusResponse struct {
	UploadID     string `json:"upload_id"`
	Status       string `json:"status"`
	Progress     float64 `json:"progress"`
	ChunksUploaded int   `json:"chunks_uploaded"`
	TotalChunks  int    `json:"total_chunks"`
	Error        string `json:"error,omitempty"`
}

func handleInitUpload(w http.ResponseWriter, r *http.Request) {
	var req InitUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate file size
	if req.SizeBytes > MAX_FILE_SIZE {
		http.Error(w, fmt.Sprintf("File size exceeds maximum of %d bytes", MAX_FILE_SIZE), http.StatusBadRequest)
		return
	}

	if req.SizeBytes <= 0 {
		http.Error(w, "Invalid file size", http.StatusBadRequest)
		return
	}

	// TODO: Add quota validation here
	// Check user's storage quota before allowing upload
	// This would require a database query to get current usage

	// Determine chunk size and strategy
	chunkSize := DEFAULT_CHUNK_SIZE
	if req.SizeBytes > 100*1024*1024 { // > 100MB, use larger chunks
		chunkSize = 50 * 1024 * 1024 // 50MB chunks
	}

	totalChunks := int((req.SizeBytes + int64(chunkSize) - 1) / int64(chunkSize))

	// Determine strategy based on file size
	strategy := "repo-chunked"
	if req.SizeBytes > 2*1024*1024*1024 { // > 2GB
		strategy = "repo-chunked" // Use chunked for very large files
	} else if req.SizeBytes > 100*1024*1024 { // > 100MB
		strategy = "lfs" // Use LFS for mid-sized files
	}

	// Create upload record in database
	uploadID, err := createUploadRecord(req, chunkSize, totalChunks, strategy)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create upload record: %v", err), http.StatusInternalServerError)
		return
	}

	// Ensure temp storage directory exists
	if err := os.MkdirAll(TEMP_STORAGE_DIR, 0755); err != nil {
		http.Error(w, "Failed to create temp storage", http.StatusInternalServerError)
		return
	}

	response := InitUploadResponse{
		UploadID:    uploadID,
		ChunkSize:   chunkSize,
		TotalChunks: totalChunks,
		Strategy:    strategy,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleChunkUpload(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	if uploadID == "" {
		http.Error(w, "Missing upload ID", http.StatusBadRequest)
		return
	}

	// Parse form data
	if err := r.ParseMultipartForm(100 << 20); err != nil { // 100MB max
		http.Error(w, "Failed to parse multipart form", http.StatusBadRequest)
		return
	}

	chunkIndexStr := r.FormValue("chunk_index")
	checksum := r.FormValue("checksum")
	userID := r.FormValue("user_id")

	if chunkIndexStr == "" || checksum == "" || userID == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, "Invalid chunk index", http.StatusBadRequest)
		return
	}

	// Verify upload belongs to user
	upload, err := getUpload(uploadID, userID)
	if err != nil {
		http.Error(w, "Upload not found or unauthorized", http.StatusNotFound)
		return
	}

	if upload.Status != "pending" && upload.Status != "in_progress" {
		http.Error(w, "Upload is not in a valid state for chunk upload", http.StatusBadRequest)
		return
	}

	// Get chunk file from form
	file, _, err := r.FormFile("chunk")
	if err != nil {
		http.Error(w, "Failed to get chunk file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Save chunk to temporary storage
	chunkPath := filepath.Join(TEMP_STORAGE_DIR, uploadID, fmt.Sprintf("chunk-%05d", chunkIndex))
	if err := os.MkdirAll(filepath.Dir(chunkPath), 0755); err != nil {
		http.Error(w, "Failed to create chunk directory", http.StatusInternalServerError)
		return
	}

	chunkFile, err := os.Create(chunkPath)
	if err != nil {
		http.Error(w, "Failed to create chunk file", http.StatusInternalServerError)
		return
	}
	defer chunkFile.Close()

	written, err := io.Copy(chunkFile, file)
	if err != nil {
		http.Error(w, "Failed to write chunk", http.StatusInternalServerError)
		return
	}

	// Verify checksum (simplified - in production, compute SHA-256)
	// For now, we'll trust the client checksum and verify later during finalize

	// Record chunk in database
	if err := recordChunk(uploadID, chunkIndex, int(written), checksum, chunkPath); err != nil {
		http.Error(w, fmt.Sprintf("Failed to record chunk: %v", err), http.StatusInternalServerError)
		return
	}

	// Update upload status to in_progress
	if upload.Status == "pending" {
		updateUploadStatus(uploadID, "in_progress")
	}

	// Determine next chunk index
	nextChunkIndex := chunkIndex + 1
	if nextChunkIndex >= upload.TotalChunks {
		nextChunkIndex = -1 // All chunks uploaded
	}

	response := ChunkUploadResponse{
		Success:        true,
		NextChunkIndex: nextChunkIndex,
		ServerChecksum: checksum, // In production, compute actual checksum
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleFinalize(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	if uploadID == "" {
		http.Error(w, "Missing upload ID", http.StatusBadRequest)
		return
	}

	var req struct {
		UserID      string `json:"user_id"`
		GitHubToken string `json:"github_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Verify upload belongs to user
	upload, err := getUpload(uploadID, req.UserID)
	if err != nil {
		http.Error(w, "Upload not found or unauthorized", http.StatusNotFound)
		return
	}

	// Verify all chunks are present
	chunks, err := getChunks(uploadID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get chunks: %v", err), http.StatusInternalServerError)
		return
	}

	if len(chunks) != upload.TotalChunks {
		http.Error(w, fmt.Sprintf("Not all chunks uploaded. Expected %d, got %d", upload.TotalChunks, len(chunks)), http.StatusBadRequest)
		return
	}

	// Finalize upload based on strategy
	fileID, githubPath, err := finalizeUpload(upload, chunks, req.GitHubToken)
	if err != nil {
		updateUploadStatus(uploadID, "failed")
		updateUploadError(uploadID, err.Error())
		http.Error(w, fmt.Sprintf("Failed to finalize upload: %v", err), http.StatusInternalServerError)
		return
	}

	updateUploadStatus(uploadID, "completed")
	updateUploadCompletedAt(uploadID, time.Now())
	updateUploadPaths(uploadID, githubPath, "")

	response := FinalizeResponse{
		Success:    true,
		FileID:     fileID,
		GitHubPath: githubPath,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleAbort(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	if uploadID == "" {
		http.Error(w, "Missing upload ID", http.StatusBadRequest)
		return
	}

	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Verify upload belongs to user
	_, err := getUpload(uploadID, req.UserID)
	if err != nil {
		http.Error(w, "Upload not found or unauthorized", http.StatusNotFound)
		return
	}

	// Clean up chunks
	chunks, _ := getChunks(uploadID)
	for _, chunk := range chunks {
		if chunk.TempStoragePath != "" {
			os.Remove(chunk.TempStoragePath)
		}
	}

	// Remove temp directory
	os.RemoveAll(filepath.Join(TEMP_STORAGE_DIR, uploadID))

	// Update status
	updateUploadStatus(uploadID, "aborted")

	w.WriteHeader(http.StatusNoContent)
}

func handleGetStatus(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	userID := r.URL.Query().Get("user_id")

	if uploadID == "" || userID == "" {
		http.Error(w, "Missing upload ID or user ID", http.StatusBadRequest)
		return
	}

	upload, err := getUpload(uploadID, userID)
	if err != nil {
		http.Error(w, "Upload not found or unauthorized", http.StatusNotFound)
		return
	}

	chunks, _ := getChunks(uploadID)
	uploadedCount := 0
	for _, chunk := range chunks {
		if chunk.Status == "uploaded" || chunk.Status == "verified" {
			uploadedCount++
		}
	}

	progress := 0.0
	if upload.TotalChunks > 0 {
		progress = float64(uploadedCount) / float64(upload.TotalChunks) * 100
	}

	response := UploadStatusResponse{
		UploadID:      uploadID,
		Status:        upload.Status,
		Progress:      progress,
		ChunksUploaded: uploadedCount,
		TotalChunks:   upload.TotalChunks,
		Error:         upload.ErrorMessage,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

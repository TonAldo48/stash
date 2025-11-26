package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"gitdrive-backend/config"
	"gitdrive-backend/db"
	ghclient "gitdrive-backend/github"
	"gitdrive-backend/middleware"
	"gitdrive-backend/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// UploadHandler handles upload-related requests
type UploadHandler struct {
	cfg      *config.Config
	dbClient *db.Client
}

// NewUploadHandler creates a new upload handler
func NewUploadHandler(cfg *config.Config) *UploadHandler {
	// Ensure temp directory exists
	os.MkdirAll(cfg.TempDir, 0755)

	return &UploadHandler{
		cfg:      cfg,
		dbClient: db.NewClient(cfg),
	}
}

// InitUpload handles POST /api/uploads/init
func (h *UploadHandler) InitUpload(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		sendError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}

	var req models.InitUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body", "BAD_REQUEST")
		return
	}

	// Validate request
	if req.Filename == "" {
		sendError(w, http.StatusBadRequest, "Filename is required", "VALIDATION_ERROR")
		return
	}
	if req.FileSize <= 0 {
		sendError(w, http.StatusBadRequest, "File size must be positive", "VALIDATION_ERROR")
		return
	}
	if req.FileSize > h.cfg.MaxFileSize {
		sendError(w, http.StatusBadRequest, fmt.Sprintf("File size exceeds maximum of %d bytes", h.cfg.MaxFileSize), "FILE_TOO_LARGE")
		return
	}

	// Determine chunk size
	chunkSize := req.ChunkSize
	if chunkSize <= 0 {
		chunkSize = h.cfg.DefaultChunkSize
	}
	if chunkSize < h.cfg.MinChunkSize {
		chunkSize = h.cfg.MinChunkSize
	}
	if chunkSize > h.cfg.MaxChunkSize {
		chunkSize = h.cfg.MaxChunkSize
	}

	// Calculate total chunks
	totalChunks := int((req.FileSize + int64(chunkSize) - 1) / int64(chunkSize))

	// Determine strategy based on file size
	strategy := models.StrategyChunked
	if req.FileSize <= 50*1024*1024 { // <= 50MB: could do direct
		// Still use chunked for consistency, but could optimize later
		strategy = models.StrategyChunked
	} else if req.FileSize > 2*1024*1024*1024 { // > 2GB
		strategy = models.StrategyRelease // Would need release assets
	}

	// Get active storage repo
	activeRepo, err := h.dbClient.GetActiveStorageRepo(userID)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to get storage repo", "DB_ERROR")
		return
	}

	targetRepo := ""
	if activeRepo != nil {
		targetRepo = activeRepo["repo_name"].(string)
	}

	// Target path
	targetPath := req.TargetPath
	if targetPath == "" {
		targetPath = "/"
	}

	// Create upload record
	uploadID := uuid.New().String()
	upload := &models.Upload{
		ID:          uploadID,
		UserID:      userID,
		Filename:    req.Filename,
		FileSize:    req.FileSize,
		MimeType:    req.MimeType,
		TargetPath:  targetPath,
		Strategy:    strategy,
		ChunkSize:   chunkSize,
		TotalChunks: totalChunks,
		TargetRepo:  targetRepo,
		Status:      models.StatusPending,
	}

	if err := h.dbClient.CreateUpload(upload); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to create upload", "DB_ERROR")
		return
	}

	// Create temp directory for this upload
	uploadTempDir := filepath.Join(h.cfg.TempDir, uploadID)
	os.MkdirAll(uploadTempDir, 0755)

	response := models.InitUploadResponse{
		UploadID:    uploadID,
		ChunkSize:   chunkSize,
		TotalChunks: totalChunks,
		Strategy:    strategy,
		ExpiresAt:   upload.ExpiresAt,
	}

	sendJSON(w, http.StatusOK, response)
}

// UploadChunk handles POST /api/uploads/{uploadId}/chunks
func (h *UploadHandler) UploadChunk(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		sendError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}

	uploadID := chi.URLParam(r, "uploadId")
	if uploadID == "" {
		sendError(w, http.StatusBadRequest, "Upload ID is required", "BAD_REQUEST")
		return
	}

	// Get chunk index and checksum from headers
	chunkIndexStr := r.Header.Get("X-Chunk-Index")
	clientChecksum := r.Header.Get("X-Chunk-Checksum")

	if chunkIndexStr == "" {
		sendError(w, http.StatusBadRequest, "Chunk index is required (X-Chunk-Index header)", "BAD_REQUEST")
		return
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil || chunkIndex < 0 {
		sendError(w, http.StatusBadRequest, "Invalid chunk index", "BAD_REQUEST")
		return
	}

	// Verify upload exists and belongs to user
	upload, err := h.dbClient.GetUploadByIDAndUser(uploadID, userID)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Database error", "DB_ERROR")
		return
	}
	if upload == nil {
		sendError(w, http.StatusNotFound, "Upload not found", "NOT_FOUND")
		return
	}

	// Validate upload status
	if upload.Status != models.StatusPending && upload.Status != models.StatusInProgress {
		sendError(w, http.StatusConflict, "Upload is not in a valid state for chunk upload", "INVALID_STATE")
		return
	}

	// Validate chunk index
	if chunkIndex >= upload.TotalChunks {
		sendError(w, http.StatusBadRequest, "Chunk index exceeds total chunks", "VALIDATION_ERROR")
		return
	}

	// Check if chunk already exists
	existingChunk, _ := h.dbClient.GetChunk(uploadID, chunkIndex)
	if existingChunk != nil && existingChunk.Status == models.ChunkUploaded {
		// Chunk already uploaded, return success
		response := models.UploadChunkResponse{
			ChunkIndex:        chunkIndex,
			ServerChecksum:    existingChunk.ServerChecksum,
			NextExpectedChunk: h.getNextExpectedChunk(upload),
			ChunksUploaded:    upload.ChunksUploaded,
			TotalChunks:       upload.TotalChunks,
			BytesUploaded:     upload.BytesUploaded,
			TotalBytes:        upload.FileSize,
		}
		sendJSON(w, http.StatusOK, response)
		return
	}

	// Read chunk data with size limit
	maxChunkSize := int64(h.cfg.MaxChunkSize + 1024) // Allow a bit of overhead
	limitedReader := io.LimitReader(r.Body, maxChunkSize)
	chunkData, err := io.ReadAll(limitedReader)
	if err != nil {
		sendError(w, http.StatusBadRequest, "Failed to read chunk data", "READ_ERROR")
		return
	}

	if len(chunkData) == 0 {
		sendError(w, http.StatusBadRequest, "Empty chunk data", "VALIDATION_ERROR")
		return
	}

	// Calculate server-side checksum
	hash := sha256.Sum256(chunkData)
	serverChecksum := hex.EncodeToString(hash[:])

	// Verify checksum if provided
	if clientChecksum != "" && clientChecksum != serverChecksum {
		sendError(w, http.StatusBadRequest, "Checksum mismatch", "CHECKSUM_MISMATCH")
		return
	}

	// Save chunk to temp storage
	chunkPath := filepath.Join(h.cfg.TempDir, uploadID, fmt.Sprintf("chunk-%05d", chunkIndex))
	if err := os.WriteFile(chunkPath, chunkData, 0644); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to save chunk", "IO_ERROR")
		return
	}

	// Update or create chunk record
	chunk := &models.UploadChunk{
		UploadID:       uploadID,
		ChunkIndex:     chunkIndex,
		ChunkSize:      len(chunkData),
		Checksum:       clientChecksum,
		ServerChecksum: serverChecksum,
		TempPath:       chunkPath,
		Status:         models.ChunkUploaded,
	}

	if err := h.dbClient.UpsertChunk(chunk); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to record chunk", "DB_ERROR")
		return
	}

	// Update upload progress
	chunksUploaded := upload.ChunksUploaded + 1
	bytesUploaded := upload.BytesUploaded + int64(len(chunkData))
	
	status := models.StatusInProgress
	if chunksUploaded >= upload.TotalChunks {
		status = models.StatusInProgress // Still in progress until finalized
	}

	updates := map[string]interface{}{
		"chunks_uploaded": chunksUploaded,
		"bytes_uploaded":  bytesUploaded,
		"status":          status,
	}

	if err := h.dbClient.UpdateUpload(uploadID, updates); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to update upload", "DB_ERROR")
		return
	}

	nextChunk := chunkIndex + 1
	if nextChunk >= upload.TotalChunks {
		nextChunk = -1 // No more chunks expected
	}

	response := models.UploadChunkResponse{
		ChunkIndex:        chunkIndex,
		ServerChecksum:    serverChecksum,
		NextExpectedChunk: nextChunk,
		ChunksUploaded:    chunksUploaded,
		TotalChunks:       upload.TotalChunks,
		BytesUploaded:     bytesUploaded,
		TotalBytes:        upload.FileSize,
	}

	w.Header().Set("X-Next-Chunk-Index", strconv.Itoa(nextChunk))
	sendJSON(w, http.StatusOK, response)
}

// GetUploadStatus handles GET /api/uploads/{uploadId}/status
func (h *UploadHandler) GetUploadStatus(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		sendError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}

	uploadID := chi.URLParam(r, "uploadId")
	if uploadID == "" {
		sendError(w, http.StatusBadRequest, "Upload ID is required", "BAD_REQUEST")
		return
	}

	upload, err := h.dbClient.GetUploadByIDAndUser(uploadID, userID)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Database error", "DB_ERROR")
		return
	}
	if upload == nil {
		sendError(w, http.StatusNotFound, "Upload not found", "NOT_FOUND")
		return
	}

	percentComplete := 0.0
	if upload.TotalChunks > 0 {
		percentComplete = float64(upload.ChunksUploaded) / float64(upload.TotalChunks) * 100
	}

	response := models.UploadStatusResponse{
		UploadID:        uploadID,
		Status:          upload.Status,
		ChunksUploaded:  upload.ChunksUploaded,
		TotalChunks:     upload.TotalChunks,
		BytesUploaded:   upload.BytesUploaded,
		TotalBytes:      upload.FileSize,
		PercentComplete: percentComplete,
		ErrorMessage:    upload.ErrorMessage,
	}

	sendJSON(w, http.StatusOK, response)
}

// FinalizeUpload handles POST /api/uploads/{uploadId}/finalize
func (h *UploadHandler) FinalizeUpload(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	accessToken := middleware.GetAccessToken(r.Context())
	
	if userID == "" {
		sendError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}

	if accessToken == "" {
		sendError(w, http.StatusUnauthorized, "GitHub token required", "UNAUTHORIZED")
		return
	}

	uploadID := chi.URLParam(r, "uploadId")
	if uploadID == "" {
		sendError(w, http.StatusBadRequest, "Upload ID is required", "BAD_REQUEST")
		return
	}

	upload, err := h.dbClient.GetUploadByIDAndUser(uploadID, userID)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Database error", "DB_ERROR")
		return
	}
	if upload == nil {
		sendError(w, http.StatusNotFound, "Upload not found", "NOT_FOUND")
		return
	}

	// Validate all chunks are uploaded
	if upload.ChunksUploaded != upload.TotalChunks {
		sendError(w, http.StatusConflict, 
			fmt.Sprintf("Not all chunks uploaded: %d/%d", upload.ChunksUploaded, upload.TotalChunks), 
			"INCOMPLETE_UPLOAD")
		return
	}

	// Update status to finalizing
	if err := h.dbClient.UpdateUpload(uploadID, map[string]interface{}{
		"status": models.StatusFinalizing,
	}); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to update status", "DB_ERROR")
		return
	}

	// Create GitHub client
	gh, err := ghclient.NewClient(r.Context(), accessToken)
	if err != nil {
		h.failUpload(uploadID, "Failed to create GitHub client: "+err.Error())
		sendError(w, http.StatusInternalServerError, "Failed to connect to GitHub", "GITHUB_ERROR")
		return
	}

	// Ensure storage repo exists
	targetRepo := upload.TargetRepo
	if targetRepo == "" {
		targetRepo = h.cfg.StorageRepoPrefix + "-001"
	}

	exists, err := gh.RepoExists(targetRepo)
	if err != nil {
		h.failUpload(uploadID, "Failed to check repo: "+err.Error())
		sendError(w, http.StatusInternalServerError, "Failed to check repository", "GITHUB_ERROR")
		return
	}

	if !exists {
		if err := gh.CreateRepo(targetRepo); err != nil {
			h.failUpload(uploadID, "Failed to create repo: "+err.Error())
			sendError(w, http.StatusInternalServerError, "Failed to create repository", "GITHUB_ERROR")
			return
		}
	}

	// Get all uploaded chunks
	chunks, err := h.dbClient.GetUploadedChunks(uploadID)
	if err != nil {
		h.failUpload(uploadID, "Failed to get chunks: "+err.Error())
		sendError(w, http.StatusInternalServerError, "Failed to get chunks", "DB_ERROR")
		return
	}

	if len(chunks) != upload.TotalChunks {
		h.failUpload(uploadID, "Chunk count mismatch")
		sendError(w, http.StatusInternalServerError, "Chunk verification failed", "VERIFICATION_ERROR")
		return
	}

	// Determine the final storage path
	blobPath := ghclient.BlobPath(uploadID, upload.Filename)

	// For chunked strategy, we assemble chunks and upload as a single file
	// For small-to-medium files, this is efficient enough
	// For very large files, we would store chunks separately with a manifest

	if upload.FileSize <= 100*1024*1024 { // <= 100MB: assemble and upload
		// Collect chunk paths in order
		chunkPaths := make([]string, len(chunks))
		for _, chunk := range chunks {
			chunkPaths[chunk.ChunkIndex] = chunk.TempPath
		}

		// Verify all paths exist
		for i, path := range chunkPaths {
			if path == "" {
				h.failUpload(uploadID, fmt.Sprintf("Missing chunk %d", i))
				sendError(w, http.StatusInternalServerError, "Missing chunk data", "MISSING_CHUNK")
				return
			}
		}

		// Assemble and upload
		resp, err := gh.AssembleChunksAndUpload(targetRepo, blobPath, chunkPaths, "Upload "+upload.Filename)
		if err != nil {
			h.failUpload(uploadID, "Failed to upload to GitHub: "+err.Error())
			sendError(w, http.StatusInternalServerError, "Failed to upload to GitHub", "GITHUB_ERROR")
			return
		}

		// Record the blob SHA if available
		if resp != nil && resp.Content != nil {
			h.dbClient.UpdateUpload(uploadID, map[string]interface{}{
				"blob_path": blobPath,
			})
		}
	} else {
		// For larger files, upload chunks separately with a manifest
		manifestPath := ghclient.ManifestPath(uploadID)

		// Build manifest
		manifestChunks := make([]models.ChunkManifestItem, len(chunks))
		for i, chunk := range chunks {
			chunkPath := ghclient.ChunkPath(uploadID, chunk.ChunkIndex)
			manifestChunks[i] = models.ChunkManifestItem{
				Index:    chunk.ChunkIndex,
				Size:     chunk.ChunkSize,
				Checksum: chunk.ServerChecksum,
				BlobPath: chunkPath,
			}
		}

		manifest := models.ChunkManifest{
			Version:     "1.0",
			Filename:    upload.Filename,
			FileSize:    upload.FileSize,
			MimeType:    upload.MimeType,
			ChunkSize:   upload.ChunkSize,
			TotalChunks: upload.TotalChunks,
			Chunks:      manifestChunks,
			CreatedAt:   time.Now(),
			UploadID:    uploadID,
		}

		// Upload each chunk to GitHub
		for _, chunk := range chunks {
			chunkData, err := os.ReadFile(chunk.TempPath)
			if err != nil {
				h.failUpload(uploadID, fmt.Sprintf("Failed to read chunk %d: %s", chunk.ChunkIndex, err.Error()))
				sendError(w, http.StatusInternalServerError, "Failed to read chunk", "IO_ERROR")
				return
			}

			chunkPath := ghclient.ChunkPath(uploadID, chunk.ChunkIndex)
			sha, err := gh.UploadChunkFile(targetRepo, chunkPath, chunkData)
			if err != nil {
				h.failUpload(uploadID, fmt.Sprintf("Failed to upload chunk %d: %s", chunk.ChunkIndex, err.Error()))
				sendError(w, http.StatusInternalServerError, "Failed to upload chunk", "GITHUB_ERROR")
				return
			}

			manifestChunks[chunk.ChunkIndex].BlobSHA = sha
		}

		// Upload manifest
		if err := gh.UploadManifest(targetRepo, manifestPath, manifest); err != nil {
			h.failUpload(uploadID, "Failed to upload manifest: "+err.Error())
			sendError(w, http.StatusInternalServerError, "Failed to upload manifest", "GITHUB_ERROR")
			return
		}

		blobPath = manifestPath // Store manifest path as the reference
		h.dbClient.UpdateUpload(uploadID, map[string]interface{}{
			"blob_path":     blobPath,
			"manifest_path": manifestPath,
		})
	}

	// Create file record in the files table
	fileRecord := map[string]interface{}{
		"user_id":    userID,
		"name":       upload.Filename,
		"type":       "file",
		"size_bytes": upload.FileSize,
		"path":       upload.TargetPath,
		"repo_name":  targetRepo,
		"blob_path":  blobPath,
	}

	newFile, err := h.dbClient.CreateFile(fileRecord)
	if err != nil {
		h.failUpload(uploadID, "Failed to create file record: "+err.Error())
		sendError(w, http.StatusInternalServerError, "Failed to create file record", "DB_ERROR")
		return
	}

	// Update storage repo size
	activeRepo, _ := h.dbClient.GetActiveStorageRepo(userID)
	if activeRepo != nil {
		currentSize := int64(0)
		if size, ok := activeRepo["size_bytes"].(float64); ok {
			currentSize = int64(size)
		}
		newSize := currentSize + upload.FileSize
		h.dbClient.UpdateStorageRepoSize(activeRepo["id"].(string), newSize)
	}

	// Mark upload as completed
	now := time.Now()
	if err := h.dbClient.UpdateUpload(uploadID, map[string]interface{}{
		"status":       models.StatusCompleted,
		"completed_at": now,
		"target_repo":  targetRepo,
		"blob_path":    blobPath,
	}); err != nil {
		// Non-fatal, file is already uploaded
		fmt.Printf("Warning: failed to update upload status: %v\n", err)
	}

	// Clean up temp files
	go h.cleanupTempFiles(uploadID)

	fileID := ""
	if id, ok := newFile["id"].(string); ok {
		fileID = id
	}

	response := models.FinalizeUploadResponse{
		Success:  true,
		FileID:   fileID,
		BlobPath: blobPath,
		Message:  "Upload completed successfully",
	}

	sendJSON(w, http.StatusOK, response)
}

// AbortUpload handles DELETE /api/uploads/{uploadId}
func (h *UploadHandler) AbortUpload(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		sendError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}

	uploadID := chi.URLParam(r, "uploadId")
	if uploadID == "" {
		sendError(w, http.StatusBadRequest, "Upload ID is required", "BAD_REQUEST")
		return
	}

	upload, err := h.dbClient.GetUploadByIDAndUser(uploadID, userID)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Database error", "DB_ERROR")
		return
	}
	if upload == nil {
		sendError(w, http.StatusNotFound, "Upload not found", "NOT_FOUND")
		return
	}

	// Can only abort pending or in-progress uploads
	if upload.Status != models.StatusPending && upload.Status != models.StatusInProgress {
		sendError(w, http.StatusConflict, "Cannot abort upload in current state", "INVALID_STATE")
		return
	}

	// Update status
	if err := h.dbClient.UpdateUpload(uploadID, map[string]interface{}{
		"status": models.StatusCancelled,
	}); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to update status", "DB_ERROR")
		return
	}

	// Clean up temp files
	go h.cleanupTempFiles(uploadID)

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Upload cancelled",
	})
}

// ResumeUpload handles GET /api/uploads/{uploadId}/resume
func (h *UploadHandler) ResumeUpload(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		sendError(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}

	uploadID := chi.URLParam(r, "uploadId")
	if uploadID == "" {
		sendError(w, http.StatusBadRequest, "Upload ID is required", "BAD_REQUEST")
		return
	}

	upload, err := h.dbClient.GetUploadByIDAndUser(uploadID, userID)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Database error", "DB_ERROR")
		return
	}
	if upload == nil {
		sendError(w, http.StatusNotFound, "Upload not found", "NOT_FOUND")
		return
	}

	// Check if upload can be resumed
	if upload.Status != models.StatusPending && upload.Status != models.StatusInProgress {
		sendError(w, http.StatusConflict, "Upload cannot be resumed in current state", "INVALID_STATE")
		return
	}

	// Check expiration
	if time.Now().After(upload.ExpiresAt) {
		sendError(w, http.StatusGone, "Upload has expired", "EXPIRED")
		return
	}

	// Get uploaded chunks
	uploadedChunks, err := h.dbClient.GetUploadedChunks(uploadID)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Database error", "DB_ERROR")
		return
	}

	// Find missing chunks
	uploadedSet := make(map[int]bool)
	for _, chunk := range uploadedChunks {
		uploadedSet[chunk.ChunkIndex] = true
	}

	var missingChunks []int
	nextExpected := 0
	for i := 0; i < upload.TotalChunks; i++ {
		if !uploadedSet[i] {
			missingChunks = append(missingChunks, i)
			if nextExpected == 0 {
				nextExpected = i
			}
		}
	}

	response := models.ResumeUploadResponse{
		UploadID:          uploadID,
		NextExpectedChunk: nextExpected,
		ChunksUploaded:    len(uploadedChunks),
		TotalChunks:       upload.TotalChunks,
		ChunkSize:         upload.ChunkSize,
		MissingChunks:     missingChunks,
	}

	sendJSON(w, http.StatusOK, response)
}

// Helper methods

func (h *UploadHandler) getNextExpectedChunk(upload *models.Upload) int {
	// Simple sequential approach - could be optimized
	return upload.ChunksUploaded
}

func (h *UploadHandler) failUpload(uploadID, errorMessage string) {
	h.dbClient.UpdateUpload(uploadID, map[string]interface{}{
		"status":        models.StatusFailed,
		"error_message": errorMessage,
	})
}

func (h *UploadHandler) cleanupTempFiles(uploadID string) {
	tempDir := filepath.Join(h.cfg.TempDir, uploadID)
	os.RemoveAll(tempDir)
}

func sendJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func sendError(w http.ResponseWriter, status int, message, code string) {
	sendJSON(w, status, models.ErrorResponse{
		Error: message,
		Code:  code,
	})
}

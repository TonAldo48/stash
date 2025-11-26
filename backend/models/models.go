package models

import (
	"time"
)

// UploadStrategy represents the storage strategy for an upload
type UploadStrategy string

const (
	StrategyDirect  UploadStrategy = "direct"
	StrategyChunked UploadStrategy = "chunked"
	StrategyLFS     UploadStrategy = "lfs"
	StrategyRelease UploadStrategy = "release"
)

// UploadStatus represents the current status of an upload
type UploadStatus string

const (
	StatusPending    UploadStatus = "pending"
	StatusInProgress UploadStatus = "in_progress"
	StatusFinalizing UploadStatus = "finalizing"
	StatusCompleted  UploadStatus = "completed"
	StatusFailed     UploadStatus = "failed"
	StatusCancelled  UploadStatus = "cancelled"
)

// ChunkStatus represents the status of an individual chunk
type ChunkStatus string

const (
	ChunkPending   ChunkStatus = "pending"
	ChunkUploading ChunkStatus = "uploading"
	ChunkUploaded  ChunkStatus = "uploaded"
	ChunkFailed    ChunkStatus = "failed"
)

// Upload represents an upload session in the database
type Upload struct {
	ID             string         `json:"id" db:"id"`
	UserID         string         `json:"user_id" db:"user_id"`
	Filename       string         `json:"filename" db:"filename"`
	FileSize       int64          `json:"file_size" db:"file_size"`
	MimeType       string         `json:"mime_type,omitempty" db:"mime_type"`
	TargetPath     string         `json:"target_path" db:"target_path"`
	Strategy       UploadStrategy `json:"strategy" db:"strategy"`
	ChunkSize      int            `json:"chunk_size" db:"chunk_size"`
	TotalChunks    int            `json:"total_chunks" db:"total_chunks"`
	TargetRepo     string         `json:"target_repo,omitempty" db:"target_repo"`
	BlobPath       string         `json:"blob_path,omitempty" db:"blob_path"`
	ManifestPath   string         `json:"manifest_path,omitempty" db:"manifest_path"`
	Status         UploadStatus   `json:"status" db:"status"`
	ChunksUploaded int            `json:"chunks_uploaded" db:"chunks_uploaded"`
	BytesUploaded  int64          `json:"bytes_uploaded" db:"bytes_uploaded"`
	ErrorMessage   string         `json:"error_message,omitempty" db:"error_message"`
	RetryCount     int            `json:"retry_count" db:"retry_count"`
	CreatedAt      time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at" db:"updated_at"`
	ExpiresAt      time.Time      `json:"expires_at" db:"expires_at"`
	CompletedAt    *time.Time     `json:"completed_at,omitempty" db:"completed_at"`
}

// UploadChunk represents a chunk within an upload
type UploadChunk struct {
	ID             string      `json:"id" db:"id"`
	UploadID       string      `json:"upload_id" db:"upload_id"`
	ChunkIndex     int         `json:"chunk_index" db:"chunk_index"`
	ChunkSize      int         `json:"chunk_size" db:"chunk_size"`
	Checksum       string      `json:"checksum,omitempty" db:"checksum"`
	ServerChecksum string      `json:"server_checksum,omitempty" db:"server_checksum"`
	TempPath       string      `json:"temp_path,omitempty" db:"temp_path"`
	BlobSHA        string      `json:"blob_sha,omitempty" db:"blob_sha"`
	Status         ChunkStatus `json:"status" db:"status"`
	ErrorMessage   string      `json:"error_message,omitempty" db:"error_message"`
	RetryCount     int         `json:"retry_count" db:"retry_count"`
	CreatedAt      time.Time   `json:"created_at" db:"created_at"`
	UploadedAt     *time.Time  `json:"uploaded_at,omitempty" db:"uploaded_at"`
}

// ChunkManifest represents the manifest file stored in GitHub
type ChunkManifest struct {
	Version      string              `json:"version"`
	Filename     string              `json:"filename"`
	FileSize     int64               `json:"file_size"`
	MimeType     string              `json:"mime_type"`
	ChunkSize    int                 `json:"chunk_size"`
	TotalChunks  int                 `json:"total_chunks"`
	Checksum     string              `json:"checksum"` // Full file checksum
	Chunks       []ChunkManifestItem `json:"chunks"`
	CreatedAt    time.Time           `json:"created_at"`
	UploadID     string              `json:"upload_id"`
}

// ChunkManifestItem represents a single chunk in the manifest
type ChunkManifestItem struct {
	Index    int    `json:"index"`
	Size     int    `json:"size"`
	Checksum string `json:"checksum"`
	BlobPath string `json:"blob_path"`
	BlobSHA  string `json:"blob_sha,omitempty"`
}

// InitUploadRequest represents the request to initialize an upload
type InitUploadRequest struct {
	Filename   string `json:"filename"`
	FileSize   int64  `json:"file_size"`
	MimeType   string `json:"mime_type,omitempty"`
	TargetPath string `json:"target_path,omitempty"`
	ChunkSize  int    `json:"chunk_size,omitempty"` // Optional, server can override
}

// InitUploadResponse represents the response after initializing an upload
type InitUploadResponse struct {
	UploadID    string         `json:"upload_id"`
	ChunkSize   int            `json:"chunk_size"`
	TotalChunks int            `json:"total_chunks"`
	Strategy    UploadStrategy `json:"strategy"`
	ExpiresAt   time.Time      `json:"expires_at"`
}

// UploadChunkResponse represents the response after uploading a chunk
type UploadChunkResponse struct {
	ChunkIndex         int    `json:"chunk_index"`
	ServerChecksum     string `json:"server_checksum"`
	NextExpectedChunk  int    `json:"next_expected_chunk"`
	ChunksUploaded     int    `json:"chunks_uploaded"`
	TotalChunks        int    `json:"total_chunks"`
	BytesUploaded      int64  `json:"bytes_uploaded"`
	TotalBytes         int64  `json:"total_bytes"`
}

// UploadStatusResponse represents the current status of an upload
type UploadStatusResponse struct {
	UploadID       string       `json:"upload_id"`
	Status         UploadStatus `json:"status"`
	ChunksUploaded int          `json:"chunks_uploaded"`
	TotalChunks    int          `json:"total_chunks"`
	BytesUploaded  int64        `json:"bytes_uploaded"`
	TotalBytes     int64        `json:"total_bytes"`
	PercentComplete float64     `json:"percent_complete"`
	ErrorMessage   string       `json:"error_message,omitempty"`
}

// FinalizeUploadResponse represents the response after finalizing an upload
type FinalizeUploadResponse struct {
	Success  bool   `json:"success"`
	FileID   string `json:"file_id,omitempty"`
	BlobPath string `json:"blob_path,omitempty"`
	Message  string `json:"message,omitempty"`
}

// ResumeUploadResponse represents the response for resuming an upload
type ResumeUploadResponse struct {
	UploadID          string `json:"upload_id"`
	NextExpectedChunk int    `json:"next_expected_chunk"`
	ChunksUploaded    int    `json:"chunks_uploaded"`
	TotalChunks       int    `json:"total_chunks"`
	ChunkSize         int    `json:"chunk_size"`
	MissingChunks     []int  `json:"missing_chunks,omitempty"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details string `json:"details,omitempty"`
}

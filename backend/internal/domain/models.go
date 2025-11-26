package domain

import (
	"time"

	"github.com/google/uuid"
)

// StorageStrategy describes how the final file is kept on GitHub.
type StorageStrategy string

const (
	StrategyRepoChunks   StorageStrategy = "repo_chunks"
	StrategyReleaseAsset StorageStrategy = "release_asset"
	StrategyGitLFS       StorageStrategy = "git_lfs"
)

// UploadStatus captures lifecycle of an upload.
type UploadStatus string

const (
	StatusPending    UploadStatus = "pending"
	StatusInProgress UploadStatus = "in_progress"
	StatusProcessing UploadStatus = "processing"
	StatusCompleted  UploadStatus = "completed"
	StatusFailed     UploadStatus = "failed"
	StatusAborted    UploadStatus = "aborted"
)

// Upload represents an upload session stored in the DB.
type Upload struct {
	ID             uuid.UUID
	UserID         uuid.UUID
	Filename       string
	MimeType       string
	TargetPath     string
	Strategy       StorageStrategy
	Status         UploadStatus
	ChunkSizeBytes int64
	TotalChunks    int
	TotalSizeBytes int64
	ReceivedChunks int
	ReceivedBytes  int64
	RepoName       string
	ManifestPath   string
	StoragePath    string
	FileID         *uuid.UUID
	CreatedAt      time.Time
	UpdatedAt      time.Time
	CompletedAt    *time.Time
}

// UploadChunk stores metadata for each received chunk.
type UploadChunk struct {
	UploadID    uuid.UUID
	ChunkIndex  int
	SizeBytes   int64
	Checksum    string
	TempPath    string
	ReceivedAt  time.Time
	PersistedAt *time.Time
}

// InitRequest contains payload from the frontend during initialization.
type InitRequest struct {
	FileName string `json:"filename"`
	Size     int64  `json:"size"`
	MimeType string `json:"mimeType"`
	Folder   string `json:"folder"`
}

// InitResponse describes upload session info returned to the frontend.
type InitResponse struct {
	UploadID      string           `json:"uploadId"`
	ChunkSize     int64            `json:"chunkSize"`
	TotalChunks   int              `json:"totalChunks"`
	Strategy      StorageStrategy  `json:"strategy"`
	RepoName      string           `json:"repoName"`
	MaxUploadSize int64            `json:"maxUploadSize"`
}

// ChunkResult is returned after each chunk is processed.
type ChunkResult struct {
	ReceivedChunk int  `json:"receivedChunk"`
	NextIndex     int  `json:"nextChunkIndex"`
	IsComplete    bool `json:"isComplete"`
}

// StatusResponse exposes upload progress for resume/polling.
type StatusResponse struct {
	UploadID      string          `json:"uploadId"`
	Status        UploadStatus    `json:"status"`
	Strategy      StorageStrategy `json:"strategy"`
	ReceivedBytes int64           `json:"receivedBytes"`
	ReceivedChunks int            `json:"receivedChunks"`
	TotalChunks   int             `json:"totalChunks"`
	ChunkSize     int64           `json:"chunkSize"`
	NextChunk     int             `json:"nextChunk"`
}

// FinalizeResult is returned after the upload is persisted in GitHub and DB.
type FinalizeResult struct {
	FileID    string    `json:"fileId"`
	Path      string    `json:"path"`
	Name      string    `json:"name"`
	SizeBytes int64     `json:"size"`
	Completed time.Time `json:"completedAt"`
}

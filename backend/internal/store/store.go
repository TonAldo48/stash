package store

import (
	"context"

	"github.com/google/uuid"

	"gitdrive-backend/internal/domain"
)

// Store defines persistence behavior for uploads and related entities.
type Store interface {
	CreateUpload(ctx context.Context, u *domain.Upload) error
	GetUpload(ctx context.Context, uploadID uuid.UUID, userID uuid.UUID) (*domain.Upload, error)
	UpdateUploadStatus(ctx context.Context, uploadID uuid.UUID, status domain.UploadStatus) error
	RecordChunk(ctx context.Context, chunk *domain.UploadChunk) error
	AdvanceUploadProgress(ctx context.Context, uploadID uuid.UUID, chunkIndex int, chunkSize int64) error
	ListChunks(ctx context.Context, uploadID uuid.UUID) ([]domain.UploadChunk, error)
	ResetChunks(ctx context.Context, uploadID uuid.UUID) error
	UpdateManifestPath(ctx context.Context, uploadID uuid.UUID, manifestPath string) error
	LinkFile(ctx context.Context, uploadID uuid.UUID, fileID uuid.UUID) error
	InsertFileRecord(ctx context.Context, params InsertFileParams) (uuid.UUID, error)
	UpsertUserStorageUsage(ctx context.Context, userID uuid.UUID, deltaBytes int64) error
}

// InsertFileParams is used to create a final entry in the files table.
type InsertFileParams struct {
	FileID          uuid.UUID
	UserID          uuid.UUID
	Name            string
	SizeBytes       int64
	Path            string
	RepoName        string
	StorageStrategy domain.StorageStrategy
	BlobPath        string
	MetadataJSON    []byte
}

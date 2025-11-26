package upload

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"gitdrive-backend/internal/config"
	"gitdrive-backend/internal/domain"
	githubclient "gitdrive-backend/internal/github"
	"gitdrive-backend/internal/store"
	"gitdrive-backend/internal/temp"
)

type (
	Upload          = domain.Upload
	UploadChunk     = domain.UploadChunk
	InitRequest     = domain.InitRequest
	InitResponse    = domain.InitResponse
	ChunkResult     = domain.ChunkResult
	StatusResponse  = domain.StatusResponse
	FinalizeResult  = domain.FinalizeResult
	StorageStrategy = domain.StorageStrategy
)

const (
	StrategyRepoChunks   = domain.StrategyRepoChunks
	StrategyReleaseAsset = domain.StrategyReleaseAsset
	StrategyGitLFS       = domain.StrategyGitLFS

	StatusPending    = domain.StatusPending
	StatusInProgress = domain.StatusInProgress
	StatusProcessing = domain.StatusProcessing
	StatusCompleted  = domain.StatusCompleted
	StatusFailed     = domain.StatusFailed
	StatusAborted    = domain.StatusAborted
)

// Service orchestrates upload lifecycle between DB, temp storage, and GitHub.
type Service struct {
	cfg       *config.Config
	store     store.Store
	tempStore *temp.Store
	github    githubclient.Client
}

// NewService constructs a Service instance.
func NewService(cfg *config.Config, st store.Store, tempStore *temp.Store, gh githubclient.Client) *Service {
	return &Service{
		cfg:       cfg,
		store:     st,
		tempStore: tempStore,
		github:    gh,
	}
}

// InitUpload creates a new upload record and returns chunking instructions.
func (s *Service) InitUpload(ctx context.Context, userID uuid.UUID, req InitRequest) (*InitResponse, error) {
	if req.FileName == "" {
		return nil, errors.New("filename is required")
	}
	if req.Size <= 0 {
		return nil, errors.New("file size must be greater than zero")
	}
	if req.Size > s.cfg.MaxUploadBytes {
		return nil, fmt.Errorf("file size exceeds max limit (%d bytes)", s.cfg.MaxUploadBytes)
	}

	chunkSize := s.cfg.DefaultChunkSizeBytes
	if req.Size < chunkSize {
		chunkSize = req.Size
	}
	if chunkSize > s.cfg.MaxChunkSizeBytes {
		chunkSize = s.cfg.MaxChunkSizeBytes
	}
	if chunkSize == 0 {
		chunkSize = s.cfg.DefaultChunkSizeBytes
	}
	totalChunks := int(req.Size / chunkSize)
	if req.Size%chunkSize != 0 {
		totalChunks++
	}

	strategy := s.pickStrategy(req.Size)

	uploadID := uuid.New()
	targetPath := sanitizePath(req.Folder)
	u := &Upload{
		ID:             uploadID,
		UserID:         userID,
		Filename:       req.FileName,
		MimeType:       req.MimeType,
		TargetPath:     targetPath,
		Strategy:       strategy,
		Status:         StatusPending,
		ChunkSizeBytes: chunkSize,
		TotalChunks:    totalChunks,
		TotalSizeBytes: req.Size,
		RepoName:       s.cfg.StorageRepo,
	}

	if err := s.store.CreateUpload(ctx, u); err != nil {
		return nil, err
	}

	return &InitResponse{
		UploadID:      uploadID.String(),
		ChunkSize:     chunkSize,
		TotalChunks:   totalChunks,
		Strategy:      strategy,
		RepoName:      s.cfg.StorageRepo,
		MaxUploadSize: s.cfg.MaxUploadBytes,
	}, nil
}

// HandleChunk streams a chunk to temp storage and updates DB progress.
func (s *Service) HandleChunk(ctx context.Context, userID uuid.UUID, uploadID uuid.UUID, chunkIndex int, chunkReader io.Reader, checksumHint string) (*ChunkResult, error) {
	upload, err := s.store.GetUpload(ctx, uploadID, userID)
	if err != nil {
		return nil, err
	}

	if upload.Status == StatusCompleted {
		return &ChunkResult{
			ReceivedChunk: chunkIndex,
			NextIndex:     upload.TotalChunks,
			IsComplete:    true,
		}, nil
	}

	if upload.Status == StatusAborted {
		return nil, errors.New("upload aborted")
	}

	if upload.Status == StatusFailed {
		return nil, errors.New("upload failed")
	}

	if chunkIndex < upload.ReceivedChunks {
		return &ChunkResult{
			ReceivedChunk: chunkIndex,
			NextIndex:     upload.ReceivedChunks,
			IsComplete:    upload.ReceivedChunks == upload.TotalChunks,
		}, nil
	}

	if chunkIndex > upload.ReceivedChunks {
		return nil, fmt.Errorf("unexpected chunk index %d, expected %d", chunkIndex, upload.ReceivedChunks)
	}

	tempPath, size, checksum, err := s.tempStore.WriteChunk(uploadID, chunkIndex, chunkReader)
	if err != nil {
		return nil, err
	}

	if checksumHint != "" && !strings.EqualFold(checksumHint, checksum) {
		_ = os.Remove(tempPath)
		return nil, fmt.Errorf("checksum mismatch for chunk %d", chunkIndex)
	}

	if err := s.store.RecordChunk(ctx, &UploadChunk{
		UploadID:   uploadID,
		ChunkIndex: chunkIndex,
		SizeBytes:  size,
		Checksum:   checksum,
		TempPath:   tempPath,
	}); err != nil {
		_ = os.Remove(tempPath)
		return nil, err
	}

	if err := s.store.AdvanceUploadProgress(ctx, uploadID, chunkIndex, size); err != nil {
		return nil, err
	}

	nextIdx := chunkIndex + 1
	return &ChunkResult{
		ReceivedChunk: chunkIndex,
		NextIndex:     nextIdx,
		IsComplete:    nextIdx == upload.TotalChunks,
	}, nil
}

// GetStatus returns the latest upload state for polling/resume.
func (s *Service) GetStatus(ctx context.Context, userID uuid.UUID, uploadID uuid.UUID) (*StatusResponse, error) {
	upload, err := s.store.GetUpload(ctx, uploadID, userID)
	if err != nil {
		return nil, err
	}
	return &StatusResponse{
		UploadID:      upload.ID.String(),
		Status:        upload.Status,
		Strategy:      upload.Strategy,
		ReceivedBytes: upload.ReceivedBytes,
		ReceivedChunks: upload.ReceivedChunks,
		TotalChunks:   upload.TotalChunks,
		ChunkSize:     upload.ChunkSizeBytes,
		NextChunk:     upload.ReceivedChunks,
	}, nil
}

// Finalize assembles chunks and writes them to GitHub storage.
func (s *Service) Finalize(ctx context.Context, userID uuid.UUID, uploadID uuid.UUID) (*FinalizeResult, error) {
	upload, err := s.store.GetUpload(ctx, uploadID, userID)
	if err != nil {
		return nil, err
	}

	if upload.Status == StatusCompleted && upload.FileID != nil {
		completedAt := time.Now().UTC()
		if upload.CompletedAt != nil {
			completedAt = upload.CompletedAt.UTC()
		}
		return &FinalizeResult{
			FileID:    upload.FileID.String(),
			Path:      upload.TargetPath,
			Name:      upload.Filename,
			SizeBytes: upload.TotalSizeBytes,
			Completed: completedAt,
		}, nil
	}

	if upload.ReceivedChunks != upload.TotalChunks {
		return nil, fmt.Errorf("cannot finalize: received %d/%d chunks", upload.ReceivedChunks, upload.TotalChunks)
	}

	chunks, err := s.store.ListChunks(ctx, uploadID)
	if err != nil {
		return nil, err
	}
	if len(chunks) != upload.TotalChunks {
		return nil, fmt.Errorf("chunk manifest incomplete (%d/%d)", len(chunks), upload.TotalChunks)
	}

	if err := s.store.UpdateUploadStatus(ctx, uploadID, StatusProcessing); err != nil {
		return nil, err
	}

	var fileID uuid.UUID
	switch upload.Strategy {
	case StrategyRepoChunks:
		fileID, err = s.finalizeRepoChunks(ctx, upload, chunks)
	case StrategyReleaseAsset:
		fileID, err = s.finalizeReleaseAsset(ctx, upload, chunks)
	case StrategyGitLFS:
		fileID, err = s.finalizeRepoChunks(ctx, upload, chunks)
	default:
		err = fmt.Errorf("unsupported strategy %s", upload.Strategy)
	}
	if err != nil {
		_ = s.store.UpdateUploadStatus(ctx, uploadID, StatusFailed)
		return nil, err
	}

	if err := s.store.LinkFile(ctx, uploadID, fileID); err != nil {
		return nil, err
	}
	if err := s.store.UpsertUserStorageUsage(ctx, upload.UserID, upload.TotalSizeBytes); err != nil {
		return nil, err
	}

	_ = s.tempStore.RemoveUpload(uploadID)

	return &FinalizeResult{
		FileID:    fileID.String(),
		Path:      upload.TargetPath,
		Name:      upload.Filename,
		SizeBytes: upload.TotalSizeBytes,
		Completed: time.Now().UTC(),
	}, nil
}

// Abort cancels an in-progress upload and removes temporary data.
func (s *Service) Abort(ctx context.Context, userID uuid.UUID, uploadID uuid.UUID) error {
	upload, err := s.store.GetUpload(ctx, uploadID, userID)
	if err != nil {
		return err
	}
	if upload.Status == StatusCompleted {
		return errors.New("cannot abort completed upload")
	}
	if err := s.store.UpdateUploadStatus(ctx, uploadID, StatusAborted); err != nil {
		return err
	}
	if err := s.store.ResetChunks(ctx, uploadID); err != nil {
		return err
	}
	return s.tempStore.RemoveUpload(uploadID)
}

func (s *Service) finalizeRepoChunks(ctx context.Context, upload *Upload, chunks []UploadChunk) (uuid.UUID, error) {
	root := fmt.Sprintf("uploads/%s/%s", upload.UserID.String(), upload.ID.String())
	chunksDir := root + "/chunks"

	for _, chunk := range chunks {
		data, err := os.ReadFile(chunk.TempPath)
		if err != nil {
			return uuid.Nil, err
		}
		chunkPath := fmt.Sprintf("%s/chunk-%05d", chunksDir, chunk.ChunkIndex)
		message := fmt.Sprintf("Upload chunk %d for %s", chunk.ChunkIndex, upload.Filename)
		if _, err := s.github.PutFile(ctx, upload.RepoName, chunkPath, message, data); err != nil {
			return uuid.Nil, err
		}
	}

	manifest, err := s.buildManifest(upload, chunks, chunksDir)
	if err != nil {
		return uuid.Nil, err
	}
	manifestPath := root + "/manifest.json"
	if _, err := s.github.PutFile(ctx, upload.RepoName, manifestPath, fmt.Sprintf("Add manifest for %s", upload.Filename), manifest); err != nil {
		return uuid.Nil, err
	}

	if err := s.store.UpdateManifestPath(ctx, upload.ID, manifestPath); err != nil {
		return uuid.Nil, err
	}

	meta := map[string]any{
		"manifestPath": manifestPath,
		"chunksPath":   chunksDir,
	}
	metaBytes, _ := json.Marshal(meta)
	fileID, err := s.store.InsertFileRecord(ctx, store.InsertFileParams{
		UserID:          upload.UserID,
		Name:            upload.Filename,
		SizeBytes:       upload.TotalSizeBytes,
		Path:            upload.TargetPath,
		RepoName:        upload.RepoName,
		StorageStrategy: upload.Strategy,
		BlobPath:        manifestPath,
		MetadataJSON:    metaBytes,
	})
	return fileID, err
}

func (s *Service) finalizeReleaseAsset(ctx context.Context, upload *Upload, chunks []UploadChunk) (uuid.UUID, error) {
	rootDir := filepath.Join(s.cfg.TempDir, upload.ID.String())
	assembledPath := filepath.Join(rootDir, "assembled.bin")
	if err := assembleFile(assembledPath, chunks); err != nil {
		return uuid.Nil, err
	}
	file, err := os.Open(assembledPath)
	if err != nil {
		return uuid.Nil, err
	}
	defer file.Close()

	tag := fmt.Sprintf("upload-%s", upload.ID.String())
	body := fmt.Sprintf("Release for upload %s", upload.Filename)
	release, err := s.github.EnsureRelease(ctx, upload.RepoName, tag, upload.Filename, body)
	if err != nil {
		return uuid.Nil, err
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return uuid.Nil, err
	}
	assetName := upload.Filename
	contentType := githubclient.ContentTypeFromName(upload.Filename)
	asset, err := s.github.UploadReleaseAsset(ctx, upload.RepoName, release.GetID(), assetName, contentType, file)
	if err != nil {
		return uuid.Nil, err
	}

	meta := map[string]any{
		"releaseId": release.GetID(),
		"assetId":   asset.GetID(),
		"assetName": asset.GetName(),
		"tag":       tag,
	}
	metaBytes, _ := json.Marshal(meta)
	fileID, err := s.store.InsertFileRecord(ctx, store.InsertFileParams{
		UserID:          upload.UserID,
		Name:            upload.Filename,
		SizeBytes:       upload.TotalSizeBytes,
		Path:            upload.TargetPath,
		RepoName:        upload.RepoName,
		StorageStrategy: upload.Strategy,
		BlobPath:        fmt.Sprintf("release:%d:%d", release.GetID(), asset.GetID()),
		MetadataJSON:    metaBytes,
	})
	return fileID, err
}

func (s *Service) pickStrategy(size int64) StorageStrategy {
	if s.cfg.EnableGitLFS && size <= s.cfg.LFSThresholdBytes {
		return StrategyGitLFS
	}
	if s.cfg.EnableReleaseAssets && size <= s.cfg.ReleaseMaxBytes {
		return StrategyReleaseAsset
	}
	return StrategyRepoChunks
}

func (s *Service) buildManifest(upload *Upload, chunks []UploadChunk, chunksDir string) ([]byte, error) {
	type manifestChunk struct {
		Index    int    `json:"index"`
		Size     int64  `json:"size"`
		Checksum string `json:"checksum"`
		Path     string `json:"path"`
	}
	payload := struct {
		SchemaVersion string          `json:"schemaVersion"`
		Strategy      StorageStrategy `json:"strategy"`
		UploadID      string          `json:"uploadId"`
		UserID        string          `json:"userId"`
		FileName      string          `json:"fileName"`
		SizeBytes     int64           `json:"sizeBytes"`
		ChunkSize     int64           `json:"chunkSize"`
		TotalChunks   int             `json:"totalChunks"`
		ChunksPath    string          `json:"chunksPath"`
		Chunks        []manifestChunk `json:"chunks"`
		CreatedAt     time.Time       `json:"createdAt"`
	}{
		SchemaVersion: "2024-11-01",
		Strategy:      upload.Strategy,
		UploadID:      upload.ID.String(),
		UserID:        upload.UserID.String(),
		FileName:      upload.Filename,
		SizeBytes:     upload.TotalSizeBytes,
		ChunkSize:     upload.ChunkSizeBytes,
		TotalChunks:   upload.TotalChunks,
		ChunksPath:    chunksDir,
		CreatedAt:     time.Now().UTC(),
	}
	for _, chunk := range chunks {
		payload.Chunks = append(payload.Chunks, manifestChunk{
			Index:    chunk.ChunkIndex,
			Size:     chunk.SizeBytes,
			Checksum: chunk.Checksum,
			Path:     fmt.Sprintf("%s/chunk-%05d", chunksDir, chunk.ChunkIndex),
		})
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	if err := enc.Encode(payload); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func sanitizePath(path string) string {
	if strings.TrimSpace(path) == "" {
		return "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	path = filepath.Clean(path)
	if path == "." {
		return "/"
	}
	return path
}

func assembleFile(dest string, chunks []UploadChunk) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	file, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer file.Close()

	for _, chunk := range chunks {
		data, err := os.Open(chunk.TempPath)
		if err != nil {
			return err
		}
		if _, err := io.Copy(file, data); err != nil {
			data.Close()
			return err
		}
		data.Close()
	}
	return nil
}

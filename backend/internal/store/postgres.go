package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"gitdrive-backend/internal/domain"
)

// PostgresStore implements Store using a PostgreSQL database (Supabase).
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore connects to the database using the provided connection string.
func NewPostgresStore(ctx context.Context, conn string) (*PostgresStore, error) {
	cfg, err := pgxpool.ParseConfig(conn)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &PostgresStore{pool: pool}, nil
}

// Close releases the underlying pool resources.
func (s *PostgresStore) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

func (s *PostgresStore) CreateUpload(ctx context.Context, u *domain.Upload) error {
	query := `
		INSERT INTO uploads (
			id, user_id, filename, mime_type, target_path, strategy, status,
			chunk_size_bytes, total_chunks, total_size_bytes, received_chunks,
			received_bytes, repo_name, created_at, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,$11,now(),now()
		)
	`
	_, err := s.pool.Exec(ctx, query,
		u.ID, u.UserID, u.Filename, u.MimeType, u.TargetPath, string(u.Strategy),
		string(u.Status), u.ChunkSizeBytes, u.TotalChunks, u.TotalSizeBytes, u.RepoName,
	)
	return err
}

func (s *PostgresStore) GetUpload(ctx context.Context, uploadID uuid.UUID, userID uuid.UUID) (*domain.Upload, error) {
	query := `
		SELECT id, user_id, filename, mime_type, target_path, strategy, status,
		       chunk_size_bytes, total_chunks, total_size_bytes, received_chunks,
		       received_bytes, repo_name, manifest_path, storage_path, file_id,
		       created_at, updated_at, completed_at
		FROM uploads
		WHERE id = $1 AND user_id = $2
	`
	row := s.pool.QueryRow(ctx, query, uploadID, userID)
	var u domain.Upload
	var strategy string
	var status string
	err := row.Scan(
		&u.ID,
		&u.UserID,
		&u.Filename,
		&u.MimeType,
		&u.TargetPath,
		&strategy,
		&status,
		&u.ChunkSizeBytes,
		&u.TotalChunks,
		&u.TotalSizeBytes,
		&u.ReceivedChunks,
		&u.ReceivedBytes,
		&u.RepoName,
		&u.ManifestPath,
		&u.StoragePath,
		&u.FileID,
		&u.CreatedAt,
		&u.UpdatedAt,
		&u.CompletedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUploadNotFound
	}
	if err != nil {
		return nil, err
	}
	u.Strategy = domain.StorageStrategy(strategy)
	u.Status = domain.UploadStatus(status)
	return &u, nil
}

func (s *PostgresStore) UpdateUploadStatus(ctx context.Context, uploadID uuid.UUID, status domain.UploadStatus) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE uploads SET status=$2, updated_at=now() WHERE id=$1
	`, uploadID, string(status))
	return err
}

func (s *PostgresStore) RecordChunk(ctx context.Context, chunk *domain.UploadChunk) error {
	query := `
		INSERT INTO upload_chunks (upload_id, chunk_index, size_bytes, checksum, temp_path, received_at)
		VALUES ($1,$2,$3,$4,$5,now())
		ON CONFLICT (upload_id, chunk_index) DO UPDATE SET
			size_bytes = EXCLUDED.size_bytes,
			checksum = EXCLUDED.checksum,
			temp_path = EXCLUDED.temp_path,
			received_at = now()
	`
	_, err := s.pool.Exec(ctx, query,
		chunk.UploadID, chunk.ChunkIndex, chunk.SizeBytes, chunk.Checksum, chunk.TempPath,
	)
	return err
}

func (s *PostgresStore) AdvanceUploadProgress(ctx context.Context, uploadID uuid.UUID, chunkIndex int, chunkSize int64) error {
	res, err := s.pool.Exec(ctx, `
		UPDATE uploads
		SET received_chunks = received_chunks + 1,
		    received_bytes = received_bytes + $3,
		    status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
		    updated_at = now()
		WHERE id = $1 AND received_chunks = $2 AND status IN ('pending','in_progress')
	`, uploadID, chunkIndex, chunkSize)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrChunkOutOfOrder
	}
	return nil
}

func (s *PostgresStore) ListChunks(ctx context.Context, uploadID uuid.UUID) ([]domain.UploadChunk, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT upload_id, chunk_index, size_bytes, checksum, temp_path, received_at
		FROM upload_chunks
		WHERE upload_id = $1
		ORDER BY chunk_index ASC
	`, uploadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chunks []domain.UploadChunk
	for rows.Next() {
		var chunk domain.UploadChunk
		if err := rows.Scan(
			&chunk.UploadID,
			&chunk.ChunkIndex,
			&chunk.SizeBytes,
			&chunk.Checksum,
			&chunk.TempPath,
			&chunk.ReceivedAt,
		); err != nil {
			return nil, err
		}
		chunks = append(chunks, chunk)
	}
	return chunks, rows.Err()
}

func (s *PostgresStore) ResetChunks(ctx context.Context, uploadID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM upload_chunks WHERE upload_id=$1`, uploadID)
	return err
}

func (s *PostgresStore) UpdateManifestPath(ctx context.Context, uploadID uuid.UUID, manifestPath string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE uploads SET manifest_path=$2, updated_at=now() WHERE id=$1
	`, uploadID, manifestPath)
	return err
}

func (s *PostgresStore) LinkFile(ctx context.Context, uploadID uuid.UUID, fileID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE uploads
		SET file_id=$2, status='completed', completed_at=now(), updated_at=now()
		WHERE id=$1
	`, uploadID, fileID)
	return err
}

func (s *PostgresStore) InsertFileRecord(ctx context.Context, params InsertFileParams) (uuid.UUID, error) {
	if params.FileID == uuid.Nil {
		params.FileID = uuid.New()
	}
	if params.MetadataJSON == nil {
		params.MetadataJSON = json.RawMessage(`{}`)
	}
	if params.Path == "" {
		params.Path = "/"
	}
	query := `
		INSERT INTO files (
			id, user_id, name, type, size_bytes, path,
			repo_name, blob_path, storage_strategy, storage_metadata, created_at
		) VALUES (
			$1,$2,$3,'file',$4,$5,$6,$7,$8,$9,now()
		)
		RETURNING id
	`
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, query,
		params.FileID,
		params.UserID,
		params.Name,
		params.SizeBytes,
		params.Path,
		params.RepoName,
		params.BlobPath,
		string(params.StorageStrategy),
		params.MetadataJSON,
	).Scan(&id)
	return id, err
}

// UpsertUserStorageUsage increments usage counters after successful uploads.
func (s *PostgresStore) UpsertUserStorageUsage(ctx context.Context, userID uuid.UUID, deltaBytes int64) error {
	query := `
		INSERT INTO user_storage_usage (user_id, total_bytes, file_count, folder_count)
		VALUES ($1, $2, 1, 0)
		ON CONFLICT (user_id)
		DO UPDATE SET
			total_bytes = user_storage_usage.total_bytes + EXCLUDED.total_bytes,
			file_count = user_storage_usage.file_count + 1,
			updated_at = now()
	`
	_, err := s.pool.Exec(ctx, query, userID, deltaBytes)
	return err
}

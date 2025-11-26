package main

import (
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "github.com/lib/pq"
)

type Upload struct {
	ID            string
	UserID        string
	Filename      string
	MimeType      string
	SizeBytes     int64
	TargetPath    string
	RepoName      string
	Strategy      string
	ChunkSize     int
	TotalChunks   int
	Status        string
	GitHubPath    string
	GitHubAssetID string
	ManifestPath  string
	ErrorMessage  string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	CompletedAt   *time.Time
}

type Chunk struct {
	ID              string
	UploadID        string
	ChunkIndex      int
	SizeBytes       int
	Checksum        string
	TempStoragePath string
	GitHubPath      string
	Status          string
	UploadedAt      *time.Time
	VerifiedAt      *time.Time
}

var db *sql.DB

func initDB() error {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		return fmt.Errorf("DATABASE_URL environment variable not set")
	}

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		return err
	}

	return db.Ping()
}

func createUploadRecord(req InitUploadRequest, chunkSize, totalChunks int, strategy string) (string, error) {
	query := `
		INSERT INTO uploads (user_id, filename, mime_type, size_bytes, target_path, strategy, chunk_size, total_chunks, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`

	var uploadID string
	err := db.QueryRow(
		query,
		req.UserID,
		req.Filename,
		req.MimeType,
		req.SizeBytes,
		req.TargetPath,
		strategy,
		chunkSize,
		totalChunks,
		"pending",
	).Scan(&uploadID)

	return uploadID, err
}

func getUpload(uploadID, userID string) (*Upload, error) {
	query := `
		SELECT id, user_id, filename, mime_type, size_bytes, target_path, repo_name, 
		       strategy, chunk_size, total_chunks, status, github_path, github_asset_id, 
		       manifest_path, error_message, created_at, updated_at, completed_at
		FROM uploads
		WHERE id = $1 AND user_id = $2
	`

	upload := &Upload{}
	var completedAt sql.NullTime
	err := db.QueryRow(query, uploadID, userID).Scan(
		&upload.ID,
		&upload.UserID,
		&upload.Filename,
		&upload.MimeType,
		&upload.SizeBytes,
		&upload.TargetPath,
		&upload.RepoName,
		&upload.Strategy,
		&upload.ChunkSize,
		&upload.TotalChunks,
		&upload.Status,
		&upload.GitHubPath,
		&upload.GitHubAssetID,
		&upload.ManifestPath,
		&upload.ErrorMessage,
		&upload.CreatedAt,
		&upload.UpdatedAt,
		&completedAt,
	)

	if err != nil {
		return nil, err
	}

	if completedAt.Valid {
		upload.CompletedAt = &completedAt.Time
	}

	return upload, nil
}

func updateUploadStatus(uploadID, status string) error {
	query := `UPDATE uploads SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := db.Exec(query, status, uploadID)
	return err
}

func updateUploadError(uploadID, errorMsg string) error {
	query := `UPDATE uploads SET error_message = $1, updated_at = NOW() WHERE id = $2`
	_, err := db.Exec(query, errorMsg, uploadID)
	return err
}

func updateUploadCompletedAt(uploadID string, completedAt time.Time) error {
	query := `UPDATE uploads SET completed_at = $1, updated_at = NOW() WHERE id = $2`
	_, err := db.Exec(query, completedAt, uploadID)
	return err
}

func updateUploadPaths(uploadID, githubPath, manifestPath string) error {
	query := `UPDATE uploads SET github_path = $1, manifest_path = $2, updated_at = NOW() WHERE id = $3`
	_, err := db.Exec(query, githubPath, manifestPath, uploadID)
	return err
}

func recordChunk(uploadID string, chunkIndex, sizeBytes int, checksum, tempPath string) error {
	query := `
		INSERT INTO upload_chunks (upload_id, chunk_index, size_bytes, checksum, temp_storage_path, status)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (upload_id, chunk_index) 
		DO UPDATE SET size_bytes = $3, checksum = $4, temp_storage_path = $5, status = $6, uploaded_at = NOW()
	`

	_, err := db.Exec(query, uploadID, chunkIndex, sizeBytes, checksum, tempPath, "uploaded")
	return err
}

func getChunks(uploadID string) ([]*Chunk, error) {
	query := `
		SELECT id, upload_id, chunk_index, size_bytes, checksum, temp_storage_path, 
		       github_path, status, uploaded_at, verified_at
		FROM upload_chunks
		WHERE upload_id = $1
		ORDER BY chunk_index
	`

	rows, err := db.Query(query, uploadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chunks []*Chunk
	for rows.Next() {
		chunk := &Chunk{}
		var uploadedAt, verifiedAt sql.NullTime

		err := rows.Scan(
			&chunk.ID,
			&chunk.UploadID,
			&chunk.ChunkIndex,
			&chunk.SizeBytes,
			&chunk.Checksum,
			&chunk.TempStoragePath,
			&chunk.GitHubPath,
			&chunk.Status,
			&uploadedAt,
			&verifiedAt,
		)

		if err != nil {
			return nil, err
		}

		if uploadedAt.Valid {
			chunk.UploadedAt = &uploadedAt.Time
		}
		if verifiedAt.Valid {
			chunk.VerifiedAt = &verifiedAt.Time
		}

		chunks = append(chunks, chunk)
	}

	return chunks, rows.Err()
}

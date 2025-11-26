package temp

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

// Store persists in-flight chunks on disk before finalization.
type Store struct {
	basePath string
}

// NewStore creates a Store rooted at basePath.
func NewStore(basePath string) (*Store, error) {
	if err := os.MkdirAll(basePath, 0o755); err != nil {
		return nil, err
	}
	return &Store{basePath: basePath}, nil
}

// ChunkPath returns the on-disk location for a chunk.
func (s *Store) ChunkPath(uploadID uuid.UUID, chunkIndex int) string {
	return filepath.Join(s.basePath, uploadID.String(), "chunks", fmt.Sprintf("chunk-%05d", chunkIndex))
}

// WriteChunk copies the incoming chunk reader to disk and computes its checksum.
func (s *Store) WriteChunk(uploadID uuid.UUID, chunkIndex int, data io.Reader) (string, int64, string, error) {
	chunkPath := s.ChunkPath(uploadID, chunkIndex)
	if err := os.MkdirAll(filepath.Dir(chunkPath), 0o755); err != nil {
		return "", 0, "", err
	}

	tmpPath := chunkPath + ".partial"
	file, err := os.Create(tmpPath)
	if err != nil {
		return "", 0, "", err
	}
	defer file.Close()

	hasher := sha256.New()
	w := io.MultiWriter(file, hasher)
	written, err := io.Copy(w, data)
	if err != nil {
		_ = os.Remove(tmpPath)
		return "", 0, "", err
	}

	if err := file.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return "", 0, "", err
	}

	if err := os.Rename(tmpPath, chunkPath); err != nil {
		_ = os.Remove(tmpPath)
		return "", 0, "", err
	}

	checksum := hex.EncodeToString(hasher.Sum(nil))
	return chunkPath, written, checksum, nil
}

// OpenChunk opens a chunk file for reading.
func (s *Store) OpenChunk(path string) (*os.File, error) {
	return os.Open(path)
}

// RemoveUpload deletes all temporary files associated with the upload.
func (s *Store) RemoveUpload(uploadID uuid.UUID) error {
	return os.RemoveAll(filepath.Join(s.basePath, uploadID.String()))
}

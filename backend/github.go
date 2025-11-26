package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/google/go-github/v60/github"
	"golang.org/x/oauth2"
)

type GitHubStorage struct {
	client *github.Client
	owner  string
}

func NewGitHubStorage(token string) (*GitHubStorage, error) {
	ctx := oauth2.NewClient(nil, oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	))

	client := github.NewClient(ctx)

	// Get authenticated user to determine owner
	user, _, err := client.Users.Get(nil, "")
	if err != nil {
		return nil, fmt.Errorf("failed to get GitHub user: %w", err)
	}

	return &GitHubStorage{
		client: client,
		owner:  user.GetLogin(),
	}, nil
}

func (gs *GitHubStorage) ensureRepo(repoName string) error {
	_, _, err := gs.client.Repositories.Get(nil, gs.owner, repoName)
	if err == nil {
		return nil // Repo exists
	}

	// Create repo if it doesn't exist
	repo := &github.Repository{
		Name:    github.String(repoName),
		Private: github.Bool(true),
		AutoInit: github.Bool(true),
	}

	_, _, err = gs.client.Repositories.Create(nil, "", repo)
	return err
}

func (gs *GitHubStorage) uploadFileLFS(repoName, path string, content []byte, message string) error {
	// For LFS, we'll use regular file upload for now
	// In production, you'd use Git LFS API
	return gs.uploadFile(repoName, path, content, message)
}

func (gs *GitHubStorage) uploadFile(repoName, path string, content []byte, message string) error {
	// Check if file exists to get SHA for update
	var sha *string
	file, _, _, err := gs.client.Repositories.GetContents(nil, gs.owner, repoName, path, nil)
	if err == nil && file != nil {
		sha = file.SHA
	}

	opts := &github.RepositoryContentFileOptions{
		Message: github.String(message),
		Content: content,
		SHA:     sha,
	}

	_, _, err = gs.client.Repositories.CreateFile(nil, gs.owner, repoName, path, opts)
	return err
}

func (gs *GitHubStorage) uploadChunkedFile(repoName, basePath string, chunks []*Chunk, filename string) (string, string, error) {
	// Assemble chunks into a single file
	tempFile := filepath.Join(os.TempDir(), fmt.Sprintf("assemble-%s-%d", filename, time.Now().UnixNano()))
	defer os.Remove(tempFile)

	outFile, err := os.Create(tempFile)
	if err != nil {
		return "", "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer outFile.Close()

	// Write chunks in order
	for _, chunk := range chunks {
		chunkFile, err := os.Open(chunk.TempStoragePath)
		if err != nil {
			return "", "", fmt.Errorf("failed to open chunk %d: %w", chunk.ChunkIndex, err)
		}

		_, err = io.Copy(outFile, chunkFile)
		chunkFile.Close()
		if err != nil {
			return "", "", fmt.Errorf("failed to copy chunk %d: %w", chunk.ChunkIndex, err)
		}
	}

	// Read assembled file
	assembledContent, err := os.ReadFile(tempFile)
	if err != nil {
		return "", "", fmt.Errorf("failed to read assembled file: %w", err)
	}

	// Upload assembled file
	uploadPath := filepath.Join(basePath, filename)
	message := fmt.Sprintf("Upload %s (chunked)", filename)
	if err := gs.uploadFile(repoName, uploadPath, assembledContent, message); err != nil {
		return "", "", fmt.Errorf("failed to upload file: %w", err)
	}

	// Create manifest for chunked uploads
	manifest := map[string]interface{}{
		"filename":    filename,
		"total_chunks": len(chunks),
		"chunk_size":  chunks[0].SizeBytes,
		"chunks":      make([]map[string]interface{}, len(chunks)),
	}

	for i, chunk := range chunks {
		manifest["chunks"].([]map[string]interface{})[i] = map[string]interface{}{
			"index":    chunk.ChunkIndex,
			"size":     chunk.SizeBytes,
			"checksum": chunk.Checksum,
		}
	}

	manifestJSON, _ := json.Marshal(manifest)
	manifestPath := filepath.Join(basePath, fmt.Sprintf("%s.manifest.json", filename))
	_ = gs.uploadFile(repoName, manifestPath, manifestJSON, fmt.Sprintf("Manifest for %s", filename)) // Ignore manifest errors

	return uploadPath, manifestPath, nil
}

func finalizeUpload(upload *Upload, chunks []*Chunk, githubToken string) (string, string, error) {
	storage, err := NewGitHubStorage(githubToken)
	if err != nil {
		return "", "", fmt.Errorf("failed to create GitHub storage: %w", err)
	}

	// Determine or create storage repo
	repoName := upload.RepoName
	if repoName == "" {
		repoName = "gitdrive-storage-001" // Default, should be determined from DB
	}

	if err := storage.ensureRepo(repoName); err != nil {
		return "", "", fmt.Errorf("failed to ensure repo exists: %w", err)
	}

	var githubPath string
	var manifestPath string
	basePath := fmt.Sprintf("uploads/%s/%s", upload.UserID, upload.ID)

	switch upload.Strategy {
	case "lfs":
		// Assemble and upload as LFS file
		tempFile := filepath.Join(os.TempDir(), fmt.Sprintf("lfs-%s-%d", upload.Filename, time.Now().UnixNano()))
		defer os.Remove(tempFile)

		outFile, err := os.Create(tempFile)
		if err != nil {
			return "", "", err
		}
		defer outFile.Close()

		for _, chunk := range chunks {
			chunkFile, _ := os.Open(chunk.TempStoragePath)
			io.Copy(outFile, chunkFile)
			chunkFile.Close()
		}

		content, _ := os.ReadFile(tempFile)
		uploadPath := filepath.Join(basePath, upload.Filename)
		if err := storage.uploadFileLFS(repoName, uploadPath, content, fmt.Sprintf("Upload %s via LFS", upload.Filename)); err != nil {
			return "", "", err
		}
		githubPath = uploadPath
		manifestPath = "" // No manifest for LFS

	case "repo-chunked":
		// Upload as chunked file with manifest
		var err error
		githubPath, manifestPath, err = storage.uploadChunkedFile(repoName, basePath, chunks, upload.Filename)
		if err != nil {
			return "", "", err
		}

	default:
		return "", "", fmt.Errorf("unknown strategy: %s", upload.Strategy)
	}

	// Create file record in database (this would typically be done via API call to Next.js)
	// For now, we'll return the paths and let the Next.js server action handle DB insertion
	fileID := "" // Would be generated by Next.js server action

	// Use manifestPath to avoid unused variable warning
	_ = manifestPath

	return fileID, githubPath, nil
}

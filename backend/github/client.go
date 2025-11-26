package github

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/go-github/v60/github"
	"golang.org/x/oauth2"
)

// Client wraps the GitHub API client
type Client struct {
	client   *github.Client
	owner    string
	ctx      context.Context
}

// NewClient creates a new GitHub client with user access token
func NewClient(ctx context.Context, accessToken string) (*Client, error) {
	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: accessToken},
	)
	tc := oauth2.NewClient(ctx, ts)
	client := github.NewClient(tc)

	// Get the authenticated user
	user, _, err := client.Users.Get(ctx, "")
	if err != nil {
		return nil, fmt.Errorf("failed to get authenticated user: %w", err)
	}

	return &Client{
		client: client,
		owner:  user.GetLogin(),
		ctx:    ctx,
	}, nil
}

// GetOwner returns the authenticated user's login
func (c *Client) GetOwner() string {
	return c.owner
}

// RepoExists checks if a repository exists
func (c *Client) RepoExists(repoName string) (bool, error) {
	_, resp, err := c.client.Repositories.Get(c.ctx, c.owner, repoName)
	if err != nil {
		if resp != nil && resp.StatusCode == 404 {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// CreateRepo creates a new private repository
func (c *Client) CreateRepo(name string) error {
	exists, err := c.RepoExists(name)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	repo := &github.Repository{
		Name:     github.String(name),
		Private:  github.Bool(true),
		AutoInit: github.Bool(true),
	}

	_, _, err = c.client.Repositories.Create(c.ctx, "", repo)
	if err != nil {
		return fmt.Errorf("failed to create repository: %w", err)
	}

	// Wait a bit for the repo to be fully initialized
	time.Sleep(2 * time.Second)

	return nil
}

// UploadFile uploads a file to the repository
func (c *Client) UploadFile(repo, path string, content []byte, message string) (*github.RepositoryContentResponse, error) {
	// Check if file exists to get its SHA (for updates)
	var sha *string
	existing, _, _, err := c.client.Repositories.GetContents(c.ctx, c.owner, repo, path, nil)
	if err == nil && existing != nil {
		sha = existing.SHA
	}

	opts := &github.RepositoryContentFileOptions{
		Message: github.String(message),
		Content: content,
		SHA:     sha,
	}

	resp, _, err := c.client.Repositories.CreateFile(c.ctx, c.owner, repo, path, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to upload file: %w", err)
	}

	return resp, nil
}

// UploadFileFromPath uploads a file from the local filesystem
func (c *Client) UploadFileFromPath(repo, remotePath, localPath, message string) (*github.RepositoryContentResponse, error) {
	content, err := os.ReadFile(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	return c.UploadFile(repo, remotePath, content, message)
}

// UploadChunkFile uploads a chunk file and returns its blob SHA
func (c *Client) UploadChunkFile(repo, path string, content []byte) (string, error) {
	resp, err := c.UploadFile(repo, path, content, "Upload chunk")
	if err != nil {
		return "", err
	}

	if resp.Content != nil && resp.Content.SHA != nil {
		return *resp.Content.SHA, nil
	}

	return "", nil
}

// AssembleChunksAndUpload reads chunk files from temp storage, assembles them, and uploads
func (c *Client) AssembleChunksAndUpload(repo, targetPath string, chunkPaths []string, message string) (*github.RepositoryContentResponse, error) {
	// Create a temporary file to assemble chunks
	tmpFile, err := os.CreateTemp("", "assembled-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	// Assemble chunks
	for _, chunkPath := range chunkPaths {
		chunkData, err := os.ReadFile(chunkPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read chunk %s: %w", chunkPath, err)
		}
		if _, err := tmpFile.Write(chunkData); err != nil {
			return nil, fmt.Errorf("failed to write chunk: %w", err)
		}
	}

	// Read the assembled file
	if _, err := tmpFile.Seek(0, 0); err != nil {
		return nil, fmt.Errorf("failed to seek: %w", err)
	}

	content, err := io.ReadAll(tmpFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read assembled file: %w", err)
	}

	return c.UploadFile(repo, targetPath, content, message)
}

// UploadManifest uploads the chunk manifest file
func (c *Client) UploadManifest(repo, path string, manifest interface{}) error {
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal manifest: %w", err)
	}

	_, err = c.UploadFile(repo, path, data, "Upload manifest")
	return err
}

// GetFile retrieves a file's content from the repository
func (c *Client) GetFile(repo, path string) ([]byte, string, error) {
	content, _, resp, err := c.client.Repositories.GetContents(c.ctx, c.owner, repo, path, nil)
	if err != nil {
		if resp != nil && resp.StatusCode == 404 {
			return nil, "", nil
		}
		return nil, "", fmt.Errorf("failed to get file: %w", err)
	}

	if content == nil || content.Content == nil {
		return nil, "", fmt.Errorf("file content is nil")
	}

	decoded, err := base64.StdEncoding.DecodeString(*content.Content)
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode content: %w", err)
	}

	return decoded, content.GetSHA(), nil
}

// DeleteFile deletes a file from the repository
func (c *Client) DeleteFile(repo, path, sha, message string) error {
	opts := &github.RepositoryContentFileOptions{
		Message: github.String(message),
		SHA:     github.String(sha),
	}

	_, _, err := c.client.Repositories.DeleteFile(c.ctx, c.owner, repo, path, opts)
	if err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	return nil
}

// CreateTree creates a Git tree with multiple files
func (c *Client) CreateTree(repo string, files map[string][]byte, baseTree string) (*github.Tree, error) {
	var entries []*github.TreeEntry

	for path, content := range files {
		// Create a blob for the content
		blob, _, err := c.client.Git.CreateBlob(c.ctx, c.owner, repo, &github.Blob{
			Content:  github.String(base64.StdEncoding.EncodeToString(content)),
			Encoding: github.String("base64"),
		})
		if err != nil {
			return nil, fmt.Errorf("failed to create blob for %s: %w", path, err)
		}

		entries = append(entries, &github.TreeEntry{
			Path: github.String(path),
			Mode: github.String("100644"),
			Type: github.String("blob"),
			SHA:  blob.SHA,
		})
	}

	tree, _, err := c.client.Git.CreateTree(c.ctx, c.owner, repo, baseTree, entries)
	if err != nil {
		return nil, fmt.Errorf("failed to create tree: %w", err)
	}

	return tree, nil
}

// CommitTree creates a commit with the given tree
func (c *Client) CommitTree(repo, message string, tree *github.Tree, parents []string) (*github.Commit, error) {
	var parentCommits []*github.Commit
	for _, sha := range parents {
		parentCommits = append(parentCommits, &github.Commit{SHA: github.String(sha)})
	}

	commit := &github.Commit{
		Message: github.String(message),
		Tree:    tree,
		Parents: parentCommits,
	}

	newCommit, _, err := c.client.Git.CreateCommit(c.ctx, c.owner, repo, commit, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create commit: %w", err)
	}

	return newCommit, nil
}

// UpdateRef updates a Git reference (branch) to point to a new commit
func (c *Client) UpdateRef(repo, ref, sha string) error {
	_, _, err := c.client.Git.UpdateRef(c.ctx, c.owner, repo, &github.Reference{
		Ref: github.String(ref),
		Object: &github.GitObject{
			SHA: github.String(sha),
		},
	}, false)

	if err != nil {
		return fmt.Errorf("failed to update ref: %w", err)
	}

	return nil
}

// GetLatestCommit gets the latest commit SHA from the default branch
func (c *Client) GetLatestCommit(repo string) (string, error) {
	// Get the default branch
	repoInfo, _, err := c.client.Repositories.Get(c.ctx, c.owner, repo)
	if err != nil {
		return "", fmt.Errorf("failed to get repo info: %w", err)
	}

	defaultBranch := repoInfo.GetDefaultBranch()
	if defaultBranch == "" {
		defaultBranch = "main"
	}

	// Get the ref
	ref, _, err := c.client.Git.GetRef(c.ctx, c.owner, repo, "refs/heads/"+defaultBranch)
	if err != nil {
		return "", fmt.Errorf("failed to get ref: %w", err)
	}

	return ref.GetObject().GetSHA(), nil
}

// BatchUploadChunks uploads multiple chunks in a single commit using Git Data API
func (c *Client) BatchUploadChunks(repo string, chunks map[string][]byte, message string) error {
	// Get the latest commit
	latestCommit, err := c.GetLatestCommit(repo)
	if err != nil {
		return fmt.Errorf("failed to get latest commit: %w", err)
	}

	// Get the tree of the latest commit
	commit, _, err := c.client.Git.GetCommit(c.ctx, c.owner, repo, latestCommit)
	if err != nil {
		return fmt.Errorf("failed to get commit: %w", err)
	}

	// Create new tree with the chunks
	tree, err := c.CreateTree(repo, chunks, commit.GetTree().GetSHA())
	if err != nil {
		return err
	}

	// Create a new commit
	newCommit, err := c.CommitTree(repo, message, tree, []string{latestCommit})
	if err != nil {
		return err
	}

	// Update the default branch reference
	repoInfo, _, err := c.client.Repositories.Get(c.ctx, c.owner, repo)
	if err != nil {
		return fmt.Errorf("failed to get repo info: %w", err)
	}

	defaultBranch := repoInfo.GetDefaultBranch()
	if defaultBranch == "" {
		defaultBranch = "main"
	}

	return c.UpdateRef(repo, "refs/heads/"+defaultBranch, newCommit.GetSHA())
}

// ChunkPath generates a path for a chunk file
func ChunkPath(uploadID string, chunkIndex int) string {
	return fmt.Sprintf("uploads/%s/chunks/chunk-%05d", uploadID, chunkIndex)
}

// ManifestPath generates a path for a manifest file
func ManifestPath(uploadID string) string {
	return fmt.Sprintf("uploads/%s/manifest.json", uploadID)
}

// BlobPath generates a path for the final assembled file
func BlobPath(uploadID, filename string) string {
	// Sanitize filename
	safe := strings.ReplaceAll(filename, "/", "_")
	safe = strings.ReplaceAll(safe, "\\", "_")
	ext := filepath.Ext(safe)
	name := strings.TrimSuffix(safe, ext)
	
	return fmt.Sprintf("blobs/%s-%s%s", uploadID[:8], name, ext)
}

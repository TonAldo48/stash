package github

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"

	gogithub "github.com/google/go-github/v60/github"
	"golang.org/x/oauth2"
)

// Client exposes the subset of GitHub functionality the upload service needs.
type Client interface {
	PutFile(ctx context.Context, repo, path, message string, content []byte) (string, error)
	EnsureRelease(ctx context.Context, repo, tag, releaseName string, body string) (*gogithub.RepositoryRelease, error)
	UploadReleaseAsset(ctx context.Context, repo string, releaseID int64, name, contentType string, file *os.File) (*gogithub.ReleaseAsset, error)
	DeletePath(ctx context.Context, repo, path, message string) error
}

// StorageClient is the default implementation backed by the GitHub REST API.
type StorageClient struct {
	client *gogithub.Client
	owner  string
}

// NewStorageClient creates a GitHub client using a static access token.
func NewStorageClient(token, owner string) *StorageClient {
	ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
	tc := oauth2.NewClient(context.Background(), ts)
	return &StorageClient{
		client: gogithub.NewClient(tc),
		owner:  owner,
	}
}

// PutFile creates or updates a file within the configured repo.
func (c *StorageClient) PutFile(ctx context.Context, repo, path, message string, content []byte) (string, error) {
	opts := &gogithub.RepositoryContentFileOptions{
		Message: gogithub.String(message),
		Content: content,
	}

	// Try create first for better performance; fall back to update if exists.
	file, _, err := c.client.Repositories.CreateFile(ctx, c.owner, repo, path, opts)
	if err == nil {
		return file.GetSHA(), nil
	}

	if !isUnprocessable(err) {
		return "", err
	}

	// Fetch current sha for update.
	existing, _, _, getErr := c.client.Repositories.GetContents(ctx, c.owner, repo, path, nil)
	if getErr != nil {
		return "", getErr
	}

	opts.SHA = existing.SHA
	file, _, err = c.client.Repositories.UpdateFile(ctx, c.owner, repo, path, opts)
	if err != nil {
		return "", err
	}
	return file.GetSHA(), nil
}

// EnsureRelease fetches or creates a GitHub Release for the provided tag.
func (c *StorageClient) EnsureRelease(ctx context.Context, repo, tag, releaseName, body string) (*gogithub.RepositoryRelease, error) {
	release, _, err := c.client.Repositories.GetReleaseByTag(ctx, c.owner, repo, tag)
	if err == nil {
		return release, nil
	}

	if !isNotFound(err) {
		return nil, err
	}

	req := &gogithub.RepositoryRelease{
		TagName: gogithub.String(tag),
		Name:    gogithub.String(releaseName),
		Body:    gogithub.String(body),
	}
	release, _, err = c.client.Repositories.CreateRelease(ctx, c.owner, repo, req)
	return release, err
}

// UploadReleaseAsset uploads a binary file to a GitHub release.
func (c *StorageClient) UploadReleaseAsset(ctx context.Context, repo string, releaseID int64, name, contentType string, file *os.File) (*gogithub.ReleaseAsset, error) {
	opts := &gogithub.UploadOptions{Name: name, MediaType: contentType}
	asset, _, err := c.client.Repositories.UploadReleaseAsset(ctx, c.owner, repo, releaseID, opts, file)
	return asset, err
}

// DeletePath removes a file from the storage repo (best-effort cleanup).
func (c *StorageClient) DeletePath(ctx context.Context, repo, path, message string) error {
	contents, _, _, err := c.client.Repositories.GetContents(ctx, c.owner, repo, path, nil)
	if err != nil {
		if isNotFound(err) {
			return nil
		}
		return err
	}
	opts := &gogithub.RepositoryContentFileOptions{
		Message: gogithub.String(message),
		SHA:     contents.SHA,
	}
	_, _, err = c.client.Repositories.DeleteFile(ctx, c.owner, repo, path, opts)
	return err
}

func isUnprocessable(err error) bool {
	var ghErr *gogithub.ErrorResponse
	if !errors.As(err, &ghErr) {
		return false
	}
	return ghErr.Response != nil && ghErr.Response.StatusCode == http.StatusUnprocessableEntity
}

func isNotFound(err error) bool {
	var ghErr *gogithub.ErrorResponse
	if !errors.As(err, &ghErr) {
		return false
	}
	return ghErr.Response != nil && ghErr.Response.StatusCode == http.StatusNotFound
}

// ContentTypeFromName infers content-type from filename when possible.
func ContentTypeFromName(name string) string {
	switch {
	case strings.HasSuffix(name, ".zip"):
		return "application/zip"
	case strings.HasSuffix(name, ".tar"):
		return "application/x-tar"
	default:
		return "application/octet-stream"
	}
}

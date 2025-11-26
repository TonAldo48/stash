package config

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	defaultPort                 = "8080"
	defaultChunkSizeBytes int64 = 25 * 1024 * 1024 // 25MB
	defaultMaxChunkSizeBytes    = 50 * 1024 * 1024 // 50MB
	defaultMaxUploadBytes       = 10 * 1024 * 1024 * 1024 // 10GB
	defaultReleaseMaxBytes      = 2 * 1024 * 1024 * 1024  // 2GB
	defaultLFSThresholdBytes    = 1024 * 1024 * 1024      // 1GB
	defaultTempDir              = "tmp/uploads"
	defaultStrategy             = "repo_chunks"
)

// Config captures server runtime configuration.
type Config struct {
	Port                  string
	DatabaseURL           string
	APIKey                string
	GitHubToken           string
	GitHubOwner           string
	StorageRepo           string
	DefaultStrategy       string
	DefaultChunkSizeBytes int64
	MaxChunkSizeBytes     int64
	MaxUploadBytes        int64
	ReleaseMaxBytes       int64
	LFSThresholdBytes     int64
	EnableReleaseAssets   bool
	EnableGitLFS          bool
	TempDir               string
	IdleChunkTimeout      time.Duration
}

// Load reads environment variables into a Config structure.
func Load() (*Config, error) {
	cfg := &Config{
		Port:                  getEnv("UPLOAD_SERVER_PORT", defaultPort),
		DatabaseURL:           os.Getenv("DATABASE_URL"),
		APIKey:                os.Getenv("UPLOAD_SERVICE_API_KEY"),
		GitHubToken:           os.Getenv("GITHUB_ACCESS_TOKEN"),
		GitHubOwner:           os.Getenv("GITHUB_STORAGE_OWNER"),
		StorageRepo:           os.Getenv("GITHUB_STORAGE_REPO"),
		DefaultStrategy:       getEnv("UPLOAD_DEFAULT_STRATEGY", defaultStrategy),
		DefaultChunkSizeBytes: parseInt64("UPLOAD_CHUNK_SIZE", defaultChunkSizeBytes),
		MaxChunkSizeBytes:     parseInt64("UPLOAD_MAX_CHUNK_SIZE", defaultMaxChunkSizeBytes),
		MaxUploadBytes:        parseInt64("UPLOAD_MAX_SIZE", defaultMaxUploadBytes),
		ReleaseMaxBytes:       parseInt64("UPLOAD_RELEASE_MAX_BYTES", defaultReleaseMaxBytes),
		LFSThresholdBytes:     parseInt64("UPLOAD_LFS_THRESHOLD", defaultLFSThresholdBytes),
		EnableReleaseAssets:   parseBool("UPLOAD_ENABLE_RELEASE_ASSETS", true),
		EnableGitLFS:          parseBool("UPLOAD_ENABLE_GIT_LFS", false),
		TempDir:               getEnv("UPLOAD_TEMP_DIR", defaultTempDir),
		IdleChunkTimeout:      parseDuration("UPLOAD_IDLE_CHUNK_TIMEOUT", 30*time.Minute),
	}

	if cfg.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	if cfg.APIKey == "" {
		return nil, errors.New("UPLOAD_SERVICE_API_KEY is required")
	}
	if cfg.GitHubToken == "" {
		return nil, errors.New("GITHUB_ACCESS_TOKEN is required")
	}
	if cfg.GitHubOwner == "" {
		return nil, errors.New("GITHUB_STORAGE_OWNER is required")
	}
	if cfg.StorageRepo == "" {
		return nil, errors.New("GITHUB_STORAGE_REPO is required")
	}

	if cfg.DefaultChunkSizeBytes <= 0 {
		cfg.DefaultChunkSizeBytes = defaultChunkSizeBytes
	}
	if cfg.MaxChunkSizeBytes < cfg.DefaultChunkSizeBytes {
		cfg.MaxChunkSizeBytes = cfg.DefaultChunkSizeBytes
	}
	if cfg.TempDir == "" {
		cfg.TempDir = defaultTempDir
	}
	if !filepath.IsAbs(cfg.TempDir) {
		cfg.TempDir = filepath.Join(os.TempDir(), cfg.TempDir)
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if val := strings.TrimSpace(os.Getenv(key)); val != "" {
		return val
	}
	return fallback
}

func parseInt64(key string, fallback int64) int64 {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseBool(key string, fallback bool) bool {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(val)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseDuration(key string, fallback time.Duration) time.Duration {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	dur, err := time.ParseDuration(val)
	if err != nil {
		return fallback
	}
	return dur
}

package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	// Server
	Port           string
	AllowedOrigins []string

	// Supabase
	SupabaseURL    string
	SupabaseKey    string
	SupabaseJWTSecret string

	// GitHub
	GitHubAppID          string
	GitHubAppPrivateKey  string
	GitHubInstallationID string

	// Upload settings
	MaxFileSize     int64 // bytes
	DefaultChunkSize int   // bytes
	MinChunkSize    int   // bytes
	MaxChunkSize    int   // bytes
	TempDir         string

	// Storage repo prefix
	StorageRepoPrefix string
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "8080"),
		AllowedOrigins: getEnvSlice("ALLOWED_ORIGINS", []string{"http://localhost:3000"}),

		SupabaseURL:       getEnv("SUPABASE_URL", ""),
		SupabaseKey:       getEnv("SUPABASE_SERVICE_KEY", ""),
		SupabaseJWTSecret: getEnv("SUPABASE_JWT_SECRET", ""),

		GitHubAppID:          getEnv("GITHUB_APP_ID", ""),
		GitHubAppPrivateKey:  getEnv("GITHUB_APP_PRIVATE_KEY", ""),
		GitHubInstallationID: getEnv("GITHUB_INSTALLATION_ID", ""),

		MaxFileSize:      getEnvInt64("MAX_FILE_SIZE", 10*1024*1024*1024),        // 10GB
		DefaultChunkSize: getEnvInt("DEFAULT_CHUNK_SIZE", 5*1024*1024),            // 5MB
		MinChunkSize:     getEnvInt("MIN_CHUNK_SIZE", 1*1024*1024),                // 1MB
		MaxChunkSize:     getEnvInt("MAX_CHUNK_SIZE", 50*1024*1024),               // 50MB
		TempDir:          getEnv("TEMP_DIR", "/tmp/gitdrive-uploads"),

		StorageRepoPrefix: getEnv("STORAGE_REPO_PREFIX", "gitdrive-storage"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		return strings.Split(value, ",")
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getEnvInt64(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.ParseInt(value, 10, 64); err == nil {
			return i
		}
	}
	return defaultValue
}

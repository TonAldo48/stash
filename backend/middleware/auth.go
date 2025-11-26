package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"gitdrive-backend/config"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const (
	UserIDKey      contextKey = "user_id"
	AccessTokenKey contextKey = "access_token"
)

// Claims represents the JWT claims from Supabase
type Claims struct {
	jwt.RegisteredClaims
	UserMetadata map[string]interface{} `json:"user_metadata,omitempty"`
	AppMetadata  map[string]interface{} `json:"app_metadata,omitempty"`
	Role         string                 `json:"role,omitempty"`
}

// AuthMiddleware validates the JWT token from Supabase
func AuthMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get the Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				sendError(w, http.StatusUnauthorized, "Missing authorization header", "UNAUTHORIZED")
				return
			}

			// Extract the token
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				sendError(w, http.StatusUnauthorized, "Invalid authorization header format", "UNAUTHORIZED")
				return
			}

			tokenString := parts[1]

			// Parse and validate the JWT
			token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
				// Validate the signing method
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				return []byte(cfg.SupabaseJWTSecret), nil
			})

			if err != nil {
				sendError(w, http.StatusUnauthorized, "Invalid token: "+err.Error(), "INVALID_TOKEN")
				return
			}

			claims, ok := token.Claims.(*Claims)
			if !ok || !token.Valid {
				sendError(w, http.StatusUnauthorized, "Invalid token claims", "INVALID_TOKEN")
				return
			}

			// Extract user ID from the subject claim
			userID := claims.Subject
			if userID == "" {
				sendError(w, http.StatusUnauthorized, "Missing user ID in token", "INVALID_TOKEN")
				return
			}

			// Extract GitHub access token from user metadata if available
			var accessToken string
			if claims.UserMetadata != nil {
				if providerToken, ok := claims.UserMetadata["provider_token"].(string); ok {
					accessToken = providerToken
				}
			}

			// Also check the custom header for GitHub token (passed from Next.js)
			if ghToken := r.Header.Get("X-GitHub-Token"); ghToken != "" {
				accessToken = ghToken
			}

			// Add user info to context
			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			ctx = context.WithValue(ctx, AccessTokenKey, accessToken)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID extracts the user ID from the request context
func GetUserID(ctx context.Context) string {
	if userID, ok := ctx.Value(UserIDKey).(string); ok {
		return userID
	}
	return ""
}

// GetAccessToken extracts the GitHub access token from the request context
func GetAccessToken(ctx context.Context) string {
	if token, ok := ctx.Value(AccessTokenKey).(string); ok {
		return token
	}
	return ""
}

func sendError(w http.ResponseWriter, status int, message, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error": message,
		"code":  code,
	})
}

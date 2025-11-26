package main

import (
	"log"
	"net/http"
	"os"

	"gitdrive-backend/config"
	"gitdrive-backend/handlers"
	"gitdrive-backend/middleware"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Create router
	r := chi.NewRouter()

	// Middleware
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)

	// CORS configuration
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Chunk-Index", "X-Chunk-Checksum", "X-Upload-ID"},
		ExposedHeaders:   []string{"Link", "X-Next-Chunk-Index"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Create handlers
	uploadHandler := handlers.NewUploadHandler(cfg)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Upload routes (protected)
	r.Route("/api/uploads", func(r chi.Router) {
		// Auth middleware for all upload routes
		r.Use(middleware.AuthMiddleware(cfg))

		// Initialize a new upload
		r.Post("/init", uploadHandler.InitUpload)

		// Upload a chunk
		r.Post("/{uploadId}/chunks", uploadHandler.UploadChunk)

		// Get upload status
		r.Get("/{uploadId}/status", uploadHandler.GetUploadStatus)

		// Finalize upload
		r.Post("/{uploadId}/finalize", uploadHandler.FinalizeUpload)

		// Abort/cancel upload
		r.Delete("/{uploadId}", uploadHandler.AbortUpload)

		// Resume upload (get next expected chunk)
		r.Get("/{uploadId}/resume", uploadHandler.ResumeUpload)
	})

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting server on port %s", port)
	log.Printf("Allowed origins: %v", cfg.AllowedOrigins)

	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gitdrive-backend/internal/api"
	"gitdrive-backend/internal/config"
	githubclient "gitdrive-backend/internal/github"
	"gitdrive-backend/internal/store"
	"gitdrive-backend/internal/temp"
	"gitdrive-backend/internal/upload"
)

func main() {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	db, err := store.NewPostgresStore(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	tempStore, err := temp.NewStore(cfg.TempDir)
	if err != nil {
		log.Fatalf("failed to initialize temp store: %v", err)
	}

	ghClient := githubclient.NewStorageClient(cfg.GitHubToken, cfg.GitHubOwner)
	svc := upload.NewService(cfg, db, tempStore, ghClient)
	handler := api.NewHandler(cfg, svc)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler.Router(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  2 * time.Minute,
	}

	go func() {
		log.Printf("upload service listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down upload service...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}

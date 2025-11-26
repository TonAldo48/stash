package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/google/uuid"

	"gitdrive-backend/internal/config"
	"gitdrive-backend/internal/store"
	"gitdrive-backend/internal/upload"
)

// Handler wires HTTP routes to the upload service.
type Handler struct {
	cfg *config.Config
	svc *upload.Service
}

// NewHandler creates a Handler instance.
func NewHandler(cfg *config.Config, svc *upload.Service) *Handler {
	return &Handler{cfg: cfg, svc: svc}
}

// Router returns a configured chi router.
func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-API-Key", "X-User-Id", "X-Chunk-Index", "X-Chunk-Checksum"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", h.handleHealth)
	r.Route("/uploads", func(r chi.Router) {
		r.Post("/init", h.withAuth(h.handleInit))
		r.Post("/{uploadID}/chunks", h.withAuth(h.handleChunk))
		r.Post("/{uploadID}/finalize", h.withAuth(h.handleFinalize))
		r.Post("/{uploadID}/abort", h.withAuth(h.handleAbort))
		r.Get("/{uploadID}", h.withAuth(h.handleStatus))
	})

	return r
}

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleInit(w http.ResponseWriter, r *http.Request, user uuid.UUID) {
	var req upload.InitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	ctx := r.Context()
	res, err := h.svc.InitUpload(ctx, user, req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (h *Handler) handleChunk(w http.ResponseWriter, r *http.Request, user uuid.UUID) {
	uploadIDParam := chi.URLParam(r, "uploadID")
	uploadID, err := uuid.Parse(uploadIDParam)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid upload id")
		return
	}

	chunkIdxStr := r.Header.Get("X-Chunk-Index")
	if chunkIdxStr == "" {
		writeError(w, http.StatusBadRequest, "missing X-Chunk-Index header")
		return
	}
	chunkIdx, err := strconv.Atoi(chunkIdxStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid chunk index")
		return
	}

	checksum := r.Header.Get("X-Chunk-Checksum")
	ctx := r.Context()
	result, err := h.svc.HandleChunk(ctx, user, uploadID, chunkIdx, r.Body, checksum)
	if err != nil {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(err, store.ErrChunkOutOfOrder):
			status = http.StatusConflict
		case errors.Is(err, store.ErrUploadNotFound):
			status = http.StatusNotFound
		default:
			status = http.StatusBadRequest
		}
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleFinalize(w http.ResponseWriter, r *http.Request, user uuid.UUID) {
	uploadIDParam := chi.URLParam(r, "uploadID")
	uploadID, err := uuid.Parse(uploadIDParam)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid upload id")
		return
	}
	ctx := r.Context()
	result, err := h.svc.Finalize(ctx, user, uploadID)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, store.ErrUploadNotFound) {
			status = http.StatusNotFound
		}
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleAbort(w http.ResponseWriter, r *http.Request, user uuid.UUID) {
	uploadIDParam := chi.URLParam(r, "uploadID")
	uploadID, err := uuid.Parse(uploadIDParam)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid upload id")
		return
	}
	ctx := r.Context()
	if err := h.svc.Abort(ctx, user, uploadID); err != nil {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(err, store.ErrUploadNotFound):
			status = http.StatusNotFound
		default:
			status = http.StatusBadRequest
		}
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "aborted"})
}

func (h *Handler) handleStatus(w http.ResponseWriter, r *http.Request, user uuid.UUID) {
	uploadIDParam := chi.URLParam(r, "uploadID")
	uploadID, err := uuid.Parse(uploadIDParam)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid upload id")
		return
	}
	ctx := r.Context()
	status, err := h.svc.GetStatus(ctx, user, uploadID)
	if err != nil {
		code := http.StatusInternalServerError
		if errors.Is(err, store.ErrUploadNotFound) {
			code = http.StatusNotFound
		}
		writeError(w, code, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, status)
}

type authedHandler func(http.ResponseWriter, *http.Request, uuid.UUID)

func (h *Handler) withAuth(next authedHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("X-API-Key")
		if apiKey == "" || apiKey != h.cfg.APIKey {
			writeError(w, http.StatusUnauthorized, "invalid api key")
			return
		}
		userIDHeader := r.Header.Get("X-User-Id")
		if userIDHeader == "" {
			writeError(w, http.StatusUnauthorized, "missing user id")
			return
		}
		userID, err := uuid.Parse(userIDHeader)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid user id")
			return
		}
		next(w, r, userID)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": message,
	})
}

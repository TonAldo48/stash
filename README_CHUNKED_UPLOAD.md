# Chunked Large File Upload Implementation

This document describes the chunked large file upload system for GitHub-backed storage.

## Architecture Overview

The system supports uploading large files (up to 10GB) by splitting them into chunks and storing them in GitHub repositories using different strategies based on file size.

### Components

1. **Frontend (Next.js/React)**
   - Chunked uploader utility (`src/lib/chunked-upload.ts`)
   - Updated file upload component (`src/components/ui/file-upload.tsx`)
   - Server actions for integration (`src/app/actions/chunked-upload.ts`)

2. **Backend (Go Service)**
   - HTTP API server (`backend/main.go`)
   - Upload handlers (`backend/handlers.go`)
   - Database models (`backend/models.go`)
   - GitHub integration (`backend/github.go`)

3. **Database (Supabase/PostgreSQL)**
   - `uploads` table: Tracks upload sessions
   - `upload_chunks` table: Tracks individual chunks

## Setup Instructions

### 1. Database Migration

Run the migration to create the required tables:

```sql
-- Run migrations/001_uploads_schema.sql in your Supabase SQL editor
```

### 2. Go Backend Setup

1. Install Go dependencies:
```bash
cd backend
go mod tidy
```

2. Set environment variables:
```bash
export DATABASE_URL="postgresql://user:password@host:port/database"
export PORT="8080"
export ALLOWED_ORIGIN="http://localhost:3000"  # Your Next.js app URL
```

3. Run the backend:
```bash
go run .
```

### 3. Next.js Frontend Setup

1. Set environment variable:
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

2. The frontend will automatically use chunked uploads for files > 10MB.

## Upload Strategies

The system automatically selects a strategy based on file size:

- **Small files (< 10MB)**: Direct upload via existing `uploadFile` action
- **Medium files (10MB - 100MB)**: Chunked upload with 5MB chunks, stored as regular files
- **Large files (100MB - 2GB)**: Chunked upload with 50MB chunks, stored via Git LFS
- **Very large files (> 2GB)**: Chunked upload with 50MB chunks, stored as chunked blobs with manifest

## API Endpoints

### POST `/api/uploads/init`
Initialize a new upload session.

**Request:**
```json
{
  "filename": "large-file.zip",
  "mime_type": "application/zip",
  "size_bytes": 104857600,
  "target_path": "/",
  "user_id": "user-uuid",
  "github_token": "ghp_..."
}
```

**Response:**
```json
{
  "upload_id": "uuid",
  "chunk_size": 5242880,
  "total_chunks": 20,
  "strategy": "repo-chunked"
}
```

### POST `/api/uploads/:uploadId/chunks`
Upload a chunk.

**Request:** Multipart form data
- `chunk`: File blob
- `chunk_index`: Integer
- `checksum`: SHA-256 hash
- `user_id`: User UUID

**Response:**
```json
{
  "success": true,
  "next_chunk_index": 1,
  "server_checksum": "abc123..."
}
```

### POST `/api/uploads/:uploadId/finalize`
Finalize the upload and store in GitHub.

**Request:**
```json
{
  "user_id": "user-uuid",
  "github_token": "ghp_..."
}
```

**Response:**
```json
{
  "success": true,
  "file_id": "file-uuid",
  "github_path": "uploads/user-id/upload-id/filename.zip"
}
```

### DELETE `/api/uploads/:uploadId`
Abort an upload and clean up chunks.

### GET `/api/uploads/:uploadId/status?user_id=...`
Get upload status and progress.

## Security

- All endpoints verify user ownership of uploads
- GitHub tokens are passed per-request (not stored)
- RLS policies ensure users can only access their own uploads
- File size limits enforced (10GB max)

## Quota Management

Quota validation should be added in `handleInitUpload` to check:
- Per-user storage limits
- Global storage limits
- GitHub LFS bandwidth quotas

## Monitoring

The system logs:
- Upload initialization
- Chunk upload success/failure
- Finalization status
- GitHub API errors

## Future Enhancements

1. **Parallel chunk uploads**: Upload multiple chunks simultaneously
2. **Resume capability**: Resume interrupted uploads
3. **Background finalization**: Move final assembly to background jobs
4. **Git LFS integration**: Proper Git LFS API usage for large files
5. **GitHub Releases**: Use Releases API for very large files (>2GB per asset)

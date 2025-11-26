-- Chunked Uploads Schema
-- This migration adds tables to support chunked large file uploads

-- Enum for upload strategies
CREATE TYPE upload_strategy AS ENUM ('direct', 'chunked', 'lfs', 'release');

-- Enum for upload status
CREATE TYPE upload_status AS ENUM ('pending', 'in_progress', 'finalizing', 'completed', 'failed', 'cancelled');

-- Enum for chunk status  
CREATE TYPE chunk_status AS ENUM ('pending', 'uploading', 'uploaded', 'failed');

-- Main uploads table - tracks each upload session
CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- File metadata
    filename TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT,
    target_path TEXT NOT NULL DEFAULT '/',
    
    -- Upload configuration
    strategy upload_strategy NOT NULL DEFAULT 'chunked',
    chunk_size INTEGER NOT NULL DEFAULT 5242880, -- 5MB default
    total_chunks INTEGER NOT NULL,
    
    -- Storage destination (determined after init)
    target_repo TEXT,
    blob_path TEXT,
    manifest_path TEXT,
    
    -- Status tracking
    status upload_status NOT NULL DEFAULT 'pending',
    chunks_uploaded INTEGER NOT NULL DEFAULT 0,
    bytes_uploaded BIGINT NOT NULL DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    completed_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT valid_file_size CHECK (file_size > 0 AND file_size <= 10737418240), -- Max 10GB
    CONSTRAINT valid_chunk_size CHECK (chunk_size >= 1048576 AND chunk_size <= 52428800), -- 1MB to 50MB
    CONSTRAINT valid_total_chunks CHECK (total_chunks > 0)
);

-- Chunks table - tracks individual chunks within an upload
CREATE TABLE IF NOT EXISTS upload_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    
    -- Chunk identification
    chunk_index INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    
    -- Integrity verification
    checksum TEXT, -- SHA-256 hash
    server_checksum TEXT, -- Verified by server
    
    -- Storage location (for intermediate storage if needed)
    temp_path TEXT,
    blob_sha TEXT, -- GitHub blob SHA after upload
    
    -- Status
    status chunk_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT unique_chunk_per_upload UNIQUE (upload_id, chunk_index),
    CONSTRAINT valid_chunk_index CHECK (chunk_index >= 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_expires_at ON uploads(expires_at) WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_upload_chunks_upload_id ON upload_chunks(upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_chunks_status ON upload_chunks(upload_id, status);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_uploads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_uploads_updated_at
    BEFORE UPDATE ON uploads
    FOR EACH ROW
    EXECUTE FUNCTION update_uploads_updated_at();

-- Row Level Security
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_chunks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own uploads
CREATE POLICY uploads_user_policy ON uploads
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only see chunks for their own uploads
CREATE POLICY upload_chunks_user_policy ON upload_chunks
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM uploads 
            WHERE uploads.id = upload_chunks.upload_id 
            AND uploads.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM uploads 
            WHERE uploads.id = upload_chunks.upload_id 
            AND uploads.user_id = auth.uid()
        )
    );

-- Function to clean up expired uploads (can be called by a cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_uploads()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM uploads
        WHERE expires_at < NOW()
        AND status NOT IN ('completed', 'finalizing')
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (or service role only)
-- REVOKE ALL ON FUNCTION cleanup_expired_uploads FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION cleanup_expired_uploads TO service_role;

COMMENT ON TABLE uploads IS 'Tracks chunked file upload sessions';
COMMENT ON TABLE upload_chunks IS 'Tracks individual chunks within an upload session';
COMMENT ON COLUMN uploads.strategy IS 'Upload strategy: direct (small files), chunked (medium), lfs (large), release (very large)';
COMMENT ON COLUMN uploads.expires_at IS 'Auto-cleanup incomplete uploads after this time';

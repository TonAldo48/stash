-- Uploads table to track chunked file uploads
CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT NOT NULL,
    target_path TEXT NOT NULL DEFAULT '/',
    repo_name TEXT,
    strategy TEXT NOT NULL DEFAULT 'repo-chunked', -- 'lfs', 'repo-chunked', 'release'
    chunk_size INTEGER NOT NULL DEFAULT 5242880, -- 5MB default
    total_chunks INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'aborted'
    github_path TEXT, -- Final path in GitHub repo
    github_asset_id TEXT, -- For release assets
    manifest_path TEXT, -- Path to manifest.json for chunked uploads
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Chunks table to track individual chunk uploads
CREATE TABLE IF NOT EXISTS upload_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    checksum TEXT NOT NULL, -- SHA-256 checksum
    temp_storage_path TEXT, -- Temporary storage location on server
    github_path TEXT, -- Path in GitHub repo (for repo-chunked strategy)
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'uploaded', 'verified', 'failed'
    uploaded_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    UNIQUE(upload_id, chunk_index)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at);
CREATE INDEX IF NOT EXISTS idx_upload_chunks_upload_id ON upload_chunks(upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_chunks_status ON upload_chunks(status);

-- RLS policies
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_chunks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own uploads
CREATE POLICY "Users can view own uploads" ON uploads
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own uploads" ON uploads
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own uploads" ON uploads
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own uploads" ON uploads
    FOR DELETE USING (auth.uid() = user_id);

-- Users can only see chunks for their uploads
CREATE POLICY "Users can view own upload chunks" ON upload_chunks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM uploads 
            WHERE uploads.id = upload_chunks.upload_id 
            AND uploads.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own upload chunks" ON upload_chunks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM uploads 
            WHERE uploads.id = upload_chunks.upload_id 
            AND uploads.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own upload chunks" ON upload_chunks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM uploads 
            WHERE uploads.id = upload_chunks.upload_id 
            AND uploads.user_id = auth.uid()
        )
    );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_uploads_updated_at BEFORE UPDATE ON uploads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

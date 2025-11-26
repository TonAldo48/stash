-- Upload sessions table
CREATE TABLE IF NOT EXISTS uploads (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    filename text NOT NULL,
    mime_type text,
    target_path text NOT NULL,
    strategy text NOT NULL,
    status text NOT NULL,
    chunk_size_bytes bigint NOT NULL,
    total_chunks integer NOT NULL,
    total_size_bytes bigint NOT NULL,
    received_chunks integer NOT NULL DEFAULT 0,
    received_bytes bigint NOT NULL DEFAULT 0,
    repo_name text NOT NULL,
    manifest_path text,
    storage_path text,
    file_id uuid REFERENCES files(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS uploads_user_idx ON uploads(user_id);
CREATE INDEX IF NOT EXISTS uploads_status_idx ON uploads(status);

-- Chunk metadata table
CREATE TABLE IF NOT EXISTS upload_chunks (
    upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL,
    size_bytes bigint NOT NULL,
    checksum text NOT NULL,
    temp_path text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (upload_id, chunk_index)
);

-- Extend files table to track storage strategy metadata
ALTER TABLE files
    ADD COLUMN IF NOT EXISTS storage_strategy text DEFAULT 'repo_single';

ALTER TABLE files
    ADD COLUMN IF NOT EXISTS storage_metadata jsonb DEFAULT '{}'::jsonb;

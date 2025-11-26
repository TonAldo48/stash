"use server";

import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export interface InitUploadRequest {
  filename: string;
  fileSize: number;
  mimeType?: string;
  targetPath?: string;
  chunkSize?: number;
}

export interface InitUploadResponse {
  upload_id: string;
  chunk_size: number;
  total_chunks: number;
  strategy: string;
  expires_at: string;
}

export interface UploadStatusResponse {
  upload_id: string;
  status: string;
  chunks_uploaded: number;
  total_chunks: number;
  bytes_uploaded: number;
  total_bytes: number;
  percent_complete: number;
  error_message?: string;
}

export interface ResumeUploadResponse {
  upload_id: string;
  next_expected_chunk: number;
  chunks_uploaded: number;
  total_chunks: number;
  chunk_size: number;
  missing_chunks?: number[];
}

export interface FinalizeUploadResponse {
  success: boolean;
  file_id?: string;
  blob_path?: string;
  message?: string;
}

// Helper to get auth headers
async function getAuthHeaders(): Promise<{ Authorization: string; "X-GitHub-Token"?: string } | null> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return null;
  }

  const headers: { Authorization: string; "X-GitHub-Token"?: string } = {
    Authorization: `Bearer ${session.access_token}`,
  };

  if (session.provider_token) {
    headers["X-GitHub-Token"] = session.provider_token;
  }

  return headers;
}

/**
 * Initialize a new chunked upload
 */
export async function initChunkedUpload(request: InitUploadRequest): Promise<{ data?: InitUploadResponse; error?: string }> {
  try {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders) {
      return { error: "Unauthorized" };
    }

    const response = await fetch(`${BACKEND_URL}/api/uploads/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        filename: request.filename,
        file_size: request.fileSize,
        mime_type: request.mimeType,
        target_path: request.targetPath || "/",
        chunk_size: request.chunkSize,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to initialize upload" };
    }

    return { data };
  } catch (error) {
    console.error("Init upload error:", error);
    return { error: error instanceof Error ? error.message : "Failed to initialize upload" };
  }
}

/**
 * Get current upload status
 */
export async function getUploadStatus(uploadId: string): Promise<{ data?: UploadStatusResponse; error?: string }> {
  try {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders) {
      return { error: "Unauthorized" };
    }

    const response = await fetch(`${BACKEND_URL}/api/uploads/${uploadId}/status`, {
      method: "GET",
      headers: authHeaders,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to get upload status" };
    }

    return { data };
  } catch (error) {
    console.error("Get status error:", error);
    return { error: error instanceof Error ? error.message : "Failed to get upload status" };
  }
}

/**
 * Get resume info for a paused/interrupted upload
 */
export async function resumeUpload(uploadId: string): Promise<{ data?: ResumeUploadResponse; error?: string }> {
  try {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders) {
      return { error: "Unauthorized" };
    }

    const response = await fetch(`${BACKEND_URL}/api/uploads/${uploadId}/resume`, {
      method: "GET",
      headers: authHeaders,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to resume upload" };
    }

    return { data };
  } catch (error) {
    console.error("Resume upload error:", error);
    return { error: error instanceof Error ? error.message : "Failed to resume upload" };
  }
}

/**
 * Finalize an upload after all chunks are uploaded
 */
export async function finalizeUpload(uploadId: string): Promise<{ data?: FinalizeUploadResponse; error?: string }> {
  try {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders) {
      return { error: "Unauthorized" };
    }

    const response = await fetch(`${BACKEND_URL}/api/uploads/${uploadId}/finalize`, {
      method: "POST",
      headers: authHeaders,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to finalize upload" };
    }

    return { data };
  } catch (error) {
    console.error("Finalize upload error:", error);
    return { error: error instanceof Error ? error.message : "Failed to finalize upload" };
  }
}

/**
 * Abort/cancel an upload
 */
export async function abortUpload(uploadId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders) {
      return { error: "Unauthorized" };
    }

    const response = await fetch(`${BACKEND_URL}/api/uploads/${uploadId}`, {
      method: "DELETE",
      headers: authHeaders,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to abort upload" };
    }

    return { success: true };
  } catch (error) {
    console.error("Abort upload error:", error);
    return { error: error instanceof Error ? error.message : "Failed to abort upload" };
  }
}

/**
 * Get the chunk upload URL and headers for direct chunk upload from the browser
 * This returns the endpoint info so the client can upload directly
 */
export async function getChunkUploadInfo(uploadId: string): Promise<{ 
  url: string; 
  headers: Record<string, string>;
  error?: string;
}> {
  const authHeaders = await getAuthHeaders();
  if (!authHeaders) {
    return { url: "", headers: {}, error: "Unauthorized" };
  }

  return {
    url: `${BACKEND_URL}/api/uploads/${uploadId}/chunks`,
    headers: authHeaders,
  };
}

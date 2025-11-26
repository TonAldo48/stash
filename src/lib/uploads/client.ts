"use client";

export interface InitUploadPayload {
  filename: string;
  size: number;
  mimeType: string;
  folder: string;
}

export interface InitUploadResponse {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  strategy: string;
  repoName: string;
}

export interface ChunkResponse {
  receivedChunk: number;
  nextChunkIndex: number;
  isComplete: boolean;
  error?: string;
}

export interface FinalizeResponse {
  fileId: string;
  path: string;
  name: string;
  size: number;
}

export interface StatusResponse {
  uploadId: string;
  status: string;
  nextChunk: number;
  receivedChunks: number;
  totalChunks: number;
  receivedBytes: number;
  chunkSize: number;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    const error = typeof data?.error === "string" ? data.error : "Upload failed";
    throw new Error(error);
  }
  return data as T;
}

export async function initUpload(
  payload: InitUploadPayload
): Promise<InitUploadResponse> {
  const response = await fetch("/api/uploads/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<InitUploadResponse>(response);
}

export async function uploadChunk(params: {
  uploadId: string;
  chunk: Blob;
  chunkIndex: number;
  checksum: string;
}): Promise<ChunkResponse> {
  const response = await fetch(
    `/api/uploads/${params.uploadId}/chunks`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-chunk-index": params.chunkIndex.toString(),
        "x-chunk-checksum": params.checksum,
      },
      body: params.chunk,
    }
  );
  return handleResponse<ChunkResponse>(response);
}

export async function finalizeUpload(
  uploadId: string
): Promise<FinalizeResponse> {
  const response = await fetch(`/api/uploads/${uploadId}/finalize`, {
    method: "POST",
  });
  return handleResponse<FinalizeResponse>(response);
}

export async function abortUpload(uploadId: string): Promise<void> {
  const response = await fetch(`/api/uploads/${uploadId}/abort`, {
    method: "POST",
  });
  await handleResponse(response);
}

export async function getUploadStatus(
  uploadId: string
): Promise<StatusResponse> {
  const response = await fetch(`/api/uploads/${uploadId}`);
  return handleResponse<StatusResponse>(response);
}

export async function hashChunk(chunk: Blob): Promise<string> {
  const buffer = await chunk.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

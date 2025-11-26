"use client";

import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export interface UploadProgress {
  uploadId: string;
  filename: string;
  totalChunks: number;
  uploadedChunks: number;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'finalizing' | 'completed' | 'error';
  error?: string;
  eta?: number; // seconds
}

export interface ChunkedUploadOptions {
  file: File;
  targetPath?: string;
  chunkSize?: number;
  onProgress?: (progress: UploadProgress) => void;
  onError?: (error: string) => void;
  onComplete?: (result: { fileId: string; githubPath: string }) => void;
}

export class ChunkedUploader {
  private file: File;
  private targetPath: string;
  private chunkSize: number;
  private uploadId?: string;
  private onProgress?: (progress: UploadProgress) => void;
  private onError?: (error: string) => void;
  private onComplete?: (result: { fileId: string; githubPath: string }) => void;
  private abortController?: AbortController;
  private startTime?: number;
  private uploadedBytes: number = 0;

  constructor(options: ChunkedUploadOptions) {
    this.file = options.file;
    this.targetPath = options.targetPath || "/";
    this.chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    this.onProgress = options.onProgress;
    this.onError = options.onError;
    this.onComplete = options.onComplete;
  }

  async start(): Promise<void> {
    try {
      this.abortController = new AbortController();
      this.startTime = Date.now();

      // Get user session and GitHub token
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (userError || sessionError || !user || !session) {
        throw new Error("Unauthorized: Please log in");
      }

      // Get GitHub token from session metadata
      const githubToken = (session.provider_token as string) || (session as any).provider_refresh_token;
      if (!githubToken) {
        throw new Error("GitHub token not found. Please reconnect your GitHub account.");
      }

      // Initialize upload
      const initResponse = await fetch(`${BACKEND_URL}/api/uploads/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: this.file.name,
          mime_type: this.file.type,
          size_bytes: this.file.size,
          target_path: this.targetPath,
          user_id: user.id,
          github_token: githubToken,
        }),
        signal: this.abortController.signal,
      });

      if (!initResponse.ok) {
        const error = await initResponse.text();
        throw new Error(`Failed to initialize upload: ${error}`);
      }

      const initData = await initResponse.json();
      this.uploadId = initData.upload_id;
      const totalChunks = initData.total_chunks;

      this.updateProgress({
        uploadId: this.uploadId,
        filename: this.file.name,
        totalChunks,
        uploadedChunks: 0,
        progress: 0,
        status: 'uploading',
      });

      // Upload chunks sequentially
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (this.abortController?.signal.aborted) {
          throw new Error("Upload aborted");
        }

        const offset = chunkIndex * this.chunkSize;
        const chunk = this.file.slice(offset, offset + this.chunkSize);
        const checksum = await this.computeChecksum(chunk);

        await this.uploadChunk(chunkIndex, chunk, checksum);

        this.uploadedBytes += chunk.size;
        const progress = (this.uploadedBytes / this.file.size) * 100;
        const elapsed = (Date.now() - (this.startTime || 0)) / 1000;
        const rate = this.uploadedBytes / elapsed;
        const remaining = (this.file.size - this.uploadedBytes) / rate;

        this.updateProgress({
          uploadId: this.uploadId,
          filename: this.file.name,
          totalChunks,
          uploadedChunks: chunkIndex + 1,
          progress,
          status: 'uploading',
          eta: remaining,
        });
      }

      // Finalize upload
      this.updateProgress({
        uploadId: this.uploadId,
        filename: this.file.name,
        totalChunks,
        uploadedChunks: totalChunks,
        progress: 100,
        status: 'finalizing',
      });

      const finalizeResponse = await fetch(`${BACKEND_URL}/api/uploads/${this.uploadId}/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.id,
          github_token: githubToken,
        }),
        signal: this.abortController.signal,
      });

      if (!finalizeResponse.ok) {
        const error = await finalizeResponse.text();
        throw new Error(`Failed to finalize upload: ${error}`);
      }

      const finalizeData = await finalizeResponse.json();

      // Create file record in database via Next.js server action
      const fileRecord = await this.createFileRecord(finalizeData.github_path);

      this.updateProgress({
        uploadId: this.uploadId,
        filename: this.file.name,
        totalChunks,
        uploadedChunks: totalChunks,
        progress: 100,
        status: 'completed',
      });

      this.onComplete?.({
        fileId: fileRecord.id,
        githubPath: finalizeData.github_path,
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return; // Upload was aborted, don't call onError
      }

      const errorMsg = error.message || "Upload failed";
      this.updateProgress({
        uploadId: this.uploadId || "",
        filename: this.file.name,
        totalChunks: 0,
        uploadedChunks: 0,
        progress: 0,
        status: 'error',
        error: errorMsg,
      });
      this.onError?.(errorMsg);
    }
  }

  private async uploadChunk(chunkIndex: number, chunk: Blob, checksum: string): Promise<void> {
    if (!this.uploadId) {
      throw new Error("Upload not initialized");
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    const formData = new FormData();
    formData.append("chunk", chunk);
    formData.append("chunk_index", chunkIndex.toString());
    formData.append("checksum", checksum);
    formData.append("user_id", user.id);

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/uploads/${this.uploadId}/chunks`, {
          method: "POST",
          body: formData,
          signal: this.abortController?.signal,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Chunk upload failed: ${error}`);
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Chunk upload failed");
        }

        return; // Success
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error("Chunk upload failed after retries");
  }

  private async computeChecksum(chunk: Blob): Promise<string> {
    const buffer = await chunk.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  private async createFileRecord(githubPath: string) {
    // Call Next.js server action to create file record
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    // Use server action for file creation
    const response = await fetch('/api/upload/finalize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        upload_id: this.uploadId,
        github_path: githubPath,
        file_size: this.file.size,
        filename: this.file.name,
        target_path: this.targetPath,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create file record: ${error}`);
    }

    const data = await response.json();
    return { id: data.file_id || data.file?.id };
  }

  private updateProgress(progress: UploadProgress): void {
    this.onProgress?.(progress);
  }

  async abort(): Promise<void> {
    this.abortController?.abort();
    if (this.uploadId) {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Call abort endpoint
          await fetch(`${BACKEND_URL}/api/uploads/${this.uploadId}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              user_id: user.id,
            }),
          });
        }
      } catch (error) {
        // Ignore errors on abort
      }
    }
  }
}

export async function uploadFileChunked(options: ChunkedUploadOptions): Promise<ChunkedUploader> {
  const uploader = new ChunkedUploader(options);
  await uploader.start();
  return uploader;
}

/**
 * Chunked File Uploader
 * 
 * Handles splitting files into chunks and uploading them with progress tracking,
 * pause/resume, and retry capabilities.
 */

export interface ChunkUploadProgress {
  uploadId: string;
  filename: string;
  fileSize: number;
  bytesUploaded: number;
  chunksUploaded: number;
  totalChunks: number;
  percentComplete: number;
  currentChunk: number;
  status: UploadStatus;
  error?: string;
  eta?: number; // Estimated time remaining in seconds
  speed?: number; // Upload speed in bytes per second
}

export type UploadStatus = 
  | 'pending' 
  | 'initializing' 
  | 'uploading' 
  | 'paused' 
  | 'finalizing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export interface ChunkedUploaderOptions {
  chunkSize?: number; // Default: 5MB
  maxRetries?: number; // Default: 3
  retryDelay?: number; // Default: 1000ms
  parallelChunks?: number; // Default: 1 (sequential)
  onProgress?: (progress: ChunkUploadProgress) => void;
  onComplete?: (uploadId: string, fileId: string) => void;
  onError?: (uploadId: string, error: string) => void;
}

export interface InitUploadRequest {
  filename: string;
  fileSize: number;
  mimeType?: string;
  targetPath?: string;
  chunkSize?: number;
}

export interface InitUploadResponseData {
  upload_id: string;
  chunk_size: number;
  total_chunks: number;
  strategy: string;
  expires_at: string;
}

export interface FinalizeResponseData {
  success: boolean;
  file_id?: string;
  blob_path?: string;
  message?: string;
}

export interface ResumeInfoData {
  upload_id: string;
  next_expected_chunk: number;
  chunks_uploaded: number;
  total_chunks: number;
  chunk_size: number;
  missing_chunks?: number[];
}

interface UploadSession {
  uploadId: string;
  file: File;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: Set<number>;
  bytesUploaded: number;
  status: UploadStatus;
  abortController: AbortController;
  startTime: number;
  lastProgressTime: number;
  lastBytesUploaded: number;
}

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;

/**
 * Calculate SHA-256 checksum of a blob
 */
async function calculateChecksum(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ChunkedUploader class handles the entire upload flow
 */
export class ChunkedUploader {
  private sessions: Map<string, UploadSession> = new Map();
  private options: Required<ChunkedUploaderOptions>;

  constructor(options: ChunkedUploaderOptions = {}) {
    this.options = {
      chunkSize: options.chunkSize || DEFAULT_CHUNK_SIZE,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelay: options.retryDelay ?? DEFAULT_RETRY_DELAY,
      parallelChunks: options.parallelChunks ?? 1,
      onProgress: options.onProgress || (() => {}),
      onComplete: options.onComplete || (() => {}),
      onError: options.onError || (() => {}),
    };
  }

  /**
   * Start uploading a file
   */
  async upload(
    file: File, 
    targetPath: string,
    initUpload: (req: InitUploadRequest) => Promise<{ data?: InitUploadResponseData; error?: string }>,
    getChunkUploadInfo: (uploadId: string) => Promise<{ url: string; headers: Record<string, string>; error?: string }>,
    finalizeUpload: (uploadId: string) => Promise<{ data?: FinalizeResponseData; error?: string }>
  ): Promise<string> {
    // Initialize upload with backend
    this.emitProgress({
      uploadId: '',
      filename: file.name,
      fileSize: file.size,
      bytesUploaded: 0,
      chunksUploaded: 0,
      totalChunks: 0,
      percentComplete: 0,
      currentChunk: 0,
      status: 'initializing',
    });

    const initResult = await initUpload({
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      targetPath: targetPath,
      chunkSize: this.options.chunkSize,
    });

    if (initResult.error || !initResult.data) {
      throw new Error(initResult.error || 'Failed to initialize upload');
    }

    const { upload_id: uploadId, chunk_size: chunkSize, total_chunks: totalChunks } = initResult.data;

    // Create session
    const session: UploadSession = {
      uploadId,
      file,
      chunkSize,
      totalChunks,
      uploadedChunks: new Set(),
      bytesUploaded: 0,
      status: 'uploading',
      abortController: new AbortController(),
      startTime: Date.now(),
      lastProgressTime: Date.now(),
      lastBytesUploaded: 0,
    };

    this.sessions.set(uploadId, session);

    try {
      // Get upload endpoint info
      const uploadInfo = await getChunkUploadInfo(uploadId);
      if (uploadInfo.error) {
        throw new Error(uploadInfo.error);
      }

      // Upload all chunks
      await this.uploadChunks(session, uploadInfo.url, uploadInfo.headers);

      // Finalize
      session.status = 'finalizing';
      this.emitSessionProgress(session, session.uploadedChunks.size - 1);

      const finalResult = await finalizeUpload(uploadId);
      if (finalResult.error || !finalResult.data?.success) {
        throw new Error(finalResult.error || 'Failed to finalize upload');
      }

      session.status = 'completed';
      this.emitSessionProgress(session, totalChunks - 1);
      this.options.onComplete(uploadId, finalResult.data.file_id || '');

      return uploadId;
    } catch (error) {
      const currentStatus = session.status;
      if (currentStatus !== 'cancelled') {
        session.status = 'failed';
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        this.emitSessionProgress(session, session.uploadedChunks.size - 1, errorMessage);
        this.options.onError(uploadId, errorMessage);
      }
      throw error;
    }
  }

  /**
   * Upload all chunks for a session
   */
  private async uploadChunks(
    session: UploadSession, 
    uploadUrl: string, 
    headers: Record<string, string>
  ): Promise<void> {
    const { file, chunkSize, totalChunks, uploadedChunks, abortController } = session;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      // Check if paused or cancelled
      if (session.status === 'paused' || session.status === 'cancelled') {
        throw new Error(session.status === 'cancelled' ? 'Upload cancelled' : 'Upload paused');
      }

      // Skip already uploaded chunks
      if (uploadedChunks.has(chunkIndex)) {
        continue;
      }

      // Calculate chunk boundaries
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      // Calculate checksum
      const checksum = await calculateChecksum(chunk);

      // Upload with retry
      await this.uploadChunkWithRetry(
        session,
        chunkIndex,
        chunk,
        checksum,
        uploadUrl,
        headers,
        abortController.signal
      );

      // Update progress
      uploadedChunks.add(chunkIndex);
      session.bytesUploaded += chunk.size;
      this.emitSessionProgress(session, chunkIndex);
    }
  }

  /**
   * Upload a single chunk with retry logic
   */
  private async uploadChunkWithRetry(
    session: UploadSession,
    chunkIndex: number,
    chunk: Blob,
    checksum: string,
    uploadUrl: string,
    headers: Record<string, string>,
    signal: AbortSignal
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        await this.uploadChunk(
          session,
          chunkIndex,
          chunk,
          checksum,
          uploadUrl,
          headers,
          signal
        );
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Upload failed');
        
        // Don't retry on abort
        if (signal.aborted) {
          throw error;
        }

        // Don't retry on client errors (4xx)
        const errorMessage = error instanceof Error ? error.message : '';
        if (errorMessage.includes('4')) {
          throw error;
        }

        // Wait before retry
        if (attempt < this.options.maxRetries) {
          await this.delay(this.options.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Upload failed after retries');
  }

  /**
   * Upload a single chunk
   */
  private async uploadChunk(
    session: UploadSession,
    chunkIndex: number,
    chunk: Blob,
    checksum: string,
    uploadUrl: string,
    headers: Record<string, string>,
    signal: AbortSignal
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'X-Chunk-Index': String(chunkIndex),
        'X-Chunk-Checksum': checksum,
      },
      body: chunk,
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();
    
    // Verify server checksum matches
    if (result.server_checksum && result.server_checksum !== checksum) {
      throw new Error('Checksum mismatch');
    }
  }

  /**
   * Pause an upload
   */
  pause(uploadId: string): boolean {
    const session = this.sessions.get(uploadId);
    if (!session || session.status !== 'uploading') {
      return false;
    }

    session.status = 'paused';
    session.abortController.abort();
    this.emitSessionProgress(session, session.uploadedChunks.size - 1);
    return true;
  }

  /**
   * Resume a paused upload
   */
  async resume(
    uploadId: string,
    getChunkUploadInfo: (uploadId: string) => Promise<{ url: string; headers: Record<string, string>; error?: string }>,
    finalizeUpload: (uploadId: string) => Promise<{ data?: FinalizeResponseData; error?: string }>,
    getResumeInfo?: (uploadId: string) => Promise<{ data?: ResumeInfoData; error?: string }>
  ): Promise<void> {
    const session = this.sessions.get(uploadId);
    if (!session || session.status !== 'paused') {
      throw new Error('Upload not found or not paused');
    }

    // Optionally sync with server to get confirmed chunks
    if (getResumeInfo) {
      const resumeResult = await getResumeInfo(uploadId);
      if (resumeResult.data?.missing_chunks) {
        // Update our local state to match server
        session.uploadedChunks.clear();
        for (let i = 0; i < session.totalChunks; i++) {
          if (!resumeResult.data.missing_chunks.includes(i)) {
            session.uploadedChunks.add(i);
          }
        }
      }
    }

    // Create new abort controller
    session.abortController = new AbortController();
    session.status = 'uploading';
    session.startTime = Date.now();
    session.lastProgressTime = Date.now();
    session.lastBytesUploaded = session.bytesUploaded;

    try {
      const uploadInfo = await getChunkUploadInfo(uploadId);
      if (uploadInfo.error) {
        throw new Error(uploadInfo.error);
      }

      await this.uploadChunks(session, uploadInfo.url, uploadInfo.headers);

      // Finalize
      session.status = 'finalizing';
      this.emitSessionProgress(session, session.uploadedChunks.size - 1);

      const finalResult = await finalizeUpload(uploadId);
      if (finalResult.error || !finalResult.data?.success) {
        throw new Error(finalResult.error || 'Failed to finalize upload');
      }

      session.status = 'completed';
      this.emitSessionProgress(session, session.totalChunks - 1);
      this.options.onComplete(uploadId, finalResult.data.file_id || '');
    } catch (error) {
      // Status could have been changed by pause/cancel during async operations
      const currentStatus = session.status as UploadStatus;
      if (currentStatus !== 'cancelled' && currentStatus !== 'paused') {
        session.status = 'failed';
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        this.emitSessionProgress(session, session.uploadedChunks.size - 1, errorMessage);
        this.options.onError(uploadId, errorMessage);
      }
      throw error;
    }
  }

  /**
   * Cancel an upload
   */
  cancel(uploadId: string): boolean {
    const session = this.sessions.get(uploadId);
    if (!session) {
      return false;
    }

    session.status = 'cancelled';
    session.abortController.abort();
    this.emitSessionProgress(session, session.uploadedChunks.size - 1);
    this.sessions.delete(uploadId);
    return true;
  }

  /**
   * Get progress for an upload
   */
  getProgress(uploadId: string): ChunkUploadProgress | null {
    const session = this.sessions.get(uploadId);
    if (!session) return null;

    return this.buildProgress(session, session.uploadedChunks.size - 1);
  }

  /**
   * Emit progress update
   */
  private emitProgress(progress: ChunkUploadProgress): void {
    this.options.onProgress(progress);
  }

  /**
   * Emit progress for a session
   */
  private emitSessionProgress(session: UploadSession, currentChunk: number, error?: string): void {
    const progress = this.buildProgress(session, currentChunk, error);
    this.emitProgress(progress);
  }

  /**
   * Build progress object
   */
  private buildProgress(session: UploadSession, currentChunk: number, error?: string): ChunkUploadProgress {
    const now = Date.now();
    const elapsed = (now - session.lastProgressTime) / 1000;
    const bytesUploaded = session.bytesUploaded;
    const bytesInInterval = bytesUploaded - session.lastBytesUploaded;
    
    let speed = 0;
    let eta: number | undefined;
    
    if (elapsed > 0.5) { // Update speed every 500ms
      speed = bytesInInterval / elapsed;
      session.lastProgressTime = now;
      session.lastBytesUploaded = bytesUploaded;
      
      if (speed > 0) {
        const remainingBytes = session.file.size - bytesUploaded;
        eta = remainingBytes / speed;
      }
    }

    return {
      uploadId: session.uploadId,
      filename: session.file.name,
      fileSize: session.file.size,
      bytesUploaded,
      chunksUploaded: session.uploadedChunks.size,
      totalChunks: session.totalChunks,
      percentComplete: session.file.size > 0 
        ? Math.round((bytesUploaded / session.file.size) * 100) 
        : 0,
      currentChunk: currentChunk >= 0 ? currentChunk : 0,
      status: session.status,
      error,
      eta,
      speed,
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a chunked uploader instance
 */
export function createChunkedUploader(options?: ChunkedUploaderOptions): ChunkedUploader {
  return new ChunkedUploader(options);
}

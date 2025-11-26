"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { 
  ChunkedUploader, 
  ChunkUploadProgress, 
  createChunkedUploader,
  UploadStatus 
} from "@/lib/chunked-uploader";
import {
  initChunkedUpload,
  getChunkUploadInfo,
  finalizeUpload,
  abortUpload,
  resumeUpload as resumeUploadAction,
} from "@/app/actions/chunked-upload";

export interface UploadItem {
  id: string;
  file: File;
  progress: ChunkUploadProgress;
}

export interface UseChunkedUploadOptions {
  maxConcurrent?: number;
  chunkSize?: number;
  onComplete?: (uploadId: string, fileId: string, filename: string) => void;
  onError?: (uploadId: string, error: string, filename: string) => void;
}

export interface UseChunkedUploadReturn {
  uploads: UploadItem[];
  addFiles: (files: File[], targetPath?: string) => void;
  pauseUpload: (uploadId: string) => void;
  resumeUpload: (uploadId: string) => void;
  cancelUpload: (uploadId: string) => void;
  clearCompleted: () => void;
  isUploading: boolean;
  totalProgress: number;
}

export function useChunkedUpload(options: UseChunkedUploadOptions = {}): UseChunkedUploadReturn {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploaderRef = useRef<ChunkedUploader | null>(null);
  const uploadQueueRef = useRef<{ file: File; targetPath: string }[]>([]);
  const activeUploadsRef = useRef<Set<string>>(new Set());

  const maxConcurrent = options.maxConcurrent ?? 1;

  // Store callbacks in refs to avoid dependency issues
  const onCompleteRef = useRef(options.onComplete);
  const onErrorRef = useRef(options.onError);
  
  useEffect(() => {
    onCompleteRef.current = options.onComplete;
    onErrorRef.current = options.onError;
  }, [options.onComplete, options.onError]);

  // Initialize uploader
  useEffect(() => {
    const processQueueInternal = () => {
      // This will be called from onComplete/onError - trigger re-render to process queue
      setUploads(prev => [...prev]);
    };

    uploaderRef.current = createChunkedUploader({
      chunkSize: options.chunkSize,
      onProgress: (progress) => {
        setUploads(prev => prev.map(u => 
          u.id === progress.uploadId ? { ...u, progress } : u
        ));
      },
      onComplete: (uploadId, fileId) => {
        activeUploadsRef.current.delete(uploadId);
        setUploads(prev => {
          const upload = prev.find(u => u.id === uploadId);
          if (upload) {
            onCompleteRef.current?.(uploadId, fileId, upload.file.name);
          }
          return prev;
        });
        processQueueInternal();
      },
      onError: (uploadId, error) => {
        activeUploadsRef.current.delete(uploadId);
        setUploads(prev => {
          const upload = prev.find(u => u.id === uploadId);
          if (upload) {
            onErrorRef.current?.(uploadId, error, upload.file.name);
          }
          return prev;
        });
        processQueueInternal();
      },
    });

    return () => {
      // Cleanup on unmount
      uploaderRef.current = null;
    };
  }, [options.chunkSize]);

  // Store processQueue in ref to avoid circular dependency
  const processQueueRef = useRef<() => void>(() => {});

  // Process upload queue
  const processQueue = useCallback(() => {
    if (!uploaderRef.current) return;

    while (
      uploadQueueRef.current.length > 0 && 
      activeUploadsRef.current.size < maxConcurrent
    ) {
      const item = uploadQueueRef.current.shift();
      if (!item) break;

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add to uploads list with pending status
      setUploads(prev => [...prev, {
        id: tempId,
        file: item.file,
        progress: {
          uploadId: tempId,
          filename: item.file.name,
          fileSize: item.file.size,
          bytesUploaded: 0,
          chunksUploaded: 0,
          totalChunks: 0,
          percentComplete: 0,
          currentChunk: 0,
          status: 'pending' as UploadStatus,
        }
      }]);

      // Start upload
      (async () => {
        try {
          activeUploadsRef.current.add(tempId);
          
          const uploadId = await uploaderRef.current!.upload(
            item.file,
            item.targetPath,
            initChunkedUpload,
            getChunkUploadInfo,
            finalizeUpload
          );

          // Update the upload ID from temp to real
          setUploads(prev => prev.map(u => 
            u.id === tempId 
              ? { ...u, id: uploadId, progress: { ...u.progress, uploadId } }
              : u
          ));
          
          activeUploadsRef.current.delete(tempId);
          activeUploadsRef.current.add(uploadId);
        } catch (error) {
          activeUploadsRef.current.delete(tempId);
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          setUploads(prev => prev.map(u => 
            u.id === tempId 
              ? { 
                  ...u, 
                  progress: { 
                    ...u.progress, 
                    status: 'failed' as UploadStatus, 
                    error: errorMessage 
                  } 
                }
              : u
          ));
          processQueueRef.current();
        }
      })();
    }
  }, [maxConcurrent]);

  // Keep ref updated
  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  // Add files to upload
  const addFiles = useCallback((files: File[], targetPath: string = "/") => {
    for (const file of files) {
      uploadQueueRef.current.push({ file, targetPath });
    }
    processQueue();
  }, [processQueue]);

  // Pause an upload
  const pauseUpload = useCallback((uploadId: string) => {
    if (uploaderRef.current) {
      uploaderRef.current.pause(uploadId);
    }
  }, []);

  // Resume an upload
  const resumeUploadHandler = useCallback(async (uploadId: string) => {
    if (uploaderRef.current) {
      try {
        await uploaderRef.current.resume(
          uploadId,
          getChunkUploadInfo,
          finalizeUpload,
          resumeUploadAction
        );
      } catch (error) {
        console.error("Resume error:", error);
      }
    }
  }, []);

  // Cancel an upload
  const cancelUpload = useCallback(async (uploadId: string) => {
    if (uploaderRef.current) {
      uploaderRef.current.cancel(uploadId);
    }
    
    // Also notify server
    await abortUpload(uploadId);
    
    // Remove from list
    setUploads(prev => prev.filter(u => u.id !== uploadId));
    activeUploadsRef.current.delete(uploadId);
    processQueue();
  }, [processQueue]);

  // Clear completed uploads
  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => 
      u.progress.status !== 'completed' && 
      u.progress.status !== 'failed' &&
      u.progress.status !== 'cancelled'
    ));
  }, []);

  // Calculate total progress
  const totalProgress = uploads.length > 0
    ? uploads.reduce((acc, u) => acc + u.progress.percentComplete, 0) / uploads.length
    : 0;

  // Check if any upload is in progress
  const isUploading = uploads.some(u => 
    u.progress.status === 'uploading' || 
    u.progress.status === 'initializing' ||
    u.progress.status === 'finalizing'
  );

  return {
    uploads,
    addFiles,
    pauseUpload,
    resumeUpload: resumeUploadHandler,
    cancelUpload,
    clearCompleted,
    isUploading,
    totalProgress,
  };
}

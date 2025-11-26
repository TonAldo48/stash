"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  File as FileIcon, 
  Upload, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Pause,
  Play,
  Clock,
  Zap
} from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { formatBytes } from "@/lib/utils";
import { useChunkedUpload, UploadItem } from "@/hooks/use-chunked-upload";
import { UploadStatus } from "@/lib/chunked-uploader";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

interface ChunkedFileUploadProps {
  currentPath?: string;
  onUploadComplete?: () => void;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${Math.round(bytesPerSecond)} B/s`;
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  } else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
}

function getStatusColor(status: UploadStatus): string {
  switch (status) {
    case 'completed':
      return 'text-green-500';
    case 'failed':
    case 'cancelled':
      return 'text-red-500';
    case 'paused':
      return 'text-amber-500';
    case 'uploading':
    case 'initializing':
    case 'finalizing':
      return 'text-blue-500';
    default:
      return 'text-muted-foreground';
  }
}

function getStatusIcon(status: UploadStatus, className?: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className={cn("h-4 w-4", className)} />;
    case 'failed':
    case 'cancelled':
      return <AlertCircle className={cn("h-4 w-4", className)} />;
    case 'paused':
      return <Pause className={cn("h-4 w-4", className)} />;
    case 'uploading':
    case 'initializing':
    case 'finalizing':
      return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
    default:
      return <FileIcon className={cn("h-4 w-4", className)} />;
  }
}

function UploadItemRow({ 
  item, 
  onPause, 
  onResume, 
  onCancel 
}: { 
  item: UploadItem; 
  onPause: () => void; 
  onResume: () => void; 
  onCancel: () => void;
}) {
  const { progress } = item;
  const canPause = progress.status === 'uploading';
  const canResume = progress.status === 'paused';
  const canCancel = ['pending', 'uploading', 'paused', 'initializing'].includes(progress.status);
  const isActive = ['uploading', 'initializing', 'finalizing'].includes(progress.status);
  const isDone = ['completed', 'failed', 'cancelled'].includes(progress.status);

  return (
    <div className={cn(
      "p-3 sm:p-4 bg-secondary/40 rounded-lg border text-sm group transition-all",
      isDone && "opacity-75"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 overflow-hidden flex-1 min-w-0">
          <div className={cn("shrink-0", getStatusColor(progress.status))}>
            {getStatusIcon(progress.status)}
          </div>
          
          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate font-medium text-xs sm:text-sm">
              {progress.filename}
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-xs text-muted-foreground">
              <span>{formatBytes(progress.fileSize)}</span>
              
              {isActive && progress.speed && progress.speed > 0 && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {formatSpeed(progress.speed)}
                  </span>
                </>
              )}
              
              {isActive && progress.eta !== undefined && progress.eta > 0 && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    ~{formatDuration(progress.eta)}
                  </span>
                </>
              )}
              
              {progress.error && (
                <span className="text-red-500">• {progress.error}</span>
              )}
              
              {progress.status === 'finalizing' && (
                <span className="text-blue-500">• Processing...</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          {canPause && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onPause}
              title="Pause"
            >
              <Pause className="h-4 w-4" />
            </Button>
          )}
          
          {canResume && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-green-500 hover:text-green-600"
              onClick={onResume}
              title="Resume"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          
          {canCancel && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-red-500"
              onClick={onCancel}
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Progress bar */}
      {!isDone && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground mb-1">
            <span>
              {progress.chunksUploaded}/{progress.totalChunks} chunks
            </span>
            <span>{progress.percentComplete}%</span>
          </div>
          <Progress 
            value={progress.percentComplete} 
            className={cn(
              "h-1.5",
              progress.status === 'paused' && "[&>div]:bg-amber-500"
            )}
          />
        </div>
      )}
    </div>
  );
}

export default function ChunkedFileUpload({ 
  onUploadComplete, 
  currentPath = "/" 
}: ChunkedFileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    uploads,
    addFiles,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    clearCompleted,
    isUploading,
    totalProgress,
  } = useChunkedUpload({
    maxConcurrent: 2,
    chunkSize: 5 * 1024 * 1024, // 5MB chunks
    onComplete: (uploadId, fileId, filename) => {
      toast.success(`Uploaded ${filename} successfully`);
      onUploadComplete?.();
    },
    onError: (uploadId, error, filename) => {
      toast.error(`Failed to upload ${filename}: ${error}`);
    },
  });

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} exceeds 10GB limit`);
      } else {
        validFiles.push(file);
      }
    }

    if (errors.length > 0) {
      toast.error(errors.join(', '));
    }

    if (validFiles.length > 0) {
      addFiles(validFiles, currentPath);
    }
  }, [addFiles, currentPath]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const completedCount = uploads.filter(u => 
    ['completed', 'failed', 'cancelled'].includes(u.progress.status)
  ).length;

  return (
    <div className="w-full p-3 sm:p-4">
      <div className="w-full">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h3 className="text-base sm:text-lg font-semibold text-foreground">
            Upload Files
          </h3>
          {isUploading && (
            <div className="text-xs sm:text-sm text-muted-foreground">
              {Math.round(totalProgress)}% complete
            </div>
          )}
        </div>
        
        {/* Drop Zone */}
        <Label
          htmlFor="chunked-file-upload"
          className={cn(
            "flex justify-center rounded-md border-2 border-dashed px-3 sm:px-4 py-6 sm:py-8 transition-all cursor-pointer",
            isDragOver 
              ? "border-primary bg-primary/10" 
              : "border-input hover:bg-accent/50"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            id="chunked-file-upload"
            name="chunked-file-upload"
            type="file"
            className="sr-only"
            multiple
            onChange={handleInputChange}
            disabled={false}
          />
          <div className="text-center">
            <Upload className={cn(
              "mx-auto h-8 w-8 sm:h-10 sm:w-10 transition-colors",
              isDragOver ? "text-primary" : "text-muted-foreground"
            )} />
            <div className="mt-2 flex flex-wrap text-xs sm:text-sm leading-6 text-muted-foreground justify-center">
              <span className="font-medium text-primary hover:underline hover:text-primary/90">
                Choose files
              </span>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              Files up to 10GB • Chunked upload with resume support
            </p>
          </div>
        </Label>

        {/* Upload Queue */}
        {uploads.length > 0 && (
          <div className="mt-3 sm:mt-4 space-y-2 max-h-[350px] overflow-y-auto pr-1 sm:pr-2">
            <div className="flex items-center justify-between">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                Uploads ({uploads.length})
              </p>
              {completedCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={clearCompleted}
                >
                  Clear completed
                </Button>
              )}
            </div>
            
            {uploads.map((item) => (
              <UploadItemRow
                key={item.id}
                item={item}
                onPause={() => pauseUpload(item.id)}
                onResume={() => resumeUpload(item.id)}
                onCancel={() => cancelUpload(item.id)}
              />
            ))}
          </div>
        )}

        {/* Summary */}
        {uploads.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
              <span>
                {uploads.filter(u => u.progress.status === 'completed').length} of {uploads.length} completed
              </span>
              {isUploading && (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading...
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Pause,
  Play,
  Upload as UploadIcon,
  X,
  Square,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { formatBytes } from "@/lib/utils";
import {
  abortUpload,
  finalizeUpload,
  getUploadStatus,
  hashChunk,
  initUpload,
  uploadChunk,
} from "@/lib/uploads/client";

interface UploadTask {
  id: string;
  file: File;
  status:
    | "pending"
    | "initializing"
    | "uploading"
    | "paused"
    | "processing"
    | "success"
    | "error";
  uploadId?: string;
  chunkSize?: number;
  totalChunks?: number;
  strategy?: string;
  progress: number;
  uploadedBytes: number;
  nextChunkIndex: number;
  errorMessage?: string;
  pauseRequested?: boolean;
  abortRequested?: boolean;
  startedAt?: number;
  eta?: string | null;
}

type RunResult = "success" | "paused" | "aborted" | "error";
type ChunkLoopResult = "completed" | "paused" | "aborted";

const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function FileUpload({
  onUploadComplete,
  currentPath = "/",
}: {
  onUploadComplete?: () => void;
  currentPath?: string;
}) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const tasksRef = useRef<UploadTask[]>([]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const getTask = useCallback((taskId: string) => {
    return tasksRef.current.find((task) => task.id === taskId);
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<UploadTask>) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, ...updates } : task))
    );
  }, []);

  const removeTask = (taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      const newTasks = selected.map<UploadTask>((file) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(
            `${file.name} exceeds the 10GB limit (${formatBytes(file.size)})`
          );
        }
        return {
          id: generateId(),
          file,
          status: file.size > MAX_FILE_SIZE ? "error" : "pending",
          progress: 0,
          uploadedBytes: 0,
          nextChunkIndex: 0,
          errorMessage:
            file.size > MAX_FILE_SIZE
              ? "File exceeds 10GB limit"
              : undefined,
        };
      });
      setTasks((prev) => [...prev, ...newTasks]);
    }
    e.target.value = "";
  };

  const resetQueue = () => {
    setTasks([]);
    setIsUploading(false);
  };

  const handleUpload = async () => {
    const queue = tasksRef.current.filter((task) =>
      ["pending", "error"].includes(task.status)
    );
    if (queue.length === 0) return;

    setIsUploading(true);
    let successes = 0;

    for (const task of queue) {
      const result = await runTask(task.id);
      if (result === "success") {
        successes += 1;
        onUploadComplete?.();
      } else if (result === "paused") {
        break;
      }
    }

    setIsUploading(false);
    if (successes > 0) {
      toast.success(
        `Uploaded ${successes} file${successes === 1 ? "" : "s"} successfully`
      );
    }
  };

  const runTask = async (taskId: string): Promise<RunResult> => {
    let task = getTask(taskId);
    if (!task) return "error";

    updateTask(taskId, {
      status: "initializing",
      errorMessage: undefined,
      pauseRequested: false,
      abortRequested: false,
      startedAt: Date.now(),
    });

    try {
      if (!task.uploadId) {
        const init = await initUpload({
          filename: task.file.name,
          size: task.file.size,
          mimeType: task.file.type,
          folder: currentPath,
        });
        updateTask(taskId, {
          uploadId: init.uploadId,
          chunkSize: init.chunkSize,
          totalChunks: init.totalChunks,
          strategy: init.strategy,
          status: "uploading",
          nextChunkIndex: 0,
          uploadedBytes: 0,
        });
      } else if (task.status === "error") {
        try {
          const status = await getUploadStatus(task.uploadId);
          updateTask(taskId, {
            nextChunkIndex: status.nextChunk,
            uploadedBytes:
              status.nextChunk * (task.chunkSize ?? status.chunkSize),
            status: "uploading",
          });
        } catch {
          updateTask(taskId, {
            status: "uploading",
          });
        }
      } else {
        updateTask(taskId, { status: "uploading" });
      }

      task = getTask(taskId);
      if (!task?.uploadId || !task.chunkSize || !task.totalChunks) {
        throw new Error("Upload session failed to initialize");
      }

      const chunkResult = await uploadChunks(taskId);
      if (chunkResult === "paused") {
        return "paused";
      }
      if (chunkResult === "aborted") {
        updateTask(taskId, {
          status: "error",
          errorMessage: "Upload aborted",
        });
        return "aborted";
      }

      updateTask(taskId, { status: "processing", eta: null });
      await finalizeUpload(task.uploadId);
      updateTask(taskId, {
        status: "success",
        progress: 100,
        uploadedBytes: task.file.size,
        eta: null,
      });
      return "success";
    } catch (err: any) {
      updateTask(taskId, {
        status: "error",
        errorMessage: err?.message ?? "Upload failed",
      });
      toast.error(err?.message ?? "Upload failed");
      return "error";
    }
  };

  const uploadChunks = async (taskId: string): Promise<ChunkLoopResult> => {
    let task = getTask(taskId);
    if (!task?.uploadId || !task.chunkSize || !task.totalChunks) {
      throw new Error("Upload not ready");
    }

    for (
      let idx = task.nextChunkIndex;
      idx < task.totalChunks;
      idx = (task = getTask(taskId)!)?.nextChunkIndex ?? idx
    ) {
      task = getTask(taskId);
      if (!task) break;

      if (task.abortRequested) {
        if (task.uploadId) {
          try {
            await abortUpload(task.uploadId);
          } catch {
            // ignore
          }
        }
        return "aborted";
      }

      if (task.pauseRequested) {
        updateTask(taskId, { status: "paused" });
        return "paused";
      }

      const { file, chunkSize, uploadId } = task;
      const start = idx * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const checksum = await hashChunk(chunk);
      await uploadChunk({
        uploadId,
        chunk,
        chunkIndex: idx,
        checksum,
      });

      const uploadedBytes = end;
      const progress = Math.min(
        100,
        Math.round((uploadedBytes / file.size) * 100)
      );
      const eta = calculateETA(task.startedAt, uploadedBytes, file.size);

      updateTask(taskId, {
        uploadedBytes,
        progress,
        nextChunkIndex: idx + 1,
        eta,
      });
    }

    return "completed";
  };

  const calculateETA = (
    startedAt: number | undefined,
    uploaded: number,
    total: number
  ) => {
    if (!startedAt || uploaded === 0) return null;
    const elapsedMs = Date.now() - startedAt;
    const bytesPerMs = uploaded / Math.max(elapsedMs, 1);
    const remainingBytes = total - uploaded;
    if (bytesPerMs <= 0) return null;
    const etaMs = remainingBytes / bytesPerMs;
    if (!Number.isFinite(etaMs)) return null;
    if (etaMs < 1000) return "< 1s";
    const seconds = Math.round(etaMs / 1000);
    if (seconds < 60) return `${seconds}s remaining`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s remaining`;
  };

  const handlePause = (taskId: string) => {
    const task = getTask(taskId);
    if (!task || task.status !== "uploading") return;
    updateTask(taskId, { pauseRequested: true });
  };

  const handleResume = async (taskId: string) => {
    const task = getTask(taskId);
    if (!task || task.status !== "paused") return;
    updateTask(taskId, { pauseRequested: false });
    await runTask(taskId);
  };

  const handleAbort = (taskId: string) => {
    const task = getTask(taskId);
    if (!task) return;

    if (task.status === "pending") {
      removeTask(taskId);
      return;
    }

    updateTask(taskId, { abortRequested: true });
    toast.message(`Stopping ${task.file.name}...`);
  };

  const allSuccess =
    tasks.length > 0 && tasks.every((task) => task.status === "success");

  const statusLabel = (task: UploadTask) => {
    switch (task.status) {
      case "pending":
        return "Ready to upload";
      case "initializing":
        return "Preparing upload session...";
      case "uploading":
        return "Uploading chunks";
      case "paused":
        return "Paused";
      case "processing":
        return "Finalizing...";
      case "success":
        return "Completed";
      case "error":
        return task.errorMessage ?? "Upload failed";
      default:
        return "";
    }
  };

  return (
    <div className="w-full p-3 sm:p-4">
      <div className="w-full">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2 sm:mb-3">
          Upload Files
        </h3>

        <Label
          htmlFor="file-upload"
          className="flex justify-center rounded-md border-2 border-dashed border-input px-3 sm:px-4 py-6 sm:py-8 transition-colors hover:bg-accent/50 cursor-pointer"
        >
          <input
            id="file-upload"
            name="file-upload"
            type="file"
            className="sr-only"
            multiple
            onChange={handleFileSelect}
            disabled={isUploading}
          />
          <div className="text-center">
            <UploadIcon className="mx-auto h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
            <div className="mt-2 flex flex-wrap text-xs sm:text-sm leading-6 text-muted-foreground justify-center">
              <span className="font-medium text-primary hover:underline hover:text-primary/90">
                Choose files
              </span>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              Max file size: 10GB per file
            </p>
          </div>
        </Label>

        {tasks.length > 0 && (
          <div className="mt-3 sm:mt-4 space-y-2 sm:space-y-3 max-h-[250px] overflow-y-auto pr-1 sm:pr-2">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-2">
              Upload Queue ({tasks.length})
            </p>
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-md border bg-secondary/50 p-3 sm:p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  {task.status === "uploading" || task.status === "processing" ? (
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  ) : task.status === "success" ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : task.status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : task.status === "paused" ? (
                    <Pause className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <UploadIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-xs sm:text-sm">
                      {task.file.name}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {formatBytes(task.file.size)} · {statusLabel(task)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {task.status === "uploading" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handlePause(task.id)}
                      >
                        <Pause className="h-4 w-4" />
                      </Button>
                    )}
                    {task.status === "paused" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleResume(task.id)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    {["pending", "error"].includes(task.status) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => removeTask(task.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {["uploading", "processing", "paused"].includes(task.status) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500"
                        onClick={() => handleAbort(task.id)}
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{task.progress}%</span>
                    {task.eta && <span>{task.eta}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 sm:mt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:space-x-3">
          <Button
            type="button"
            variant="outline"
            onClick={resetQueue}
            disabled={isUploading || tasks.length === 0}
            className="w-full sm:w-auto text-sm"
          >
            Clear All
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={
              isUploading ||
              tasks.length === 0 ||
              allSuccess ||
              !tasks.some((task) =>
                ["pending", "error"].includes(task.status)
              )
            }
            className="w-full sm:w-auto sm:min-w-[100px] text-sm"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Start Uploads"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

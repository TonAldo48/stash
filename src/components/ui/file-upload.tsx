import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { File as FileIcon, Upload, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useState, useCallback } from "react";
import { uploadFile } from "@/app/actions/upload";
import { toast } from "sonner";
import { formatBytes } from "@/lib/utils";

interface FileStatus {
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error';
    errorMessage?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function FileUpload({ onUploadComplete, currentPath = "/" }: { onUploadComplete?: () => void, currentPath?: string }) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        const newFiles = Array.from(e.target.files).map(file => ({
            file,
            status: 'pending' as const
        }));
        setFiles(prev => [...prev, ...newFiles]);
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
      setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
        if (files[i].status === 'success') continue;

        // Check size limit
        if (files[i].file.size > MAX_FILE_SIZE) {
            setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', errorMessage: "File exceeds 10MB limit" } : f));
            continue;
        }

        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f));

        const formData = new FormData();
        formData.append("file", files[i].file);
        formData.append("path", currentPath);

        try {
            const res = await uploadFile(formData);
            
            if (res.error) {
                setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', errorMessage: res.error } : f));
            } else {
                setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'success' } : f));
                successCount++;
            }
        } catch (error) {
            setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', errorMessage: "Upload failed" } : f));
        }
    }

    setIsUploading(false);

    if (successCount > 0) {
        toast.success(`Uploaded ${successCount} file${successCount !== 1 ? 's' : ''} successfully`);
        onUploadComplete?.();
    }
  }

  return (
    <div className="w-full p-3 sm:p-4">
      <div className="w-full">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2 sm:mb-3">Upload Files</h3>
        
        {/* Drop Zone / Input */}
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
            <Upload className="mx-auto h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
            <div className="mt-2 flex flex-wrap text-xs sm:text-sm leading-6 text-muted-foreground justify-center">
              <span className="font-medium text-primary hover:underline hover:text-primary/90">Choose files</span>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              Max file size: 10MB per file
            </p>
          </div>
        </Label>

        {/* File Chips / List */}
        {files.length > 0 && (
            <div className="mt-3 sm:mt-4 space-y-2 sm:space-y-3 max-h-[200px] sm:max-h-[300px] overflow-y-auto pr-1 sm:pr-2">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-2">Selected Files ({files.length})</p>
                {files.map((fileStatus, index) => (
                    <div key={index} className="flex items-center justify-between p-2 sm:p-3 bg-secondary/40 rounded-md border text-xs sm:text-sm group">
                        <div className="flex items-center gap-2 sm:gap-3 overflow-hidden flex-1 min-w-0">
                            {fileStatus.status === 'uploading' ? (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                            ) : fileStatus.status === 'success' ? (
                                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                            ) : fileStatus.status === 'error' ? (
                                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                            ) : (
                                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            
                            <div className="flex flex-col min-w-0">
                                <span className="truncate font-medium text-xs sm:text-sm">{fileStatus.file.name}</span>
                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                    {formatBytes(fileStatus.file.size)} 
                                    {fileStatus.errorMessage && <span className="text-red-500 ml-1 sm:ml-2">• {fileStatus.errorMessage}</span>}
                                </span>
                            </div>
                        </div>
                        
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={() => removeFile(index)}
                            disabled={fileStatus.status === 'uploading' || fileStatus.status === 'success'}
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Remove</span>
                        </Button>
                    </div>
                ))}
            </div>
        )}

        {/* Actions */}
        <div className="mt-3 sm:mt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:space-x-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiles([])}
            disabled={isUploading || files.length === 0}
            className="w-full sm:w-auto text-sm"
          >
            Clear All
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || files.length === 0 || files.every(f => f.status === 'success')}
            className="w-full sm:w-auto sm:min-w-[100px] text-sm"
          >
            {isUploading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                </>
            ) : (
                "Upload Files"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

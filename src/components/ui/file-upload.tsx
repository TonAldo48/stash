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

export default function FileUpload({ onUploadComplete, currentPath = "/" }: { onUploadComplete?: () => void, currentPath?: string }) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        const newFiles = Array.from(e.target.files).map(file => ({
            file,
            status: 'pending' as const
        }));
        // Append to existing files, avoiding duplicates if possible? 
        // Simplest is just append. User can remove if they want.
        setFiles(prev => [...prev, ...newFiles]);
    }
    // Reset input value so same file can be selected again if needed (though usually not needed for this UI)
    e.target.value = '';
  };

  const removeFile = (index: number) => {
      setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    // Process files one by one or in small batches to provide progress feedback
    // For simplicity and feedback, one by one is good.
    
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
        if (files[i].status === 'success') continue; // Skip already uploaded

        // Update status to uploading
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
        // Optionally clear successful uploads? 
        // Maybe keep them to show success state, let user clear manually or close dialog.
    }
  }

  return (
    <div className="w-full p-4">
      <div className="w-full">
        <h3 className="text-lg font-semibold text-foreground mb-3">Upload Files</h3>
        
        {/* Drop Zone / Input */}
        <Label
          htmlFor="file-upload"
          className="flex justify-center rounded-md border-2 border-dashed border-input px-4 py-8 transition-colors hover:bg-accent/50 cursor-pointer"
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
            <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-2 flex text-sm leading-6 text-muted-foreground justify-center">
              <span className="font-medium text-primary hover:underline hover:text-primary/90">Choose files</span>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Max file size: 100MB per file
            </p>
          </div>
        </Label>

        {/* File Chips / List */}
        {files.length > 0 && (
            <div className="mt-4 space-y-3 max-h-[300px] overflow-y-auto pr-2">
                <p className="text-sm font-medium text-muted-foreground mb-2">Selected Files ({files.length})</p>
                {files.map((fileStatus, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-secondary/40 rounded-md border text-sm group">
                        <div className="flex items-center gap-3 overflow-hidden">
                            {fileStatus.status === 'uploading' ? (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                            ) : fileStatus.status === 'success' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : fileStatus.status === 'error' ? (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                            ) : (
                                <FileIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                            
                            <div className="flex flex-col min-w-0">
                                <span className="truncate font-medium">{fileStatus.file.name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {formatBytes(fileStatus.file.size)} 
                                    {fileStatus.errorMessage && <span className="text-red-500 ml-2">• {fileStatus.errorMessage}</span>}
                                </span>
                            </div>
                        </div>
                        
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
        <div className="mt-4 flex items-center justify-end space-x-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiles([])}
            disabled={isUploading || files.length === 0}
          >
            Clear All
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || files.length === 0 || files.every(f => f.status === 'success')}
            className="min-w-[100px]"
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

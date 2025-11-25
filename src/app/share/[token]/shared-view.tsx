"use client";

import { FileItem } from "@/app/actions/files";
import { ShareInfo, downloadSharedFile } from "@/app/actions/share";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { File, Folder, Download, ChevronRight, Home, Loader2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatBytes } from "@/lib/utils";
import { toast } from "sonner";
import { useState, useEffect } from "react";

interface SharedViewProps {
    file: FileItem;
    share: ShareInfo;
    childrenFiles?: FileItem[];
    currentPath: string;
    token: string;
}

export function SharedView({ file, share, childrenFiles = [], currentPath, token }: SharedViewProps) {
    const router = useRouter();
    const [isDownloading, setIsDownloading] = useState(false);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const isFolder = file.type === 'folder';
    const fileType = !isFolder ? getFileType(file.name) : null;
    const canPreview = fileType && ['image', 'text', 'pdf', 'audio', 'video'].includes(fileType);

    useEffect(() => {
        if (!isFolder && canPreview) {
            loadPreview();
        }
    }, [file.id, isFolder, canPreview]);

    const loadPreview = async () => {
        setIsLoadingPreview(true);
        setPreviewError(null);
        
        // For root file, targetPath is undefined. 
        // If we were navigating deep into a folder and `file` was that child, we'd need its path.
        // But here `file` IS the object we want to view.
        // If `file` is the root shared file, we use its token.
        // If `file` is actually a child we navigated to (wait, `SharedView` receives `file` which is the root share?).
        // No, looking at `page.tsx`: `const { file, share, error } = await getSharedFile(token);`
        // So `file` is ALWAYS the root shared item.
        // BUT, if `file.type === 'folder'`, we list children.
        // IF we are viewing a file inside a shared folder, how is that handled?
        // `page.tsx` only handles `token` and `path` query param for listing folder contents.
        // It DOES NOT switch `file` to be the child file. `file` is always the root.
        // We need to handle "viewing a file within a shared folder" in the UI.
        // Currently the UI for folder just lists files.
        
        // Wait, if the user clicks a file in a shared folder list, what happens?
        // `onClick={() => child.type === 'folder' ? handleNavigate(...) : null}`
        // It currently DOES NOTHING for files in a folder list except show a download button.
        // So for now, we only support previewing if the SHARED ROOT is a file.
        
        if (file.type === 'file') {
             const result = await downloadSharedFile(token);
             if (result.error) {
                 setPreviewError(result.error);
             } else if (result.content) {
                 setPreviewContent(result.content);
             }
        }
        setIsLoadingPreview(false);
    };

    const handleDownload = async (targetFile?: FileItem) => {
        const fileId = targetFile ? targetFile.id : file.id;
        setIsDownloading(true);
        
        // If targetFile is passed, it means we are downloading a child of a shared folder.
        // We need to construct the relative path for `downloadSharedFile`.
        // `downloadSharedFile` expects `targetFilePath` to be the full path?
        // Implementation: `target_path: path, target_name: name`.
        // If `targetFile` is provided, we pass `targetFile.path + '/' + targetFile.name`.
        
        const downloadPath = targetFile ? (targetFile.path === '/' ? '/' + targetFile.name : targetFile.path + '/' + targetFile.name) : undefined;

        const result = await downloadSharedFile(token, downloadPath);
        
        setIsDownloading(false);
        
        if (result.error) {
            toast.error(result.error);
            return;
        }
        
        if (result.content) {
            const byteCharacters = atob(result.content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray]);
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("Download started");
        }
    }

    const handleNavigate = (path: string) => {
        router.push(`/share/${token}?path=${encodeURIComponent(path)}`);
    }

    function getFileType(fileName: string) {
        const ext = fileName.split('.').pop()?.toLowerCase()
        if (!ext) return 'unknown'
        
        const imageTypes = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']
        const textTypes = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'php', 'rb', 'sh', 'yaml', 'yml', 'xml', 'sql', 'env', 'gitignore', 'log']
        const pdfTypes = ['pdf']
        const videoTypes = ['mp4', 'webm', 'ogg', 'mov']
        const audioTypes = ['mp3', 'wav', 'ogg', 'm4a', 'flac']
    
        if (imageTypes.includes(ext)) return 'image'
        if (textTypes.includes(ext)) return 'text'
        if (pdfTypes.includes(ext)) return 'pdf'
        if (videoTypes.includes(ext)) return 'video'
        if (audioTypes.includes(ext)) return 'audio'
        
        return 'unknown'
    }

    const renderPreview = () => {
        if (isLoadingPreview) {
             return (
                <div className="flex flex-col items-center justify-center py-10">
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground text-sm">Loading preview...</p>
                </div>
             )
        }

        if (previewError) {
            return (
                <div className="flex flex-col items-center justify-center py-10">
                    <AlertCircle className="h-10 w-10 text-red-400 mb-2" />
                    <p className="text-red-400">{previewError}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={loadPreview}>Retry</Button>
                </div>
            )
        }

        if (!previewContent) return null;

        switch (fileType) {
            case 'image':
                return (
                    <div className="flex items-center justify-center p-4 bg-zinc-950/5 rounded-lg border border-border/50">
                        <img 
                            src={`data:image/*;base64,${previewContent}`} 
                            alt={file.name}
                            className="max-h-[60vh] max-w-full object-contain rounded shadow-sm"
                        />
                    </div>
                )
            case 'text':
                return (
                    <div className="p-4 bg-zinc-950/5 rounded-lg border border-border/50 overflow-auto max-h-[60vh]">
                         <pre className="text-sm font-mono whitespace-pre-wrap break-words">{atob(previewContent)}</pre>
                    </div>
                )
            case 'pdf':
                 return (
                    <div className="h-[60vh] w-full">
                        <iframe 
                            src={`data:application/pdf;base64,${previewContent}`}
                            className="w-full h-full rounded-lg border"
                            title={file.name}
                        />
                    </div>
                 )
            case 'video':
                return (
                    <div className="flex items-center justify-center p-4 bg-black rounded-lg">
                        <video controls className="max-h-[60vh] max-w-full" autoPlay>
                             <source src={`data:video/mp4;base64,${previewContent}`} />
                             Your browser does not support the video tag.
                        </video>
                    </div>
                )
             case 'audio':
                return (
                    <div className="flex flex-col items-center justify-center p-10 bg-zinc-950/5 rounded-lg border border-border/50">
                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                             <File className="h-10 w-10 text-primary" />
                        </div>
                        <audio controls className="w-full max-w-md">
                             <source src={`data:audio/mpeg;base64,${previewContent}`} />
                             Your browser does not support the audio element.
                        </audio>
                    </div>
                )
            default:
                return null;
        }
    }

    return (
        <div className="container mx-auto py-10 max-w-4xl">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent" onClick={() => handleNavigate("")}>
                            <Home className="h-4 w-4" />
                        </Button>
                        {currentPath && (
                             <>
                                <ChevronRight className="h-4 w-4" />
                                <span>{currentPath.split('/').filter(Boolean).join(' / ')}</span>
                             </>
                        )}
                    </div>
                    <CardTitle className="flex items-center gap-2">
                        {file.type === 'folder' ? <Folder className="h-6 w-6 text-blue-500" /> : <File className="h-6 w-6 text-gray-500" />}
                        {file.name}
                    </CardTitle>
                    <CardDescription>
                        Shared by owner • {file.type === 'folder' ? 'Folder' : formatBytes(parseFloat(file.size))}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isFolder ? (
                        <div className="border rounded-md divide-y">
                            {childrenFiles.length === 0 ? (
                                <div className="p-4 text-center text-muted-foreground">Empty folder</div>
                            ) : (
                                childrenFiles.map((child) => (
                                    <div key={child.id} className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                        <div 
                                            className="flex items-center gap-3 cursor-pointer flex-1"
                                            onClick={() => child.type === 'folder' 
                                                ? handleNavigate(child.path === '/' ? '/' + child.name : child.path + '/' + child.name)
                                                : null
                                            }
                                        >
                                            {child.type === 'folder' ? 
                                                <Folder className="h-5 w-5 text-blue-500 fill-blue-500" /> : 
                                                <File className="h-5 w-5 text-gray-400" />
                                            }
                                            <span className="text-sm font-medium">{child.name}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-xs text-muted-foreground">{child.size}</span>
                                            {child.type === 'file' && (
                                                <Button size="sm" variant="ghost" onClick={() => handleDownload(child)}>
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            {canPreview && (
                                <div className="w-full">
                                    {renderPreview()}
                                </div>
                            )}
                            
                            {!canPreview && !isLoadingPreview && (
                                <div className="flex flex-col items-center justify-center py-10 gap-4">
                                    <File className="h-16 w-16 text-gray-300" />
                                    <p className="text-muted-foreground">Preview not available for this file type.</p>
                                </div>
                            )}

                            <div className="flex justify-center">
                                <Button onClick={() => handleDownload()} disabled={isDownloading} size="lg">
                                    {isDownloading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Downloading...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="mr-2 h-4 w-4" />
                                            Download File
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

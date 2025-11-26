"use client"

import {
  File,
  Folder,
  FolderPlus,
  Grid,
  List,
  MoreHorizontal,
  Plus,
  Download,
  Share,
  Trash,
  Loader2,
  Eye
} from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import ChunkedFileUpload from "@/components/ui/chunked-file-upload"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { FilePreview } from "@/components/file-preview"
import { ShareDialog } from "@/components/share-dialog"

import { listFiles, createFolder, deleteItem, downloadFile, FileItem } from "@/app/actions/files";

export default function DashboardPage() {
  const [view, setView] = useState<"list" | "grid">("list")
  const [files, setFiles] = useState<FileItem[]>([])
  const [currentPath, setCurrentPath] = useState("/")
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: "file" | "folder" } | null>(null)
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [shareFile, setShareFile] = useState<FileItem | null>(null)
  
  // Get only files (not folders) for navigation
  const previewableFiles = files.filter(f => f.type === "file")
  
  const handlePreviewNext = () => {
    if (!previewFile) return
    const currentIndex = previewableFiles.findIndex(f => f.id === previewFile.id)
    if (currentIndex < previewableFiles.length - 1) {
      setPreviewFile(previewableFiles[currentIndex + 1])
    }
  }

  const handlePreviewPrevious = () => {
    if (!previewFile) return
    const currentIndex = previewableFiles.findIndex(f => f.id === previewFile.id)
    if (currentIndex > 0) {
      setPreviewFile(previewableFiles[currentIndex - 1])
    }
  }
  
  const fetchFiles = useCallback(async () => {
    setIsLoading(true)
    const res = await listFiles(currentPath)
    if (res.files) {
        setFiles(res.files)
    }
    setIsLoading(false)
  }, [currentPath])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const handleCreateFolder = async () => {
    if (!newFolderName) return;
    setIsCreatingFolder(true);
    const result = await createFolder(newFolderName, currentPath);
    setIsCreatingFolder(false);
    if (result.error) {
        toast.error(result.error);
        return;
    }
    toast.success("Folder created successfully");
    setNewFolderName("");
    setIsCreateFolderOpen(false);
    fetchFiles();
  }

  const handleDeleteClick = (id: string, type: "file" | "folder") => {
    setItemToDelete({ id, type })
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    const { id, type } = itemToDelete
    setIsDeleting(id);
    const result = await deleteItem(id, type);
    setIsDeleting(null);
    setDeleteConfirmOpen(false)
    setItemToDelete(null)
    
    if (result.error) {
        toast.error(result.error);
        return;
    }
    toast.success(`${type === 'folder' ? 'Folder' : 'File'} deleted successfully`);
    fetchFiles();
  }

  const handleDownload = async (fileId: string, fileName: string) => {
    setIsDownloading(fileId);
    const result = await downloadFile(fileId);
    setIsDownloading(null);
    
    if (result.error) {
        toast.error(result.error);
        return;
    }
    
    if (result.content) {
        // Convert base64 to blob and download
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
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Download started");
    }
  }

  const handleNavigate = (path: string) => {
      setCurrentPath(path);
  }

  const handleItemClick = (file: FileItem) => {
    if (file.type === "folder") {
      handleNavigate(file.path ? `${file.path === '/' ? '' : file.path}/${file.name}` : `/${file.name}`)
    } else {
      setPreviewFile(file)
    }
  }

  const getBreadcrumbs = () => {
      const parts = currentPath.split("/").filter(Boolean);
      let path = "";
      return parts.map(part => {
          path += `/${part}`;
          return { name: part, path };
      });
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Mobile: Stack breadcrumb and actions vertically */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Breadcrumb className="min-w-0 overflow-hidden">
          <BreadcrumbList className="flex-wrap">
            <BreadcrumbItem>
              <BreadcrumbLink onClick={() => handleNavigate("/")} className="cursor-pointer">Home</BreadcrumbLink>
            </BreadcrumbItem>
            {getBreadcrumbs().map((crumb) => (
                <div key={crumb.path} className="flex items-center">
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink onClick={() => handleNavigate(crumb.path)} className="cursor-pointer truncate max-w-[100px] sm:max-w-none">{crumb.name}</BreadcrumbLink>
                    </BreadcrumbItem>
                </div>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-md border shadow-sm">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setView("list")}
            >
              <List className="h-4 w-4" />
              <span className="sr-only">List view</span>
            </Button>
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none border-l"
              onClick={() => setView("grid")}
            >
              <Grid className="h-4 w-4" />
              <span className="sr-only">Grid view</span>
            </Button>
          </div>
          
          <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1">
                    <FolderPlus className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">New Folder</span>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Folder Name</Label>
                        <Input id="name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleCreateFolder} disabled={isCreatingFolder || !newFolderName}>
                      {isCreatingFolder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isCreatingFolder ? "Creating..." : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
               <Button size="sm" className="h-8 gap-1 bg-[#2da44e] hover:bg-[#2c974b] text-white">
                <Plus className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Upload
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl p-0 border-none bg-transparent shadow-none max-w-[calc(100%-2rem)]">
              <DialogTitle className="sr-only">Upload File</DialogTitle>
              <Card className="w-full">
                 <ChunkedFileUpload 
                    currentPath={currentPath}
                    onUploadComplete={() => {
                        fetchFiles();
                    }} 
                 />
              </Card>
            </DialogContent>
          </Dialog>
         
        </div>
      </div>

      {view === "list" ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Name</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Last Modified</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                  <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                          <div className="flex items-center justify-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading files...
                          </div>
                      </TableCell>
                  </TableRow>
              ) : files.length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No files found. Upload a file or create a folder to get started.
                      </TableCell>
                  </TableRow>
              ) : files.map((file) => (
                <TableRow key={file.id} className={isDeleting === file.id ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleItemClick(file)}>
                      {file.type === "folder" ? (
                        <Folder className="h-4 w-4 text-blue-500 fill-blue-500 shrink-0" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{file.name}</span>
                    </div>
                    {/* Mobile: Show size under name */}
                    <div className="sm:hidden text-xs text-muted-foreground mt-1 ml-6">
                      {file.size}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{file.size}</TableCell>
                  <TableCell className="hidden md:table-cell">{new Date(file.modified).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-haspopup="true"
                          size="icon"
                          variant="ghost"
                          disabled={isDeleting === file.id || isDownloading === file.id}
                        >
                          {isDownloading === file.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        {file.type === "file" && (
                          <>
                            <DropdownMenuItem onClick={() => setPreviewFile(file)}>
                                <Eye className="mr-2 h-4 w-4" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(file.id, file.name)}>
                                <Download className="mr-2 h-4 w-4" /> Download
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem onClick={() => setShareFile(file)}>
                            <Share className="mr-2 h-4 w-4" /> Share
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteClick(file.id, file.type)}>
                             <Trash className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading files...
          </div>
        </div>
      ) : files.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No files found. Upload a file or create a folder to get started.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {files.map((file) => (
            <Card key={file.id} className={`overflow-hidden ${isDeleting === file.id ? "opacity-50" : ""}`}>
              <CardContent 
                className="p-3 sm:p-4 flex flex-col items-center gap-2 relative group cursor-pointer"
                onClick={() => handleItemClick(file)}
              >
                 {/* Always visible on mobile (touch), hover on desktop */}
                 <div className="absolute right-1 top-1 sm:right-2 sm:top-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-6 sm:w-6" disabled={isDeleting === file.id || isDownloading === file.id}>
                          {isDownloading === file.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                         {file.type === "file" && (
                           <>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }}>
                               <Eye className="mr-2 h-4 w-4" /> Preview
                             </DropdownMenuItem>
                             <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(file.id, file.name); }}>
                               <Download className="mr-2 h-4 w-4" /> Download
                             </DropdownMenuItem>
                           </>
                         )}
                         <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShareFile(file); }}>
                           <Share className="mr-2 h-4 w-4" /> Share
                         </DropdownMenuItem>
                         <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteClick(file.id, file.type); }}>
                           <Trash className="mr-2 h-4 w-4" /> Delete
                         </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                 </div>
                 {file.type === "folder" ? (
                    <Folder className="h-10 w-10 sm:h-12 sm:w-12 text-blue-500 fill-blue-500" />
                  ) : (
                    <File className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" />
                  )}
                <div className="text-center w-full">
                  <div className="font-medium truncate text-xs sm:text-sm" title={file.name}>{file.name}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">{file.size}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Are you sure?"
        description="This action cannot be undone. This will permanently delete the item."
        onConfirm={confirmDelete}
      />

      <FilePreview 
        file={previewFile}
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        onNext={handlePreviewNext}
        onPrevious={handlePreviewPrevious}
        hasNext={previewFile ? previewableFiles.findIndex(f => f.id === previewFile.id) < previewableFiles.length - 1 : false}
        hasPrevious={previewFile ? previewableFiles.findIndex(f => f.id === previewFile.id) > 0 : false}
      />

      <ShareDialog 
        file={shareFile}
        isOpen={!!shareFile}
        onClose={() => setShareFile(null)}
      />
    </div>
  )
}

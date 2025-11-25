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
  Trash,
  Upload,
  Share2
} from "lucide-react"
import { useState, useEffect, useCallback } from "react"

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import FileUpload from "@/components/ui/file-upload"

import { listFiles, createFolder, deleteItem } from "@/app/actions/files";

export default function DashboardPage() {
  const [view, setView] = useState<"list" | "grid">("list")
  const [files, setFiles] = useState<any[]>([])
  const [currentPath, setCurrentPath] = useState("/")
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  
  const fetchFiles = useCallback(() => {
    listFiles(currentPath).then(res => {
        if (res.files) {
            setFiles(res.files)
        }
    })
  }, [currentPath])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const handleCreateFolder = async () => {
    if (!newFolderName) return;
    await createFolder(newFolderName, currentPath);
    setNewFolderName("");
    setIsCreateFolderOpen(false);
    fetchFiles();
  }

  const handleDelete = async (id: string, type: "file" | "folder") => {
    if (confirm("Are you sure you want to delete this item?")) {
        await deleteItem(id, type);
        fetchFiles();
    }
  }

  const handleNavigate = (path: string) => {
      setCurrentPath(path);
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={() => handleNavigate("/")} className="cursor-pointer">Home</BreadcrumbLink>
            </BreadcrumbItem>
            {getBreadcrumbs().map((crumb) => (
                <div key={crumb.path} className="flex items-center">
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink onClick={() => handleNavigate(crumb.path)} className="cursor-pointer">{crumb.name}</BreadcrumbLink>
                    </BreadcrumbItem>
                </div>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-2">
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
                    <Button onClick={handleCreateFolder}>Create</Button>
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
            <DialogContent className="sm:max-w-xl p-0 border-none bg-transparent shadow-none">
              <DialogTitle className="sr-only">Upload File</DialogTitle>
              <Card className="w-full">
                 <FileUpload 
                    currentPath={currentPath}
                    onUploadComplete={() => {
                        setIsUploadOpen(false);
                        fetchFiles();
                    }} 
                 />
              </Card>
            </DialogContent>
          </Dialog>
         
        </div>
      </div>

      {view === "list" ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No files found. Upload a file or create a folder to get started.
                      </TableCell>
                  </TableRow>
              ) : files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => file.type === "folder" && handleNavigate(file.path ? `${file.path === '/' ? '' : file.path}/${file.name}` : `/${file.name}`)}>
                      {file.type === "folder" ? (
                        <Folder className="h-4 w-4 text-blue-500 fill-blue-500" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground" />
                      )}
                      {file.name}
                    </div>
                  </TableCell>
                  <TableCell>{file.size}</TableCell>
                  <TableCell>{new Date(file.modified).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-haspopup="true"
                          size="icon"
                          variant="ghost"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem>
                            <Download className="mr-2 h-4 w-4" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(file.id, file.type)}>
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
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {files.map((file) => (
            <Card key={file.id} className="overflow-hidden">
              <CardContent 
                className="p-4 flex flex-col items-center gap-2 relative group cursor-pointer"
                onClick={() => file.type === "folder" && handleNavigate(file.path ? `${file.path === '/' ? '' : file.path}/${file.name}` : `/${file.name}`)}
              >
                 <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-6 w-6">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                         <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(file.id, file.type)}>Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                 </div>
                 {file.type === "folder" ? (
                    <Folder className="h-12 w-12 text-blue-500 fill-blue-500" />
                  ) : (
                    <File className="h-12 w-12 text-muted-foreground" />
                  )}
                <div className="text-center w-full">
                  <div className="font-medium truncate text-sm" title={file.name}>{file.name}</div>
                  <div className="text-xs text-muted-foreground">{file.size}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

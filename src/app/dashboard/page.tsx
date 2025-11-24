"use client"

import {
  File,
  Folder,
  Grid,
  List,
  MoreHorizontal,
  Plus,
  Download,
  Trash,
  Upload,
  Share2
} from "lucide-react"
import { useState } from "react"

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
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import FileUpload05 from "@/components/ui/file-upload-1"

const files = [
  { id: 1, name: "Documents", type: "folder", size: "-", modified: "2 days ago" },
  { id: 2, name: "Images", type: "folder", size: "-", modified: "1 week ago" },
  { id: 3, name: "Work", type: "folder", size: "-", modified: "1 month ago" },
  { id: 4, name: "presentation.pptx", type: "file", size: "2.4 MB", modified: "Yesterday" },
  { id: 5, name: "budget.xlsx", type: "file", size: "1.1 MB", modified: "3 days ago" },
  { id: 6, name: "notes.txt", type: "file", size: "12 KB", modified: "Just now" },
  { id: 7, name: "profile.png", type: "file", size: "4.5 MB", modified: "1 week ago" },
]

export default function DashboardPage() {
  const [view, setView] = useState<"list" | "grid">("list")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>My Files</BreadcrumbPage>
            </BreadcrumbItem>
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
          <Dialog>
            <DialogTrigger asChild>
               <Button size="sm" className="h-8 gap-1 bg-[#2da44e] hover:bg-[#2c974b] text-white">
                <Plus className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  New
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl p-0 border-none bg-transparent shadow-none">
              <DialogTitle className="sr-only">Upload File</DialogTitle>
              <Card className="w-full">
                 <FileUpload05 />
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
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {file.type === "folder" ? (
                        <Folder className="h-4 w-4 text-blue-500 fill-blue-500" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground" />
                      )}
                      {file.name}
                    </div>
                  </TableCell>
                  <TableCell>{file.size}</TableCell>
                  <TableCell>{file.modified}</TableCell>
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
                        <DropdownMenuItem>
                             <Share2 className="mr-2 h-4 w-4" /> Share
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600">
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
              <CardContent className="p-4 flex flex-col items-center gap-2">
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

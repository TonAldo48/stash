"use server";

import { createClient } from "@/lib/supabase/server";
import { GitHubService } from "@/lib/github";

const ROOT_REPO = "gitdrive-root";

export interface FileItem {
  id: string;
  name: string;
  type: "file" | "folder";
  size: string;
  modified: string;
  path: string;
  repo?: string; // For files
  sha?: string;
}

interface Metadata {
  files: FileItem[];
  folders: FileItem[];
  system?: {
    active_repo: string;
    repos: string[];
  }
}

async function getMetadata(github: GitHubService): Promise<Metadata> {
    const file = await github.getFile(ROOT_REPO, "metadata.json");
    if (!file) return { files: [], folders: [], system: { active_repo: "gitdrive-storage-001", repos: ["gitdrive-storage-001"] } };
    return JSON.parse(file.content);
}

async function saveMetadata(github: GitHubService, metadata: Metadata, message: string) {
    await github.uploadFile(
        ROOT_REPO,
        "metadata.json",
        JSON.stringify(metadata, null, 2),
        message
    );
}

export async function listFiles(path: string = "/") {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.provider_token) {
    return { error: "Unauthorized" };
  }

  const github = new GitHubService(session.provider_token);

  try {
    const metadata = await getMetadata(github);
    const currentPath = path === "/" ? "/" : path;

    const files = metadata.files.filter(f => f.path === currentPath);
    const folders = metadata.folders.filter(f => f.path === currentPath);

    return { files: [...folders, ...files] };
  } catch (error: any) {
    console.error("List files error:", error);
    return { error: error.message };
  }
}

export async function createFolder(name: string, path: string = "/") {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.provider_token) return { error: "Unauthorized" };

    const github = new GitHubService(session.provider_token);

    try {
        const metadata = await getMetadata(github);
        
        const newFolder: FileItem = {
            id: crypto.randomUUID(),
            name,
            type: "folder",
            size: "-",
            modified: new Date().toISOString(),
            path
        };

        metadata.folders.push(newFolder);
        await saveMetadata(github, metadata, `Create folder ${name}`);
        
        return { success: true, folder: newFolder };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function deleteItem(id: string, type: "file" | "folder") {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.provider_token) return { error: "Unauthorized" };

    const github = new GitHubService(session.provider_token);

    try {
        const metadata = await getMetadata(github);

        if (type === "file") {
            metadata.files = metadata.files.filter(f => f.id !== id);
        } else {
            metadata.folders = metadata.folders.filter(f => f.id !== id);
        }

        await saveMetadata(github, metadata, `Delete ${type} ${id}`);
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function downloadFile(fileId: string) {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.provider_token) return { error: "Unauthorized" };

    const github = new GitHubService(session.provider_token);

    try {
        const metadata = await getMetadata(github);
        const file = metadata.files.find(f => f.id === fileId);
        
        if (!file) {
            return { error: "File not found" };
        }

        if (!file.repo || !file.sha) {
            return { error: "File metadata incomplete" };
        }

        // Get the file content from the storage repo
        const fileData = await github.getFileRaw(file.repo, file.sha);
        
        if (!fileData) {
            return { error: "File not found in storage" };
        }

        return { 
            success: true, 
            content: fileData.content.toString("base64"),
            name: file.name,
            size: file.size
        };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function getStorageStats() {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.provider_token) return { error: "Unauthorized" };

    const github = new GitHubService(session.provider_token);

    try {
        const metadata = await getMetadata(github);
        
        // Calculate total size from file metadata
        let totalBytes = 0;
        for (const file of metadata.files) {
            const sizeStr = file.size;
            if (sizeStr && sizeStr !== "-") {
                const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
                if (match) {
                    const value = parseFloat(match[1]);
                    const unit = match[2].toUpperCase();
                    const multipliers: Record<string, number> = { 
                        'B': 1, 
                        'KB': 1024, 
                        'MB': 1024 * 1024, 
                        'GB': 1024 * 1024 * 1024 
                    };
                    totalBytes += value * (multipliers[unit] || 1);
                }
            }
        }

        // Get the list of storage repos
        const repos = metadata.system?.repos || ["gitdrive-storage-001"];
        
        return { 
            success: true,
            used: totalBytes,
            fileCount: metadata.files.length,
            folderCount: metadata.folders.length,
            repos: repos.length
        };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function searchFiles(query: string) {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.provider_token) return { error: "Unauthorized" };

    const github = new GitHubService(session.provider_token);

    try {
        const metadata = await getMetadata(github);
        const lowerQuery = query.toLowerCase();
        
        const matchingFiles = metadata.files.filter(f => 
            f.name.toLowerCase().includes(lowerQuery)
        );
        const matchingFolders = metadata.folders.filter(f => 
            f.name.toLowerCase().includes(lowerQuery)
        );

        return { files: [...matchingFolders, ...matchingFiles] };
    } catch (error: any) {
        return { error: error.message };
    }
}

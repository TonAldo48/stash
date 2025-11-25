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

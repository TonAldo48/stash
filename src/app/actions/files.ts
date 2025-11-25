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
    const file = await github.getFile(ROOT_REPO, "metadata.json");
    if (!file) {
      return { files: [] };
    }

    const metadata: Metadata = JSON.parse(file.content);
    
    // Simple filtering based on path (virtual filesystem)
    // For root "/", we show items with path "/" or items with no path property (legacy)
    // This is a simplified implementation. Real impl needs robust path matching.
    
    const currentPath = path === "/" ? "/" : path;

    const files = metadata.files.filter(f => {
        // If file path is "/docs/test.txt", parent is "/docs"
        // We want files where parent(f.path) === currentPath
        // For simplicity, let's assume flat structure for MVP or `path` property is the parent folder
        return f.path === currentPath; 
    });

    const folders = metadata.folders.filter(f => f.path === currentPath);

    return { files: [...folders, ...files] };
  } catch (error: any) {
    console.error("List files error:", error);
    return { error: error.message };
  }
}


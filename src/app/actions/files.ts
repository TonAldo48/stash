"use server";

import { createClient } from "@/lib/supabase/server";
import { GitHubService } from "@/lib/github";
import { formatBytes } from "@/lib/utils";

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

export async function listFiles(path: string = "/") {
  const supabase = await createClient();
  
  // RLS will handle user filtering, but we need to be authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
      return { error: "Unauthorized" };
  }

  try {
    const currentPath = path === "/" ? "/" : path;

    const { data: dbFiles, error } = await supabase
        .from('files')
        .select('*')
        .eq('path', currentPath)
        .order('type', { ascending: false }) // Folders first
        .order('name', { ascending: true });

    if (error) throw error;

    const files: FileItem[] = dbFiles.map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.type === 'folder' ? '-' : formatBytes(f.size_bytes || 0),
        modified: f.created_at,
        path: f.path,
        repo: f.repo_name,
        sha: f.blob_path // using blob_path as sha/ref
    }));

    return { files };
  } catch (error: any) {
    console.error("List files error:", error);
    return { error: error.message };
  }
}

export async function createFolder(name: string, path: string = "/") {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "Unauthorized" };

    try {
        const { data, error } = await supabase
            .from('files')
            .insert({
                user_id: user.id,
                name,
                type: 'folder',
                path,
                size_bytes: 0
            })
            .select()
            .single();

        if (error) throw error;

        const newFolder: FileItem = {
            id: data.id,
            name: data.name,
            type: "folder",
            size: "-",
            modified: data.created_at,
            path: data.path
        };
        
        return { success: true, folder: newFolder };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function deleteItem(id: string, type: "file" | "folder") {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "Unauthorized" };

    try {
        const { error } = await supabase
            .from('files')
            .delete()
            .eq('id', id);

        if (error) throw error;

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
        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', fileId)
            .single();

        if (error || !file) {
            return { error: "File not found" };
        }

        if (!file.repo_name || !file.blob_path) {
            return { error: "File metadata incomplete" };
        }

        // Get the file content from the storage repo
        const fileData = await github.getFileRaw(file.repo_name, file.blob_path);
        
        if (!fileData) {
            return { error: "File not found in storage" };
        }

        return { 
            success: true, 
            content: fileData.content.toString("base64"),
            name: file.name,
            size: formatBytes(file.size_bytes)
        };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function getStorageStats() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "Unauthorized" };

    try {
        // Get storage usage from tracked table
        const { data: usage, error: usageError } = await supabase
            .from('user_storage_usage')
            .select('total_bytes, file_count, folder_count')
            .eq('user_id', user.id)
            .single();
            
        // It's possible the row doesn't exist yet if no files created, handle gracefully
        const totalBytes = usage?.total_bytes || 0;
        const fileCount = usage?.file_count || 0;
        const folderCount = usage?.folder_count || 0;

        if (usageError && usageError.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
             // If usage row missing but files exist (race condition or failed trigger), 
             // we could fallback to count or just return 0. Returning 0 is safe for MVP.
             if (usageError.code !== 'PGRST116') throw usageError;
        }

        // Get repo count
        const { count: repoCount, error: repoError } = await supabase
            .from('storage_repos')
            .select('*', { count: 'exact', head: true });

        if (repoError) throw repoError;
        
        return { 
            success: true,
            used: totalBytes,
            fileCount,
            folderCount,
            repos: repoCount || 0
        };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function searchFiles(query: string) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "Unauthorized" };

    try {
        const formattedQuery = query.trim().split(/\s+/).map(w => `${w}:*`).join(' & ');
        
        const { data: dbFiles, error } = await supabase
            .from('files')
            .select('*')
            .textSearch('name_search', formattedQuery);

        if (error) throw error;

        const files: FileItem[] = dbFiles.map((f: any) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            size: f.type === 'folder' ? '-' : formatBytes(f.size_bytes || 0),
            modified: f.created_at,
            path: f.path,
            repo: f.repo_name,
            sha: f.blob_path
        }));

        return { files };
    } catch (error: any) {
        return { error: error.message };
    }
}

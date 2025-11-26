"use server";

import { Buffer } from "node:buffer";

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
  repo?: string;
  sha?: string;
  storageStrategy?: string;
  storageMetadata?: Record<string, any> | null;
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
        .select('id, name, type, size_bytes, created_at, path, repo_name, blob_path, storage_strategy, storage_metadata')
        .eq('path', currentPath)
        .order('type', { ascending: false })
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
        sha: f.blob_path,
        storageStrategy: f.storage_strategy,
        storageMetadata: f.storage_metadata
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

    // Validate folder name
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
        return { error: "Invalid folder name" };
    }

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

        const strategy = file.storage_strategy || "repo_single";
        let buffer: Buffer | null = null;

        if (strategy === "repo_chunks") {
            buffer = await downloadFromChunks(github, file.repo_name, file.blob_path);
        } else if (strategy === "release_asset") {
            buffer = await downloadFromReleaseAsset(github, file.repo_name, file);
        } else {
            const fileData = await github.getFileRaw(file.repo_name, file.blob_path);
            buffer = fileData?.content ?? null;
        }

        if (!buffer) {
            return { error: "Unable to download file contents" };
        }

        return { 
            success: true, 
            content: buffer.toString("base64"),
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

async function downloadFromChunks(
    github: GitHubService,
    repo: string,
    manifestPath: string
) {
    const manifestData = await github.getFile(repo, manifestPath);
    if (!manifestData?.content) {
        return null;
    }

    const manifest = JSON.parse(manifestData.content);
    const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
    if (chunks.length === 0) {
        throw new Error("Chunk manifest is empty");
    }

    const sortedChunks = chunks
        .map((chunk: any) => ({
            index: chunk.index ?? 0,
            path: chunk.path,
        }))
        .sort((a: any, b: any) => a.index - b.index);

    const buffers: Buffer[] = [];
    for (const chunk of sortedChunks) {
        if (!chunk.path) continue;
        const chunkData = await github.getFileRaw(repo, chunk.path);
        if (!chunkData?.content) {
            throw new Error(`Missing chunk ${chunk.path}`);
        }
        buffers.push(chunkData.content);
    }

    return Buffer.concat(buffers);
}

async function downloadFromReleaseAsset(
    github: GitHubService,
    repo: string,
    file: any
) {
    const metadata = file.storage_metadata || {};
    const assetId =
        metadata.assetId ??
        parseIntFromBlobPath(file.blob_path);

    if (!assetId) {
        throw new Error("Release asset metadata missing");
    }

    const buffer = await github.downloadReleaseAsset(repo, assetId);
    if (!buffer) {
        throw new Error("Unable to fetch release asset");
    }
    return buffer;
}

function parseIntFromBlobPath(blobPath?: string) {
    if (!blobPath?.startsWith("release:")) return null;
    const parts = blobPath.split(":");
    const assetPart = parts[2];
    const assetId = Number(assetPart);
    return Number.isNaN(assetId) ? null : assetId;
}

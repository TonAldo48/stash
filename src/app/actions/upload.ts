"use server";

import { createClient } from "@/lib/supabase/server";
import { GitHubService } from "@/lib/github";
import { FileItem } from "./files";

const ROOT_REPO = "gitdrive-root";
const STORAGE_REPO_PREFIX = "gitdrive-storage";
const MAX_REPO_SIZE = 4 * 1024 * 1024 * 1024; // 4GB threshold before creating new repo

export async function uploadFile(formData: FormData) {
  const file = formData.get("file") as File;
  const path = (formData.get("path") as string) || "/";
  
  if (!file) return { error: "No file provided" };
  
  // Check file size limit (GitHub has 100MB limit per file via API)
  if (file.size > 100 * 1024 * 1024) {
    return { error: "File size exceeds 100MB limit" };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.provider_token) {
    return { error: "Unauthorized" };
  }

  const github = new GitHubService(session.provider_token);

  try {
    // Lock/Read/Write pattern (Optimistic locking skipped for MVP)
    const metaFile = await github.getFile(ROOT_REPO, "metadata.json");
    if (!metaFile) throw new Error("Metadata not found");

    const metadata = JSON.parse(metaFile.content);
    
    // Initialize system metadata if not present
    if (!metadata.system) {
      metadata.system = {
        active_repo: `${STORAGE_REPO_PREFIX}-001`,
        repos: [`${STORAGE_REPO_PREFIX}-001`]
      };
    }
    
    // Check if we need to create a new storage repo
    let activeRepo = metadata.system.active_repo;
    const repoSize = await github.getRepoSize(activeRepo);
    
    if (repoSize > MAX_REPO_SIZE) {
      // Create a new storage repo
      const repoCount = metadata.system.repos.length + 1;
      const newRepoName = `${STORAGE_REPO_PREFIX}-${String(repoCount).padStart(3, '0')}`;
      
      await github.createRepo(newRepoName);
      
      metadata.system.repos.push(newRepoName);
      metadata.system.active_repo = newRepoName;
      activeRepo = newRepoName;
    }

    // 1. Ensure storage repo exists
    await github.createRepo(activeRepo);

    // 2. Upload Blob
    const buffer = Buffer.from(await file.arrayBuffer());
    // Use a unique name to avoid collision
    const blobName = `blobs/${Date.now()}-${file.name}`;
    
    await github.uploadFile(
        activeRepo, 
        blobName, 
        buffer, 
        `Upload ${file.name}`
    );
    
    const newFile: FileItem = {
        id: crypto.randomUUID(),
        name: file.name,
        type: "file",
        size: formatBytes(file.size),
        modified: new Date().toISOString(),
        path: path,
        repo: activeRepo,
        sha: blobName // Storing the path in the repo as the reference
    };

    metadata.files.push(newFile);

    await github.uploadFile(
        ROOT_REPO,
        "metadata.json",
        JSON.stringify(metadata, null, 2),
        `Add file ${file.name}`
    );

    return { success: true, file: newFile };

  } catch (error: any) {
    console.error("Upload error:", error);
    return { error: error.message };
  }
}

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}


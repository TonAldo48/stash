"use server";

import { createClient } from "@/lib/supabase/server";
import { GitHubService } from "@/lib/github";
import { FileItem } from "./files";

const ROOT_REPO = "gitdrive-root";
const STORAGE_REPO_PREFIX = "gitdrive-storage-001"; // Hardcoded for MVP

export async function uploadFile(formData: FormData) {
  const file = formData.get("file") as File;
  const path = (formData.get("path") as string) || "/";
  
  if (!file) return { error: "No file provided" };

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.provider_token) {
    return { error: "Unauthorized" };
  }

  const github = new GitHubService(session.provider_token);

  try {
    // 1. Ensure storage repo exists
    await github.createRepo(STORAGE_REPO_PREFIX);

    // 2. Upload Blob
    const buffer = Buffer.from(await file.arrayBuffer());
    // Use a unique name or keep original? For this plan: "Commits file blob... Updates metadata"
    // We'll store it in `blobs/<timestamp>-<filename>` to avoid collision
    const blobName = `blobs/${Date.now()}-${file.name}`;
    
    await github.uploadFile(
        STORAGE_REPO_PREFIX, 
        blobName, 
        buffer, 
        `Upload ${file.name}`
    );

    // 3. Update Metadata
    // Lock/Read/Write pattern (Optimistic locking skipped for MVP)
    const metaFile = await github.getFile(ROOT_REPO, "metadata.json");
    if (!metaFile) throw new Error("Metadata not found");

    const metadata = JSON.parse(metaFile.content);
    
    const newFile: FileItem = {
        id: crypto.randomUUID(),
        name: file.name,
        type: "file",
        size: formatBytes(file.size),
        modified: new Date().toISOString(), // Git doesn't give us this easily, use upload time
        path: path,
        repo: STORAGE_REPO_PREFIX,
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


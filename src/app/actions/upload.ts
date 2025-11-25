"use server";

import { createClient } from "@/lib/supabase/server";
import { GitHubService } from "@/lib/github";
import { FileItem } from "./files";
import { formatBytes } from "@/lib/utils";

const STORAGE_REPO_PREFIX = "gitdrive-storage";
const MAX_REPO_SIZE = 4 * 1024 * 1024 * 1024; // 4GB threshold before creating new repo

export async function uploadFile(formData: FormData) {
  const file = formData.get("file") as File;
  const path = (formData.get("path") as string) || "/";
  
  if (!file) return { error: "No file provided" };
  
  // Check file size limit (10MB strict limit for now)
  if (file.size > 10 * 1024 * 1024) {
    return { error: "File size exceeds 10MB limit" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.provider_token || !user) {
    return { error: "Unauthorized" };
  }

  const github = new GitHubService(session.provider_token);

  try {
    // 1. Find active storage repo
    let { data: activeRepoData, error: repoError } = await supabase
        .from('storage_repos')
        .select('*')
        .eq('is_active', true)
        .single();

    // If no active repo found (first time or error), handle initialization
    if (!activeRepoData) {
        // Check if any repos exist to determine name
        const { count } = await supabase
            .from('storage_repos')
            .select('*', { count: 'exact', head: true });
        
        const repoIndex = (count || 0) + 1;
        const newRepoName = `${STORAGE_REPO_PREFIX}-${String(repoIndex).padStart(3, '0')}`;
        
        // Create in GitHub
        await github.createRepo(newRepoName);
        
        // Create in DB
        const { data: newRepo, error: createError } = await supabase
            .from('storage_repos')
            .insert({
                user_id: user.id,
                repo_name: newRepoName,
                is_active: true,
                size_bytes: 0
            })
            .select()
            .single();
            
        if (createError) throw createError;
        activeRepoData = newRepo;
    }

    // 2. Check size limits (lazy check using GitHub API to be sure, or trust DB)
    // Trusting DB for speed, but could verify occasionally.
    // Let's check DB size + incoming file size
    if ((activeRepoData.size_bytes + file.size) > MAX_REPO_SIZE) {
        // Rotate repo
        // Deactivate current
        await supabase
            .from('storage_repos')
            .update({ is_active: false })
            .eq('id', activeRepoData.id);

        // Create new
        const { count } = await supabase
            .from('storage_repos')
            .select('*', { count: 'exact', head: true });

        const repoIndex = (count || 0) + 1;
        const newRepoName = `${STORAGE_REPO_PREFIX}-${String(repoIndex).padStart(3, '0')}`;
        
        await github.createRepo(newRepoName);
        
        const { data: newRepo, error: createError } = await supabase
            .from('storage_repos')
            .insert({
                user_id: user.id,
                repo_name: newRepoName,
                is_active: true,
                size_bytes: 0
            })
            .select()
            .single();

        if (createError) throw createError;
        activeRepoData = newRepo;
    }

    // 3. Upload Blob to GitHub
    const buffer = Buffer.from(await file.arrayBuffer());
    const blobName = `blobs/${Date.now()}-${file.name}`;
    
    await github.uploadFile(
        activeRepoData.repo_name, 
        blobName, 
        buffer, 
        `Upload ${file.name}`
    );
    
    // 4. Insert into Files table
    const { data: newFile, error: fileError } = await supabase
        .from('files')
        .insert({
            user_id: user.id,
            name: file.name,
            type: 'file',
            size_bytes: file.size,
            path: path,
            repo_name: activeRepoData.repo_name,
            blob_path: blobName
        })
        .select()
        .single();

    if (fileError) throw fileError;

    // 5. Update repo size
    await supabase
        .from('storage_repos')
        .update({ size_bytes: activeRepoData.size_bytes + file.size })
        .eq('id', activeRepoData.id);

    const fileItem: FileItem = {
        id: newFile.id,
        name: newFile.name,
        type: "file",
        size: formatBytes(newFile.size_bytes),
        modified: newFile.created_at,
        path: newFile.path,
        repo: newFile.repo_name,
        sha: newFile.blob_path
    };

    return { success: true, file: fileItem };

  } catch (error: any) {
    console.error("Upload error:", error);
    return { error: error.message };
  }
}

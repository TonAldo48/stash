"use server";

import { createClient } from "@/lib/supabase/server";
import { GitHubService } from "@/lib/github";

const ROOT_REPO = "gitdrive-root";

export async function initializeDrive() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.provider_token) {
    return { error: "No GitHub token found. Please sign in again." };
  }

  const github = new GitHubService(session.provider_token);

  try {
    // 1. Create Root Repo
    await github.createRepo(ROOT_REPO);

    // 2. Check/Create metadata.json
    const metadata = await github.getFile(ROOT_REPO, "metadata.json");
    if (!metadata) {
      const initialMetadata = {
        files: [],
        folders: [],
        version: 1,
      };
      await github.uploadFile(
        ROOT_REPO,
        "metadata.json",
        JSON.stringify(initialMetadata, null, 2),
        "Initialize GitDrive metadata"
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error("Failed to initialize drive:", error);
    return { error: error.message };
  }
}

export async function checkDriveStatus() {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.provider_token) return false;
    
    const github = new GitHubService(session.provider_token);
    try {
        // Just check if we can get metadata
        const file = await github.getFile(ROOT_REPO, "metadata.json");
        return !!file;
    } catch {
        return false;
    }
}


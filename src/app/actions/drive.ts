"use server";

import { createClient } from "@/lib/supabase/server";
import { GitHubService } from "@/lib/github";

const STORAGE_REPO_PREFIX = "stash-storage";

export async function initializeDrive() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.provider_token || !user) {
    return { error: "No GitHub token found. Please sign in again." };
  }

  const github = new GitHubService(session.provider_token);

  try {
    // Check if already initialized (has storage repo)
    const { data: existingRepo } = await supabase
        .from('storage_repos')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

    if (existingRepo) {
        return { success: true };
    }

    // Initialize first storage repo
    const firstRepoName = `${STORAGE_REPO_PREFIX}-001`;

    // 1. Create Repo in GitHub
    await github.createRepo(firstRepoName);

    // 2. Create Record in DB
    const { error } = await supabase
        .from('storage_repos')
        .insert({
            user_id: user.id,
            repo_name: firstRepoName,
            is_active: true,
            size_bytes: 0
        });

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Failed to initialize drive:", error);
    return { error: error.message };
  }
}

export async function checkDriveStatus() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) return false;
    
    try {
        // Check if user has any storage repos
        const { data, error } = await supabase
            .from('storage_repos')
            .select('id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        if (error) return false;
        return !!data;
    } catch {
        return false;
    }
}

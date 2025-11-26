"use server";

import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

export async function initChunkedUpload(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  targetPath: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();

  if (!user || !session?.provider_token) {
    return { error: "Unauthorized" };
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/uploads/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        target_path: targetPath,
        user_id: user.id,
        github_token: session.provider_token,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { error: `Failed to initialize upload: ${error}` };
    }

    const data = await response.json();
    return { success: true, ...data };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function getUploadStatus(uploadId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/uploads/${uploadId}/status?user_id=${user.id}`, {
      method: "GET",
    });

    if (!response.ok) {
      const error = await response.text();
      return { error: `Failed to get status: ${error}` };
    }

    const data = await response.json();
    return { success: true, ...data };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function finalizeChunkedUpload(uploadId: string, githubPath: string, fileSize: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();

  if (!user || !session?.provider_token) {
    return { error: "Unauthorized" };
  }

  try {
    // Get active storage repo
    const { data: activeRepo } = await supabase
      .from('storage_repos')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!activeRepo) {
      return { error: "No active storage repo" };
    }

    // Extract filename from path
    const filename = githubPath.split('/').pop() || "unknown";

    // Insert file record
    const { data: newFile, error: fileError } = await supabase
      .from('files')
      .insert({
        user_id: user.id,
        name: filename,
        type: 'file',
        size_bytes: fileSize,
        path: "/", // Would need to get from upload record
        repo_name: activeRepo.repo_name,
        blob_path: githubPath,
      })
      .select()
      .single();

    if (fileError) {
      return { error: `Failed to create file record: ${fileError.message}` };
    }

    // Update repo size
    await supabase
      .from('storage_repos')
      .update({ size_bytes: activeRepo.size_bytes + fileSize })
      .eq('id', activeRepo.id);

    return { success: true, file: newFile };
  } catch (error: any) {
    return { error: error.message };
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { upload_id, github_path, file_size, filename, target_path } = body;

    if (!upload_id || !github_path || !file_size) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get active storage repo
    const { data: activeRepo, error: repoError } = await supabase
      .from('storage_repos')
      .select('*')
      .eq('is_active', true)
      .single();

    if (repoError || !activeRepo) {
      return NextResponse.json({ error: "No active storage repo" }, { status: 500 });
    }

    // Extract filename from path if not provided
    const finalFilename = filename || github_path.split('/').pop() || "unknown";

    // Insert file record
    const { data: newFile, error: fileError } = await supabase
      .from('files')
      .insert({
        user_id: user.id,
        name: finalFilename,
        type: 'file',
        size_bytes: file_size,
        path: target_path || "/",
        repo_name: activeRepo.repo_name,
        blob_path: github_path,
      })
      .select()
      .single();

    if (fileError) {
      return NextResponse.json({ error: `Failed to create file record: ${fileError.message}` }, { status: 500 });
    }

    // Update repo size
    await supabase
      .from('storage_repos')
      .update({ size_bytes: activeRepo.size_bytes + file_size })
      .eq('id', activeRepo.id);

    return NextResponse.json({ success: true, file: newFile, file_id: newFile.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

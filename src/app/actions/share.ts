"use server";

import { createClient } from "@/lib/supabase/server";
import { FileItem } from "./files";
import { GitHubService } from "@/lib/github";
import { formatBytes } from "@/lib/utils";

export interface ShareSettings {
  fileId: string;
  isPublic: boolean;
  emails: string[];
}

export interface ShareInfo {
    id: string;
    file_id: string;
    token: string;
    is_public: boolean;
    created_at: string;
    emails?: string[];
}

export async function createShare(settings: ShareSettings) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Unauthorized" };

  try {
    const { data: share, error: shareError } = await supabase
        .from('shares')
        .upsert({
            file_id: settings.fileId,
            user_id: user.id,
            is_public: settings.isPublic,
        }, { onConflict: 'file_id' })
        .select()
        .single();

    if (shareError) throw shareError;
    
    if (settings.emails.length > 0) {
        const { error: deleteError } = await supabase
            .from('share_recipients')
            .delete()
            .eq('share_id', share.id);
            
        if (deleteError) throw deleteError;

        const recipients = settings.emails.map(email => ({
            share_id: share.id,
            email: email.trim()
        }));

        const { error: recipientError } = await supabase
            .from('share_recipients')
            .insert(recipients);
            
        if (recipientError) throw recipientError;
    } else {
         const { error: deleteError } = await supabase
            .from('share_recipients')
            .delete()
            .eq('share_id', share.id);
         if (deleteError) throw deleteError;
    }

    return { success: true, share };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function getShareSettings(fileId: string) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "Unauthorized" };

    try {
        const { data: share, error } = await supabase
            .from('shares')
            .select(`
                *,
                share_recipients (email)
            `)
            .eq('file_id', fileId)
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!share) return { share: null };

        return {
            share: {
                ...share,
                emails: share.share_recipients?.map((r: any) => r.email) || []
            }
        };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function deleteShare(fileId: string) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "Unauthorized" };

    try {
        const { error } = await supabase
            .from('shares')
            .delete()
            .eq('file_id', fileId)
            .eq('user_id', user.id);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function getSharedFile(token: string) {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('get_shared_file_metadata', {
        lookup_token: token
    });

    if (error) {
        return { error: error.message };
    }

    if (!data || data.error) {
        return { error: data?.error || "Access denied" };
    }

    return { 
        file: data.file,
        share: data.share
    };
}

export async function listSharedFolderFiles(token: string, folderPath?: string) {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('list_shared_folder_contents', {
        lookup_token: token,
        folder_path: folderPath || ''
    });

    if (error) {
        return { error: error.message };
    }

    if (!data || data.error) {
        return { error: data?.error || "Access denied" };
    }

    return { files: data.files || [] };
}

export async function downloadSharedFile(token: string, targetFilePath?: string) {
    const supabase = await createClient();
    let fileToDownload: any = null;
    let shareInfo: any = null;

    // 1. Resolve Share & File Metadata
    if (targetFilePath) {
         // It's a child file download attempt
         // Parse path and name from targetFilePath (it's "path/name" usually, but here `targetFilePath` IS the full path including name?)
         // No, `files` table has `path` and `name`. `targetFilePath` is likely the `path` + `/` + `name` passed from UI.
         // UI passes: `child.path + '/' + child.name`.
         
         const lastSlashIndex = targetFilePath.lastIndexOf('/');
         const path = lastSlashIndex === -1 ? '/' : (lastSlashIndex === 0 ? '/' : targetFilePath.substring(0, lastSlashIndex));
         const name = targetFilePath.substring(lastSlashIndex + 1);
         
         const { data, error } = await supabase.rpc('get_shared_child_file', {
             lookup_token: token,
             target_path: path,
             target_name: name
         });
         
         if (error || !data || data.error) {
             return { error: data?.error || error?.message || "File not found" };
         }
         fileToDownload = data.file;
    } else {
        // Root file download
        const { data, error } = await supabase.rpc('get_shared_file_metadata', {
            lookup_token: token
        });
        
        if (error || !data || data.error) {
             return { error: data?.error || error?.message || "Access denied" };
        }
        fileToDownload = data.file;
        shareInfo = data.share;
    }

    if (!fileToDownload || fileToDownload.type !== 'file') {
        return { error: "Not a file" };
    }
    
    // 2. Download from GitHub
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

    // Fallback to old system token if App credentials not found (legacy support)
    const systemToken = process.env.GITHUB_TOKEN; 
    
    let github: GitHubService;

    if (appId && privateKey && installationId) {
        // Use GitHub App
        // Private key usually comes in with \n literals from .env, need to fix if necessary
        // But .env loaders often handle it. If not, `replace(/\\n/g, '\n')`
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        github = new GitHubService(appId, formattedKey, installationId);
    } else if (systemToken) {
        // Use Legacy PAT
        github = new GitHubService(systemToken);
    } else {
         return { error: "System download not configured. Please contact administrator." };
    }

    try {
        const fileData = await github.getFileRaw(fileToDownload.repo_name, fileToDownload.blob_path);
        
        if (!fileData) {
            return { error: "File content not found" };
        }

        return { 
            success: true, 
            content: fileData.content.toString("base64"),
            name: fileToDownload.name,
            size: formatBytes(fileToDownload.size_bytes)
        };
    } catch (error: any) {
        return { error: "Failed to fetch from storage: " + error.message };
    }
}

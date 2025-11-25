import { getSharedFile, listSharedFolderFiles } from "@/app/actions/share";
import { SharedView } from "./shared-view";

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>, searchParams: Promise<{ path?: string }> }) {
    const { token } = await params;
    const { path } = await searchParams;
    
    const { file, share, error } = await getSharedFile(token);

    if (error || !file || !share) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <div className="text-center space-y-4">
                    <h1 className="text-2xl font-bold">Access Denied</h1>
                    <p className="text-muted-foreground max-w-md mx-auto">{error || "This shared link is invalid or you don't have permission."}</p>
                </div>
            </div>
        );
    }

    let children: any[] = [];
    if (file.type === 'folder') {
        const currentPath = path || ""; 
        const res = await listSharedFolderFiles(token, currentPath);
        if (res.files) {
             children = res.files.map((f: any) => ({
                id: f.id,
                name: f.name,
                type: f.type,
                size: f.type === 'folder' ? '-' : (f.size_bytes ? (f.size_bytes / 1024).toFixed(2) + " KB" : "0 KB"),
                modified: f.created_at,
                path: f.path,
                repo: f.repo_name,
                sha: f.blob_path
             }));
        }
    } else {
        file.size = (file.size_bytes ? (file.size_bytes / 1024).toFixed(2) + " KB" : "0 KB");
    }

    return (
        <div className="min-h-screen bg-background">
             <SharedView 
                file={file as any} 
                share={share} 
                childrenFiles={children} 
                currentPath={path || ""} 
                token={token} 
            />
        </div>
    );
}


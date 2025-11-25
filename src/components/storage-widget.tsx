"use client"

import { Cloud, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { getStorageStats } from "@/app/actions/files"

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function StorageWidget() {
    const [stats, setStats] = useState<{ used: number; fileCount: number; folderCount: number; repos: number } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    // Max storage: 5GB per repo, start with 1 repo
    const maxStorage = 5 * 1024 * 1024 * 1024; // 5GB in bytes

    useEffect(() => {
        getStorageStats().then(res => {
            if (res.success) {
                setStats({
                    used: res.used ?? 0,
                    fileCount: res.fileCount ?? 0,
                    folderCount: res.folderCount ?? 0,
                    repos: res.repos ?? 1
                });
            }
            setIsLoading(false);
        });
    }, []);

    const usedPercentage = stats ? Math.min((stats.used / maxStorage) * 100, 100) : 0;

    return (
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
                <Cloud className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Storage</h4>
            </div>
            {isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                </div>
            ) : (
                <>
                    <div className="text-xs text-muted-foreground mb-2">
                        {formatBytes(stats?.used ?? 0)} used of {formatBytes(maxStorage)}
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-primary transition-all duration-300" 
                            style={{ width: `${Math.max(usedPercentage, 1)}%` }} 
                        />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                        {stats?.fileCount ?? 0} files · {stats?.folderCount ?? 0} folders
                    </div>
                </>
            )}
        </div>
    );
}


"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createShare, getShareSettings } from "@/app/actions/share";
import { FileItem } from "@/app/actions/files";
import { Copy, Globe, Lock, Mail, Loader2, Link as LinkIcon } from "lucide-react";

interface ShareDialogProps {
    file: FileItem | null;
    isOpen: boolean;
    onClose: () => void;
}

export function ShareDialog({ file, isOpen, onClose }: ShareDialogProps) {
    const [isPublic, setIsPublic] = useState(false);
    const [emails, setEmails] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [shareLink, setShareLink] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && file) {
            setIsLoading(true);
            getShareSettings(file.id).then((res) => {
                if (res.share) {
                    setIsPublic(res.share.is_public);
                    setEmails((res.share.emails || []).join(", "));
                    // Construct link
                    const protocol = window.location.protocol;
                    const host = window.location.host;
                    setShareLink(`${protocol}//${host}/share/${res.share.token}`);
                } else {
                    setIsPublic(false);
                    setEmails("");
                    setShareLink(null);
                }
                setIsLoading(false);
            });
        }
    }, [isOpen, file]);

    const handleSave = async () => {
        if (!file) return;
        setIsSaving(true);

        const emailList = emails.split(",").map(e => e.trim()).filter(e => e);
        
        const result = await createShare({
            fileId: file.id,
            isPublic,
            emails: emailList
        });

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success("Share settings updated");
            // Update link if it was just created
            if (result.share && !shareLink) {
                const protocol = window.location.protocol;
                const host = window.location.host;
                setShareLink(`${protocol}//${host}/share/${result.share.token}`);
            }
        }
        setIsSaving(false);
    };

    const copyLink = () => {
        if (shareLink) {
            navigator.clipboard.writeText(shareLink);
            toast.success("Link copied to clipboard");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md max-w-[calc(100%-2rem)]">
                <DialogHeader>
                    <DialogTitle className="text-base sm:text-lg truncate pr-6">Share &quot;{file?.name}&quot;</DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm">
                        Manage access to this {file?.type}.
                    </DialogDescription>
                </DialogHeader>
                
                {isLoading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="grid gap-4 sm:gap-6 py-2 sm:py-4">
                        <div className="flex items-center justify-between gap-2 sm:space-x-2 rounded-md border p-3 sm:p-4">
                            <div className="flex items-center gap-2 sm:space-x-4 min-w-0">
                                {isPublic ? <Globe className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 shrink-0" /> : <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />}
                                <div className="flex-1 space-y-0.5 sm:space-y-1 min-w-0">
                                    <p className="text-xs sm:text-sm font-medium leading-none">
                                        Public Access
                                    </p>
                                    <p className="text-[10px] sm:text-sm text-muted-foreground">
                                        {isPublic ? "Anyone with the link can view" : "Only invited people can view"}
                                    </p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 shrink-0"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="emails" className="flex items-center gap-2 text-xs sm:text-sm">
                                <Mail className="h-4 w-4" /> Invited People
                            </Label>
                            <Input
                                id="emails"
                                placeholder="email@example.com, another@example.com"
                                value={emails}
                                onChange={(e) => setEmails(e.target.value)}
                                disabled={false}
                                className="text-sm"
                            />
                            <p className="text-[10px] sm:text-xs text-muted-foreground">
                                Separate multiple emails with commas.
                            </p>
                        </div>

                        {shareLink && (
                            <div className="grid gap-2">
                                <Label className="flex items-center gap-2 text-xs sm:text-sm">
                                    <LinkIcon className="h-4 w-4" /> Share Link
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={shareLink}
                                        className="flex-1 bg-muted text-xs sm:text-sm"
                                    />
                                    <Button size="icon" variant="outline" onClick={copyLink} className="shrink-0">
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} className="w-full sm:w-auto text-sm">Close</Button>
                    <Button onClick={handleSave} disabled={isLoading || isSaving} className="w-full sm:w-auto text-sm">
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


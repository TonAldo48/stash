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
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Share "{file?.name}"</DialogTitle>
                    <DialogDescription>
                        Manage access to this {file?.type}.
                    </DialogDescription>
                </DialogHeader>
                
                {isLoading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="grid gap-6 py-4">
                        <div className="flex items-center justify-between space-x-2 rounded-md border p-4">
                            <div className="flex items-center space-x-4">
                                {isPublic ? <Globe className="h-5 w-5 text-blue-500" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
                                <div className="flex-1 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                        Public Access
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {isPublic ? "Anyone with the link can view" : "Only invited people can view"}
                                    </p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="emails" className="flex items-center gap-2">
                                <Mail className="h-4 w-4" /> Invited People
                            </Label>
                            <Input
                                id="emails"
                                placeholder="email@example.com, another@example.com"
                                value={emails}
                                onChange={(e) => setEmails(e.target.value)}
                                disabled={false} // Always allow inviting, even if public? Yes.
                            />
                            <p className="text-xs text-muted-foreground">
                                Separate multiple emails with commas.
                            </p>
                        </div>

                        {shareLink && (
                            <div className="grid gap-2">
                                <Label className="flex items-center gap-2">
                                    <LinkIcon className="h-4 w-4" /> Share Link
                                </Label>
                                <div className="flex items-center space-x-2">
                                    <Input
                                        readOnly
                                        value={shareLink}
                                        className="flex-1 bg-muted"
                                    />
                                    <Button size="icon" variant="outline" onClick={copyLink}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button onClick={handleSave} disabled={isLoading || isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


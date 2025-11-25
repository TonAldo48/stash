"use client";

import { useState } from "react";
import { initializeDrive } from "@/app/actions/drive";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, HardDrive } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DriveOnboarding() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleInitialize = async () => {
    setIsLoading(true);
    try {
      const result = await initializeDrive();
      if (result.error) {
        alert(`Error: ${result.error}`);
      } else {
        router.refresh(); // Reload to re-check status in layout
      }
    } catch (error) {
      alert("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[80vh] w-full items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <HardDrive className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Welcome to Stash</CardTitle>
          <CardDescription>
            To get started, we need to create a private repository in your GitHub account to store your files and metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
            <p>We will create:</p>
            <ul className="ml-4 mt-2 list-disc">
              <li><strong>stash-storage-001</strong>: For storing your files</li>
            </ul>
          </div>
          <Button onClick={handleInitialize} disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting up Storage...
              </>
            ) : (
              "Initialize Storage"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


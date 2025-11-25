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
    <div className="flex min-h-[60vh] sm:h-[80vh] w-full items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center p-4 sm:p-6">
          <div className="mx-auto mb-3 sm:mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-primary/10">
            <HardDrive className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <CardTitle className="text-lg sm:text-xl">Welcome to Stash</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            To get started, we need to create a private repository in your GitHub account to store your files and metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:gap-4 p-4 sm:p-6 pt-0">
          <div className="rounded-lg border bg-muted/50 p-3 sm:p-4 text-xs sm:text-sm text-muted-foreground">
            <p>We will create:</p>
            <ul className="ml-4 mt-2 list-disc">
              <li><strong>stash-storage-001</strong>: For storing your files</li>
            </ul>
          </div>
          <Button onClick={handleInitialize} disabled={isLoading} className="w-full h-10 sm:h-11">
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


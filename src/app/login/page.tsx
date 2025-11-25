"use client";

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Github, Package2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { ModeToggle } from "@/components/mode-toggle"

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient()
    
    // Use window.location.origin to ensure the callback URL matches the current domain
    // This works for both localhost and deployed environments
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'repo', // Request access to private repositories
      },
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 px-4 py-8 relative">
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
        <ModeToggle />
      </div>
      <div className="mb-6 sm:mb-8 flex flex-col items-center space-y-3 sm:space-y-4">
        <Package2 className="h-10 w-10 sm:h-12 sm:w-12" />
        <h1 className="text-xl sm:text-2xl font-light tracking-tight text-foreground text-center">Log in to Stash</h1>
      </div>

      <Card className="w-full max-w-sm border-border shadow-sm bg-card">
        <CardContent className="grid gap-4 p-4 sm:pt-6 sm:p-6">
          <Button onClick={handleLogin} className="w-full bg-[#24292f] hover:bg-[#24292f]/90 text-white font-medium h-10 sm:h-11 shadow-sm text-sm sm:text-base">
            <Github className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Log in with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}


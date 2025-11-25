"use client";

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Github, Package2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { ModeToggle } from "@/components/mode-toggle"

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: 'repo', // Request access to private repositories
      },
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 p-4 relative">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="mb-8 flex flex-col items-center space-y-4">
        <Package2 className="h-12 w-12" />
        <h1 className="text-2xl font-light tracking-tight text-foreground">Log in to Stash</h1>
      </div>

      <Card className="w-full max-w-sm border-border shadow-sm bg-card">
        <CardContent className="grid gap-4 pt-6">
          <Button onClick={handleLogin} className="w-full bg-[#24292f] hover:bg-[#24292f]/90 text-white font-medium h-11 shadow-sm">
            <Github className="mr-2 h-5 w-5" />
            Log in with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}


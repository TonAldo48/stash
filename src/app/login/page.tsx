"use client";

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Github } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 p-4">
      <div className="mb-8 flex flex-col items-center space-y-4">
        <Github className="h-12 w-12" />
        <h1 className="text-2xl font-light tracking-tight text-foreground">Sign in to GitDrive</h1>
      </div>

      <Card className="w-full max-w-sm border-border shadow-sm bg-card">
        <CardHeader className="space-y-1 bg-secondary/30 border-b border-border pb-4">
          <CardTitle className="text-base font-normal text-center">Sign in to continue</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6">
          <Button onClick={handleLogin} className="w-full bg-[#24292f] hover:bg-[#24292f]/90 text-white font-medium h-11 shadow-sm">
            <Github className="mr-2 h-5 w-5" />
            Sign in with GitHub
          </Button>
        </CardContent>
      </Card>

      <div className="mt-16 flex gap-4 text-xs text-muted-foreground">
        <Link href="#" className="hover:text-primary hover:underline">Terms</Link>
        <Link href="#" className="hover:text-primary hover:underline">Privacy</Link>
        <Link href="#" className="hover:text-primary hover:underline">Security</Link>
        <Link href="#" className="hover:text-primary hover:underline">Contact</Link>
      </div>
    </div>
  )
}


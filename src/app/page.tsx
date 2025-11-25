import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-4 lg:px-6 h-16 flex items-center border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Link className="flex items-center justify-center" href="#">
          <Github className="h-6 w-6 mr-2" />
          <span className="font-bold">GitDrive</span>
        </Link>
         <div className="ml-auto flex items-center gap-2">
             <ModeToggle />
             <Link className="text-sm font-medium hover:underline underline-offset-4 mr-2" href="/login">
                Sign In
              </Link>
             <Button asChild variant="outline" size="sm">
                <Link href="/login">Sign Up</Link>
             </Button>
         </div>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-secondary/30">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  Cloud Storage for Developers
                </h1>
                <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                  Secure, versioned, and open-source. Built on top of Git and GitHub.
                  Unlimited private repositories as your hard drive.
                </p>
              </div>
              <div className="space-x-4">
                <Button asChild className="h-11 px-8 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Link href="/login">
                    Get Started <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" className="h-11 px-8 rounded-md bg-background hover:bg-accent">
                  <Link href="https://github.com" target="_blank">
                    View on GitHub
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t border-border">
        <p className="text-xs text-muted-foreground">© 2024 GitDrive Inc. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="#">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="#">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}

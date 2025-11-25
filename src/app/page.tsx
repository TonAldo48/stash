import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Github, Package2 } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden">
      <div 
        className="absolute inset-0 z-0" 
        style={{
          backgroundImage: "url('/bg.jpeg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 bg-background/60" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <header className="px-4 lg:px-6 h-16 flex items-center border-b border-border bg-background/40 backdrop-blur-md">
          <Link className="flex items-center justify-center" href="#">
            <Package2 className="h-6 w-6 mr-2" />
            <span className="font-bold">Stash</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <Button asChild variant="outline" size="sm">
              <Link href="/login">
                <Github className="mr-2 h-4 w-4" />
                Log in with GitHub
              </Link>
            </Button>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center">
          <section className="w-full py-12 md:py-24">
            <div className="container px-4 md:px-6 mx-auto">
              <div className="flex flex-col items-center space-y-4 text-center">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                    Turn GitHub into your Personal Cloud
                  </h1>
                  <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                    Leverage unlimited private repositories for secure, versioned storage. 
                    The open-source drive built for developers.
                  </p>
                </div>
                <div className="space-x-4">
                  <Button asChild className="h-11 px-8 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Link href="/login">
                      Get Started <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-11 px-8 rounded-md bg-background hover:bg-accent">
                    <Link href="https://github.com/TonAldo48/stash" target="_blank">
                      View on GitHub
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>
        <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t border-border bg-background/40 backdrop-blur-md">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Stash. Built on GitHub.</p>
        </footer>
      </div>
    </div>
  );
}

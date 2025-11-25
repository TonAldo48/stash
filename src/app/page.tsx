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
        <header className="px-3 sm:px-4 lg:px-6 h-14 sm:h-16 flex items-center border-b border-border bg-background/40 backdrop-blur-md">
          <Link className="flex items-center justify-center" href="#">
            <Package2 className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />
            <span className="font-bold text-sm sm:text-base">Stash</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">
                <Github className="mr-2 h-4 w-4" />
                Log in with GitHub
              </Link>
            </Button>
            {/* Mobile login button - icon only */}
            <Button asChild variant="outline" size="icon" className="sm:hidden h-9 w-9">
              <Link href="/login">
                <Github className="h-4 w-4" />
                <span className="sr-only">Log in with GitHub</span>
              </Link>
            </Button>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <section className="w-full py-8 sm:py-12 md:py-24">
            <div className="container px-0 sm:px-4 md:px-6 mx-auto">
              <div className="flex flex-col items-center space-y-4 sm:space-y-6 text-center">
                <div className="space-y-3 sm:space-y-4">
                  <h1 className="text-2xl font-bold tracking-tighter sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl/none">
                    Turn GitHub into your Personal Cloud
                  </h1>
                  <p className="mx-auto max-w-[700px] text-sm sm:text-base text-muted-foreground md:text-xl">
                    Leverage unlimited private repositories for secure, versioned storage. 
                    The open-source drive built for developers.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
                  <Button asChild className="h-11 px-6 sm:px-8 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto">
                    <Link href="/login">
                      Get Started <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-11 px-6 sm:px-8 rounded-md bg-background hover:bg-accent w-full sm:w-auto">
                    <Link href="https://github.com/TonAldo48/stash" target="_blank" className="flex items-center justify-center">
                      <Github className="mr-2 h-4 w-4" />
                      View on GitHub
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>
        <footer className="flex flex-col gap-2 sm:flex-row py-4 sm:py-6 w-full shrink-0 items-center px-4 md:px-6 border-t border-border bg-background/40 backdrop-blur-md">
          <p className="text-xs text-muted-foreground text-center sm:text-left">© {new Date().getFullYear()} Stash. Built on GitHub.</p>
        </footer>
      </div>
    </div>
  );
}

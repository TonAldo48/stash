import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/server"

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Settings</h3>
        <p className="text-sm text-muted-foreground">
          View your profile and account information.
        </p>
      </div>
      <Separator />
      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="-mx-4 lg:mx-0 lg:w-1/5">
          <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 px-4 lg:px-0">
            <Button variant="secondary" className="w-full justify-start font-semibold">Profile</Button>
          </nav>
        </aside>
        <div className="flex-1 lg:max-w-2xl">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium">Profile</h3>
              <p className="text-sm text-muted-foreground">
                Your profile information from GitHub.
              </p>
            </div>
            <Separator />
            <form className="space-y-8">
                <div className="grid gap-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" value={user.user_metadata.full_name || ""} readOnly disabled className="bg-muted" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" value={user.user_metadata.user_name || ""} readOnly disabled className="bg-muted" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={user.email || ""} readOnly disabled className="bg-muted" />
                </div>
                 <div className="grid gap-2">
                    <Label>Avatar</Label>
                    <div className="flex items-center gap-4">
                        <img 
                            src={user.user_metadata.avatar_url} 
                            alt="Avatar" 
                            className="h-16 w-16 rounded-full border"
                        />
                        <p className="text-sm text-muted-foreground">
                            Managed by GitHub
                        </p>
                    </div>
                </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

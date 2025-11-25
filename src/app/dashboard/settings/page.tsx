import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/server"

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-medium">Settings</h3>
        <p className="text-xs sm:text-sm text-muted-foreground">
          View your profile and account information.
        </p>
      </div>
      <Separator />
      <div className="w-full max-w-2xl mx-auto">
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h3 className="text-base sm:text-lg font-medium">Profile</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Your profile information from GitHub.
              </p>
            </div>
            <Separator />
            <form className="space-y-4 sm:space-y-6">
                <div className="grid gap-2">
                    <Label htmlFor="name" className="text-sm">Full Name</Label>
                    <Input id="name" value={user.user_metadata.full_name || ""} readOnly disabled className="bg-muted text-sm" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="username" className="text-sm">Username</Label>
                    <Input id="username" value={user.user_metadata.user_name || ""} readOnly disabled className="bg-muted text-sm" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="email" className="text-sm">Email</Label>
                    <Input id="email" value={user.email || ""} readOnly disabled className="bg-muted text-sm" />
                </div>
                 <div className="grid gap-2">
                    <Label className="text-sm">Avatar</Label>
                    <div className="flex items-center gap-3 sm:gap-4">
                        <img 
                            src={user.user_metadata.avatar_url} 
                            alt="Avatar" 
                            className="h-12 w-12 sm:h-16 sm:w-16 rounded-full border"
                        />
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Managed by GitHub
                        </p>
                    </div>
                </div>
            </form>
          </div>
        </div>
    </div>
  )
}

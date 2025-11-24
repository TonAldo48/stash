import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Settings</h3>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and set e-mail preferences.
        </p>
      </div>
      <Separator />
      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="-mx-4 lg:mx-0 lg:w-1/5">
          <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 px-4 lg:px-0">
            <Button variant="secondary" className="w-full justify-start font-semibold">Profile</Button>
            <Button variant="ghost" className="w-full justify-start">Account</Button>
            <Button variant="ghost" className="w-full justify-start">Appearance</Button>
            <Button variant="ghost" className="w-full justify-start">Notifications</Button>
            <Button variant="ghost" className="w-full justify-start">Display</Button>
          </nav>
        </aside>
        <div className="flex-1 lg:max-w-2xl">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium">Profile</h3>
              <p className="text-sm text-muted-foreground">
                This is how others will see you on the site.
              </p>
            </div>
            <Separator />
            <form className="space-y-8">
                <div className="grid gap-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" defaultValue="johndoe" />
                    <p className="text-[0.8rem] text-muted-foreground">
                        This is your public display name.
                    </p>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" defaultValue="john@example.com" />
                </div>
                 <div className="grid gap-2">
                    <Label htmlFor="bio">Bio</Label>
                    <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        id="bio"
                        defaultValue="I'm a software engineer based in San Francisco."
                    />
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="public" defaultChecked />
                    <Label htmlFor="public">Make my profile public</Label>
                </div>
                <Button type="button">Update profile</Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}


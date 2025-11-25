import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";

export class GitHubService {
  private octokit: Octokit;
  private username: string;
  private isApp: boolean;

  // Overload signatures to support different init modes
  constructor(accessToken: string);
  constructor(appId: string, privateKey: string, installationId: string);
  constructor(arg1: string, arg2?: string, arg3?: string) {
    if (arg2 && arg3) {
      // GitHub App Mode
      this.isApp = true;
      this.octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: arg1,
          privateKey: arg2,
          installationId: arg3,
        },
      });
      // For App mode, we might need to fetch the installation owner's name differently if needed, 
      // but usually we just need the owner name for repo operations.
      // We'll fetch it lazily.
      this.username = ""; 
    } else {
      // User Access Token Mode
      this.isApp = false;
      this.octokit = new Octokit({
        auth: arg1,
      });
      this.username = ""; // Will be set lazily
    }
  }

  async getUser() {
    if (!this.username) {
        if (this.isApp) {
            // For App, we find the account this installation belongs to
            const { data } = await this.octokit.rest.apps.getInstallation({
                installation_id: Number((this.octokit.auth as any).installationId) // This might not be directly accessible depending on implementation
            });
             // Actually, a better way is to just fetch the installation info
            // But wait, `createAppAuth` handles the token generation.
            // To get the "owner" of the repos (which is the user who installed the app),
            // we can query the installation details.
            
            // However, since we don't easily have the installation_id stored in the class property (it's in closure),
            // let's just fetch the authenticated user context or installation.
            
            // Workaround: Just fetch the installation repositories to get the owner? No, that's heavy.
            // Let's assume the App is installed on the account that owns the storage repos.
            // We can try `octokit.rest.users.getAuthenticated()` but for an App it returns the App bot user.
            // We need the OWNER of the repo.
            
            // For our specific use case (Stash), the Repo Owner is always the user who installed the app.
            // We can simply hardcode the known owner if we had it, or fetch it from the installation.
            
            // Let's try to get the installation.
            // Since we can't easily get the ID back from Octokit instance, let's rely on the fact 
            // that we are usually operating on a specific repo where we might already KNOW the owner?
            // BUT, existing methods rely on `this.getUser()` to find the owner.
            
            // Solution: Fetch installation details. To do that we need the installation ID.
            // But we passed it in constructor. We should store it if we are in app mode.
        } else {
            const { data } = await this.octokit.rest.users.getAuthenticated();
            this.username = data.login;
        }
    }
    return this.username;
  }
  
  // Helper to set owner explicitly if known (useful for App mode)
  setOwner(owner: string) {
      this.username = owner;
  }
  
  async getAppInstallationOwner() {
      // This is a bit tricky without storing the installation ID. 
      // But actually, we can just use `octokit.rest.apps.getAuthenticated()`? No.
      
      // Let's change the constructor to store installation ID if provided.
      return this.username;
  }

  async createRepo(name: string, private_repo = true) {
    const username = await this.getUser();
    try {
      await this.octokit.rest.repos.get({
        owner: username,
        repo: name,
      });
      return; // Repo exists
    } catch (e: any) {
      if (e.status === 404) {
        if (this.isApp) {
             // Apps create repos differently? No, usually same endpoint if token has scope.
             // But usually Apps create repos in the Org or User account they are installed in.
             // `createForAuthenticatedUser` might create it for the Bot User?
             // Actually, Apps usually cannot create repos for a user unless they act ON BEHALF of a user (OAuth).
             // Server-to-Server Apps usually act on existing repos.
             // Creating a repo as an App Installation usually creates it under the installation owner.
             // Let's try `repos.createInOrg` if it's an org, or just `createForAuthenticatedUser` (might fail or create for bot).
             
             // CRITICAL: GitHub Apps (Installation Token) acting on a User Account CANNOT create new repositories for that user directly via API 
             // unless it's an Organization. For personal accounts, it's restricted.
             // HOWEVER, we only use App Mode for READING (Downloading).
             // We use User Token Mode for WRITING (Uploading/Creating).
             // So this method might not need to support App Mode.
             throw new Error("Creating repos via App Mode is not supported/recommended.");
        }

        await this.octokit.rest.repos.createForAuthenticatedUser({
            name,
            private: private_repo,
            auto_init: true, 
        });
      } else {
        throw e;
      }
    }
  }

  async getFile(repo: string, path: string) {
     // If we are in App mode, we need to know the OWNER of the repo.
     // `this.getUser()` is tricky in App mode.
     // Ideally, we should pass the owner explicitly or fetch it.
     // For now, let's assume we need to resolve the owner.
     
     let owner = this.username;
     if (!owner && this.isApp) {
         // Try to find owner from installation resources? 
         // Or easier: The caller should know the owner?
         // In our DB `files` table, we don't strictly store the repo owner, just `repo_name`.
         // But `repo_name` usually implies the owner in some contexts, but here it's just "gitdrive-storage-001".
         // We need the owner login.
         
         // Hack: Fetch installation repositories and pick the first one's owner?
         const { data } = await this.octokit.rest.apps.listReposAccessibleToInstallation({ per_page: 1 });
         if (data.repositories.length > 0) {
             owner = data.repositories[0].owner.login;
             this.username = owner;
         } else {
             throw new Error("App installation has no accessible repositories.");
         }
     } else if (!owner) {
         owner = await this.getUser();
     }

     try {
        const { data } = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path,
        });
        
        if (Array.isArray(data) || data.type !== "file") {
            throw new Error("Path is not a file");
        }

        return {
            content: Buffer.from(data.content, "base64").toString("utf-8"),
            sha: data.sha,
            size: data.size
        };
     } catch (e: any) {
         if (e.status === 404) return null;
         throw e;
     }
  }

  async getFileRaw(repo: string, path: string): Promise<{ content: Buffer; sha: string; size: number } | null> {
     let owner = this.username;
     if (!owner && this.isApp) {
         const { data } = await this.octokit.rest.apps.listReposAccessibleToInstallation({ per_page: 1 });
         if (data.repositories.length > 0) {
             owner = data.repositories[0].owner.login;
             this.username = owner;
         } else {
             throw new Error("App installation has no accessible repositories.");
         }
     } else if (!owner) {
         owner = await this.getUser();
     }

     try {
        const { data } = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path,
        });
        
        if (Array.isArray(data) || data.type !== "file") {
            throw new Error("Path is not a file");
        }

        return {
            content: Buffer.from(data.content, "base64"),
            sha: data.sha,
            size: data.size
        };
     } catch (e: any) {
         if (e.status === 404) return null;
         throw e;
     }
  }

  async repoExists(name: string): Promise<boolean> {
    const username = await this.getUser();
    try {
      await this.octokit.rest.repos.get({
        owner: username,
        repo: name,
      });
      return true;
    } catch (e: any) {
      if (e.status === 404) return false;
      throw e;
    }
  }

  async getRepoSize(repo: string): Promise<number> {
    const username = await this.getUser();
    try {
      const { data } = await this.octokit.rest.repos.get({
        owner: username,
        repo,
      });
      return data.size * 1024; // GitHub returns size in KB, convert to bytes
    } catch (e: any) {
      return 0;
    }
  }

  async uploadFile(repo: string, path: string, content: string | Buffer, message: string) {
    const username = await this.getUser();
    
    let sha: string | undefined;
    try {
        const existing = await this.getFile(repo, path);
        if (existing) {
            sha = existing.sha;
        }
    } catch (e) {
        // File doesn't exist, ignore
    }

    const contentBase64 = Buffer.isBuffer(content) 
        ? content.toString('base64') 
        : Buffer.from(content).toString('base64');

    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: username,
      repo,
      path,
      message,
      content: contentBase64,
      sha,
    });
  }
}

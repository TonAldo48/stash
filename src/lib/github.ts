import { Octokit } from "octokit";

export class GitHubService {
  private octokit: Octokit;
  private username: string;

  constructor(accessToken: string) {
    this.octokit = new Octokit({
      auth: accessToken,
    });
    this.username = ""; // Will be set lazily or passed in
  }

  async getUser() {
    if (!this.username) {
        const { data } = await this.octokit.rest.users.getAuthenticated();
        this.username = data.login;
    }
    return this.username;
  }

  async createRepo(name: string, private_repo = true) {
    // Check if repo exists first to avoid errors
    const username = await this.getUser();
    try {
      await this.octokit.rest.repos.get({
        owner: username,
        repo: name,
      });
      return; // Repo exists
    } catch (e: any) {
      if (e.status === 404) {
        await this.octokit.rest.repos.createForAuthenticatedUser({
            name,
            private: private_repo,
            auto_init: true, // Initialize with README to allow immediate commits
        });
      } else {
        throw e;
      }
    }
  }

  async getFile(repo: string, path: string) {
     const username = await this.getUser();
     try {
        const { data } = await this.octokit.rest.repos.getContent({
            owner: username,
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
     const username = await this.getUser();
     try {
        const { data } = await this.octokit.rest.repos.getContent({
            owner: username,
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
    
    // Check for existing file to get SHA for update
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


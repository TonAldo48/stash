<!-- 37f39fb6-ebbb-404a-b493-fbd22fc5af1c 3f936c66-c0d1-44de-85b3-6cb5f8e5c660 -->
# GitDrive Backend Implementation Plan

I will implement the backend infrastructure for GitDrive, focusing on a "Multi-Repo" storage strategy where files are stored across multiple GitHub repositories. Authentication will be handled by **Supabase Auth**, and metadata (file structure, names, sizes) will be stored directly within the Git repositories (e.g., `gitdrive-metadata.json`), avoiding an external database for file indexing.

## 1. Architecture Overview

- **Auth**: Supabase Auth (GitHub Provider).
- **Storage Backend**: GitHub API (REST/GraphQL).
- **Data Model (Git-Based)**:
  - **Root Repo**: A main repository `gitdrive-root` that acts as the entry point.
  - **Metadata**: A `metadata.json` file in the root of each repo tracking the virtual file system structure (folders, file references).
  - **Sharding**: When a repo nears size limits (e.g., 1GB), a new private repository is created (`gitdrive-storage-001`, `gitdrive-storage-002`) and linked in the metadata.
- **API Layer**: Next.js API Routes (Server Actions) to bridge the frontend with GitHub APIs.

## 2. Supabase Authentication Setup

- **Setup**: Initialize Supabase client in the Next.js app.
- **Config**: Configure GitHub OAuth provider in Supabase.
- **Middleware**: Protect dashboard routes using Next.js Middleware + Supabase Auth.
- **Session**: Store the **GitHub Provider Token** (Access Token) securely in the session to make API calls on behalf of the user.

## 3. GitHub Storage Service (`src/lib/github.ts`)

- **Service Layer**: Create a robust service to handle GitHub interactions.
- **Features**:
  - `initializeDrive()`: Checks/Creates the root repository (`gitdrive-root`).
  - `listFiles(path)`: Reads `metadata.json` to return file lists.
  - `uploadFile(file, path)`:
    1. Commits the file blob to the current active storage repo.
    2. Updates `metadata.json` in the root repo with the file's pointer (repo name, sha, path).
  - `createFolder(name)`: Updates `metadata.json`.
  - `deleteFile(id)`: Removes from metadata (and optionally deletes the actual blob).

## 4. Integration Steps

- **Environment Variables**: Set up `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `GITHUB_CLIENT_SECRET`.
- **Dashboard Integration**: Connect the UI's "File Explorer" to the `listFiles` API.
- **Upload Integration**: Connect the "Upload" dialog to the `uploadFile` API.

## 5. Refinement & Edge Cases

- **Token Scope**: Ensure the GitHub token has `repo` scope.
- **Rate Limits**: Handle basic rate limiting feedback.
- **Concurrency**: Basic locking (or optimistic concurrency) for `metadata.json` updates to prevent overwrite conflicts.

## 6. Implementation Phases

1.  **Auth**: Connect Supabase Auth & Protect Routes.
2.  **Github Service**: Build the core logic for repo management and file operations.
3.  **Connect UI**: Hook up the frontend components to real data.

### To-dos

- [x] Initialize Next.js project and install dependencies (Shadcn, Lucide)
- [x] Configure GitHub-like theme in Tailwind and CSS variables
- [x] Install required Shadcn UI components
- [x] Implement Login/Signup page
- [x] Implement Dashboard layout (Sidebar, Header)
- [x] Implement File Explorer (Grid/List views) and Upload/Download UI
- [x] Implement Settings page
- [x] Check for linter errors and fix if any
- [x] Complete Implementation
- [x] Refine file upload component (clear template info)
- [x] Verify UI functionality and layout
- [x] Install Supabase SSR and Client libraries
- [x] Configure Supabase Auth Client and Middleware
- [x] Create GitHub Service (API wrapper for Repo/File ops)
- [x] Implement 'Initialize Drive' flow (Create Root Repo)
- [x] Implement File Listing API (Read metadata.json)
- [x] Implement File Upload API (Commit blob + Update metadata)
- [x] Connect Dashboard UI to Real Data
- [x] Implement 'Create Folder' functionality
- [x] Implement 'Delete File/Folder' functionality
- [x] Implement Onboarding Flow (Welcome Screen)


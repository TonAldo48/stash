# Stash

Stash is an open-source cloud storage application built on top of Git and GitHub. It leverages the power of version control to provide secure, versioned, and unlimited private cloud storage using your GitHub repositories.

## Features

- **GitHub Integration**: Sign in securely with your GitHub account.
- **Cloud Storage**: Use your private GitHub repositories as storage buckets.
- **File Management**:
  - Upload and download files.
  - Organize content in folders.
  - View files in Grid or List layouts.
  - Trash and restore functionality (planned).
- **Version Control**: Automatic file versioning powered by Git.
- **Modern UI**: A clean, responsive interface styled with Shadcn UI and Tailwind CSS.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/)
- **Icons**: [Lucide React](https://lucide.dev/)

## Getting Started

### Prerequisites

- Node.js 18+
- A GitHub account

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/stash.git
    cd stash
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Run the development server:
    ```bash
    npm run dev
    ```

4.  Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Backend Upload Service

Large uploads are processed by the Go service under `backend/`. It handles chunk ingestion, temporary storage, GitHub persistence (repo chunks or release assets), and database bookkeeping.

```bash
cd backend
go run ./cmd/server
```

The service exposes `/uploads/*` endpoints that the Next.js API routes proxy to. Run it alongside `npm run dev`.

### Environment Variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres/Supabase connection string used by the Go service |
| `UPLOAD_SERVICE_API_KEY` | Shared secret between Next.js and the Go service |
| `GITHUB_ACCESS_TOKEN` | Token (PAT or GitHub App installation token) with `repo` + `contents:write` scope |
| `GITHUB_STORAGE_OWNER` | GitHub username/organization that owns the storage repo |
| `GITHUB_STORAGE_REPO` | Repository that stores manifests/chunks (e.g. `gitdrive-storage`) |
| `UPLOAD_SERVICE_URL` | Base URL of the Go service (e.g. `http://localhost:8080`) |

Optional tunables (Go service): `UPLOAD_CHUNK_SIZE`, `UPLOAD_MAX_SIZE`, `UPLOAD_RELEASE_MAX_BYTES`, `UPLOAD_ENABLE_RELEASE_ASSETS`, `UPLOAD_ENABLE_GIT_LFS`, `UPLOAD_TEMP_DIR`.

Run the SQL in `backend/migrations/001_chunked_uploads.sql` (or add it to Supabase) to provision the `uploads` tables and `storage_strategy` columns referenced by the app.

## Project Structure

- `src/app`: Next.js App Router pages and layouts.
  - `/dashboard`: Main file explorer interface.
  - `/login`: Authentication page.
  - `/settings`: User settings.
- `src/components/ui`: Reusable UI components from Shadcn UI.
- `public`: Static assets.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).

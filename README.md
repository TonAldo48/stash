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

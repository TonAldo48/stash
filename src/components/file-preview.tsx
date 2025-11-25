"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Download, X, ChevronLeft, ChevronRight } from "lucide-react"
import { downloadFile } from "@/app/actions/files"
import { FileItem } from "@/app/actions/files"

interface FilePreviewProps {
  file: FileItem | null
  isOpen: boolean
  onClose: () => void
  onNext?: () => void
  onPrevious?: () => void
  hasNext?: boolean
  hasPrevious?: boolean
}

export function FilePreview({ 
  file, 
  isOpen, 
  onClose, 
  onNext, 
  onPrevious,
  hasNext,
  hasPrevious 
}: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && file) {
      loadFileContent()
    } else {
      setContent(null)
      setError(null)
    }
  }, [isOpen, file])

  // Handle keyboard navigation and escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        onNext()
      } else if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        onPrevious()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, hasNext, hasPrevious, onNext, onPrevious, onClose])

  // Prevent body scroll when preview is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const loadFileContent = async () => {
    if (!file) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await downloadFile(file.id)
      
      if (result.error) {
        setError(result.error)
      } else if (result.content) {
        setContent(result.content)
      }
    } catch (err) {
      setError("Failed to load file content")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    if (content && file) {
      const link = document.createElement('a')
      link.href = `data:application/octet-stream;base64,${content}`
      link.download = file.name
      link.click()
    }
  }

  const getFileType = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (!ext) return 'unknown'
    
    const imageTypes = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']
    const textTypes = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'php', 'rb', 'sh', 'yaml', 'yml', 'xml', 'sql', 'env', 'gitignore', 'log']
    const pdfTypes = ['pdf']
    const videoTypes = ['mp4', 'webm', 'ogg', 'mov']
    const audioTypes = ['mp3', 'wav', 'ogg', 'm4a', 'flac']

    if (imageTypes.includes(ext)) return 'image'
    if (textTypes.includes(ext)) return 'text'
    if (pdfTypes.includes(ext)) return 'pdf'
    if (videoTypes.includes(ext)) return 'video'
    if (audioTypes.includes(ext)) return 'audio'
    
    return 'unknown'
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <Loader2 className="h-12 w-12 animate-spin text-white/60" />
          <p className="mt-4 text-white/60 text-sm">Loading preview...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-red-400 mb-4">{error}</p>
          <Button 
            variant="outline" 
            className="bg-white/10 text-white hover:bg-white/20 border-white/20" 
            onClick={loadFileContent}
          >
            Retry
          </Button>
        </div>
      )
    }

    if (!content || !file) return null

    const type = getFileType(file.name)

    switch (type) {
      case 'image':
        return (
          <div className="h-full w-full flex items-center justify-center p-2 sm:p-4 md:p-8">
            <img 
              src={`data:image/*;base64,${content}`} 
              alt={file.name}
              className="max-h-full max-w-full object-contain select-none"
              draggable={false}
            />
          </div>
        )
      case 'text':
        return (
          <div className="h-full w-full flex items-center justify-center p-2 sm:p-4 md:p-8">
            <div className="w-full max-w-5xl h-full max-h-[calc(100vh-120px)] overflow-auto bg-zinc-900 text-zinc-100 p-3 sm:p-6 rounded-lg font-mono text-xs sm:text-sm whitespace-pre-wrap break-words border border-white/10">
              {atob(content)}
            </div>
          </div>
        )
      case 'pdf':
        return (
          <div className="h-full w-full p-2 sm:p-4 md:p-8 flex items-center justify-center">
            <iframe 
              src={`data:application/pdf;base64,${content}`}
              className="w-full max-w-5xl h-full max-h-[calc(100vh-120px)] rounded-lg bg-white"
              title={file.name}
            />
          </div>
        )
      case 'video':
        return (
          <div className="flex items-center justify-center h-full w-full p-2 sm:p-4 md:p-8">
            <video 
              controls 
              className="max-h-full max-w-full rounded-lg"
              autoPlay
            >
              <source src={`data:video/mp4;base64,${content}`} />
              Your browser does not support the video tag.
            </video>
          </div>
        )
       case 'audio':
        return (
          <div className="flex flex-col items-center justify-center h-full w-full gap-4 sm:gap-6 px-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </div>
            <p className="text-white/80 text-base sm:text-lg font-medium text-center truncate max-w-full">{file.name}</p>
            <audio controls className="w-full max-w-md">
              <source src={`data:audio/mpeg;base64,${content}`} />
              Your browser does not support the audio element.
            </audio>
          </div>
        )
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-white/60 mb-6">No preview available for this file type</p>
            <Button 
              className="bg-white text-black hover:bg-white/90"
              onClick={handleDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Download File
            </Button>
          </div>
        )
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-4 h-12 sm:h-14 bg-black/60 backdrop-blur-sm border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-full shrink-0 h-9 w-9 sm:h-10 sm:w-10"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
          <span className="text-white font-medium truncate text-sm sm:text-base">{file?.name}</span>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          {content && (
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-full h-9 w-9 sm:h-10 sm:w-10"
              onClick={handleDownload}
            >
              <Download className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Navigation - Previous - Always visible on mobile for touch */}
        {hasPrevious && (
          <button 
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 border border-white/10 flex items-center justify-center transition-all opacity-70 sm:opacity-0 sm:hover:opacity-100 sm:focus:opacity-100 active:scale-95"
            onClick={onPrevious}
          >
            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        )}

        {/* Navigation - Next - Always visible on mobile for touch */}
        {hasNext && (
          <button 
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 border border-white/10 flex items-center justify-center transition-all opacity-70 sm:opacity-0 sm:hover:opacity-100 sm:focus:opacity-100 active:scale-95"
            onClick={onNext}
          >
            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        )}

        {/* Content */}
        <div className="h-full w-full">
          {renderContent()}
        </div>
      </div>

      {/* Footer with file info - hide keyboard hints on mobile */}
      <div className="h-10 px-4 flex items-center justify-center bg-black/60 backdrop-blur-sm border-t border-white/10 shrink-0">
        <span className="text-white/40 text-xs hidden sm:inline">
          Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 mx-1">Esc</kbd> to close
          {(hasNext || hasPrevious) && (
            <>
              {' · '}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 mx-1">←</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 mx-1">→</kbd>
              to navigate
            </>
          )}
        </span>
        {/* Mobile hint */}
        <span className="text-white/40 text-xs sm:hidden">
          Tap X to close
          {(hasNext || hasPrevious) && ' · Swipe to navigate'}
        </span>
      </div>
    </div>
  )
}

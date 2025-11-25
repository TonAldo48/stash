"use client"

import { Search, X, File, Folder, Loader2 } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { searchFiles } from "@/app/actions/files"

interface SearchResult {
    id: string;
    name: string;
    type: "file" | "folder";
    path: string;
}

export function SearchBar() {
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        if (!query.trim()) {
            setResults([])
            setIsOpen(false)
            return
        }

        const debounce = setTimeout(async () => {
            setIsSearching(true)
            const res = await searchFiles(query)
            if (res.files) {
                setResults(res.files)
                setIsOpen(true)
            }
            setIsSearching(false)
        }, 300)

        return () => clearTimeout(debounce)
    }, [query])

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false)
        setQuery("")
        // Navigate to the folder containing the item
        if (result.type === "folder") {
            router.push(`/dashboard?path=${encodeURIComponent(result.path === "/" ? "" : result.path)}/${result.name}`)
        } else {
            router.push(`/dashboard?path=${encodeURIComponent(result.path)}`)
        }
        // Force a page refresh to update the path
        window.location.href = `/dashboard?path=${encodeURIComponent(result.path)}`
    }

    const clearSearch = () => {
        setQuery("")
        setResults([])
        setIsOpen(false)
        inputRef.current?.focus()
    }

    return (
        <div ref={containerRef} className="relative w-full md:w-2/3 lg:w-1/3">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Search files..."
                    className="w-full appearance-none bg-background pl-8 pr-8 shadow-none"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query && results.length > 0 && setIsOpen(true)}
                />
                {query && (
                    <button 
                        onClick={clearSearch}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                        {isSearching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <X className="h-4 w-4" />
                        )}
                    </button>
                )}
            </div>
            
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-80 overflow-auto">
                    {results.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            No results found for &quot;{query}&quot;
                        </div>
                    ) : (
                        <ul className="py-1">
                            {results.map((result) => (
                                <li key={result.id}>
                                    <button
                                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-accent text-left text-sm"
                                        onClick={() => handleSelect(result)}
                                    >
                                        {result.type === "folder" ? (
                                            <Folder className="h-4 w-4 text-blue-500 fill-blue-500 shrink-0" />
                                        ) : (
                                            <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium truncate">{result.name}</div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {result.path === "/" ? "My Drive" : result.path}
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}


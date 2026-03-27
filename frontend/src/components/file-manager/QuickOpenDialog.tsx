/**
 * 快速打开对话框 (Ctrl+P / Cmd+P)
 * 提供文件名模糊搜索，快速跳转到文件
 */

import { useEffect, useRef, useState } from 'react'
import { File, Search, X } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useFileManagerStore } from '../../stores/fileManagerStore'
import { useFileTabStore } from '../../stores/fileTabStore'

interface QuickOpenItem {
  path: string
  name: string
  dir: string
}

export default function QuickOpenDialog() {
  const toggleQuickOpen = useUIStore((state) => state.toggleQuickOpen)
  const currentDir = useFileManagerStore((state) => state.currentDir)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<QuickOpenItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        toggleQuickOpen()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        useFileTabStore.getState().openFile(results[selectedIndex].path)
        toggleQuickOpen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [results, selectedIndex, toggleQuickOpen])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    if (!currentDir) return
    let cancelled = false
    window.electronAPI.invoke('QuickOpen.Search', currentDir, query.trim()).then((items: QuickOpenItem[]) => {
      if (!cancelled) setResults(items ?? [])
    })
    return () => { cancelled = true }
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={toggleQuickOpen} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
        {/* Input */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="输入文件名快速跳转..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
          />
          <button onClick={toggleQuickOpen} className="shrink-0 text-slate-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[40vh] overflow-y-auto">
          {results.length === 0 && query.trim() && (
            <p className="px-4 py-6 text-center text-xs text-slate-500">未找到匹配文件</p>
          )}
          {results.length === 0 && !query.trim() && (
            <p className="px-4 py-6 text-center text-xs text-slate-500">输入关键词搜索文件</p>
          )}
          {results.map((item, index) => (
            <button
              key={item.path}
              onClick={() => {
                useFileTabStore.getState().openFile(item.path)
                toggleQuickOpen()
              }}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${
                index === selectedIndex
                  ? 'bg-blue-500/15 text-blue-200'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <File size={14} className="shrink-0 text-slate-400" />
              <span className="truncate font-medium">{item.name}</span>
              <span className="ml-auto truncate text-xs text-slate-500">{item.dir}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

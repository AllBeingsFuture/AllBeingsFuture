/**
 * 文件管理器主面板
 * 包含文件树、搜索、文件内容预览
 */

import { useState } from 'react'
import { FolderOpen, Search, RefreshCw, ChevronRight, File, Folder } from 'lucide-react'
import { workbenchApi } from '../../app/api/workbench'
import { useFileManagerStore } from '../../stores/fileManagerStore'

function FileTreeNode({ entry, depth = 0 }: { entry: any; depth?: number }) {
  const { expandedDirs, selectedPath, dirCache } = useFileManagerStore()
  const isDir = entry.isDirectory
  const isExpanded = expandedDirs.has(entry.path)
  const isSelected = selectedPath === entry.path
  const children = isDir ? dirCache.get(entry.path) ?? [] : []

  return (
    <div>
      <button
        onClick={() => {
          void workbenchApi.fileManager.setSelectedPath(entry.path)
          if (isDir) {
            void workbenchApi.fileManager.toggleDir(entry.path)
          }
        }}
        className={`flex w-full items-center gap-1.5 px-2 py-1 text-xs hover:bg-white/5 ${
          isSelected ? 'bg-blue-500/15 text-blue-200' : 'text-slate-300'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir && (
          <ChevronRight
            size={12}
            className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        )}
        {isDir ? (
          <Folder size={14} className="shrink-0 text-blue-300" />
        ) : (
          <File size={14} className="shrink-0 text-slate-400" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {isDir && isExpanded && children.map((child: any) => (
        <FileTreeNode key={child.path} entry={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function FilePane() {
  const { currentDir, isLoading, error, dirCache } = useFileManagerStore()
  const [filterText, setFilterText] = useState('')

  const rootEntries = currentDir ? dirCache.get(currentDir) ?? [] : []
  const filteredEntries = filterText
    ? rootEntries.filter((e: any) => e.name.toLowerCase().includes(filterText.toLowerCase()))
    : rootEntries

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <FolderOpen size={14} className="text-blue-300" />
        <span className="text-xs font-medium text-white">文件管理器</span>
        <div className="flex-1" />
        <button
          onClick={() => { void workbenchApi.fileManager.refreshCurrentDir() }}
          className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white"
          title="刷新"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-white/10 px-3 py-1.5">
        <div className="flex items-center gap-1.5 rounded bg-white/5 px-2 py-1">
          <Search size={12} className="text-slate-500" />
          <input
            type="text"
            placeholder="筛选文件..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 outline-none"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="px-3 py-4 text-xs text-slate-500">加载中...</p>
        )}
        {error && (
          <p className="px-3 py-4 text-xs text-red-400">{error}</p>
        )}
        {!currentDir && !isLoading && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <FolderOpen size={24} className="text-slate-600" />
            <p className="text-xs text-slate-500">选择一个会话以查看其工作目录</p>
          </div>
        )}
        {filteredEntries.map((entry: any) => (
          <FileTreeNode key={entry.path} entry={entry} />
        ))}
      </div>
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import {
  File, FileText, Plus, Minus, Edit3, RefreshCw,
  Search, AlertTriangle, FolderOpen, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useTrackerStore } from '../../stores/trackerStore'
import { useSessionStore } from '../../stores/sessionStore'

type SortMode = 'time' | 'path'

interface FileChange {
  path: string
  changeType: 'create' | 'modify' | 'delete'
  timestamp: string
  concurrent?: boolean
}

const changeConfig = {
  create: { icon: Plus, color: 'text-green-400', bg: 'bg-green-900/20', label: '新建' },
  modify: { icon: Edit3, color: 'text-yellow-400', bg: 'bg-yellow-900/20', label: '修改' },
  delete: { icon: Minus, color: 'text-red-400', bg: 'bg-red-900/20', label: '删除' },
} as const

function getDirectory(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return idx >= 0 ? filePath.slice(0, idx) : '.'
}

function getFileName(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return idx >= 0 ? filePath.slice(idx + 1) : filePath
}

export default function FileManagerPanel() {
  const { sessions, loading: sessionsLoading } = useSessionStore()
  const { sessionChanges, loadSessionChanges } = useTrackerStore()

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('time')
  const [groupByDir, setGroupByDir] = useState(true)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionChanges(selectedSessionId)
    }
  }, [selectedSessionId])

  const changes: FileChange[] = useMemo(() => {
    if (!selectedSessionId) return []
    return (sessionChanges[selectedSessionId] ?? []) as FileChange[]
  }, [selectedSessionId, sessionChanges])

  const filtered = useMemo(() => {
    let result = changes
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c => c.path.toLowerCase().includes(q))
    }
    if (sortMode === 'time') {
      result = [...result].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
    } else {
      result = [...result].sort((a, b) => a.path.localeCompare(b.path))
    }
    return result
  }, [changes, searchQuery, sortMode])

  const grouped = useMemo(() => {
    const map = new Map<string, FileChange[]>()
    for (const c of filtered) {
      const dir = getDirectory(c.path)
      if (!map.has(dir)) map.set(dir, [])
      map.get(dir)!.push(c)
    }
    return map
  }, [filtered])

  const summary = useMemo(() => {
    let creates = 0, modifies = 0, deletes = 0
    for (const c of changes) {
      if (c.changeType === 'create') creates++
      else if (c.changeType === 'modify') modifies++
      else if (c.changeType === 'delete') deletes++
    }
    return { creates, modifies, deletes, total: changes.length }
  }, [changes])

  const handleRefresh = async () => {
    if (!selectedSessionId) return
    setRefreshing(true)
    await loadSessionChanges(selectedSessionId)
    setRefreshing(false)
  }

  const toggleDir = (dir: string) => {
    setCollapsedDirs(prev => {
      const next = new Set(prev)
      next.has(dir) ? next.delete(dir) : next.add(dir)
      return next
    })
  }

  const selectedSession = sessions.find(s => s.id === selectedSessionId)

  return (
    <div className="flex flex-col h-full bg-dark-bg text-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-border flex items-center gap-3">
        <FileText size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold flex-1">文件管理器</h2>
        <button
          onClick={handleRefresh}
          disabled={!selectedSessionId || refreshing}
          className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-dark-hover disabled:opacity-30 transition-colors"
          title="刷新"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Session selector */}
      <div className="px-4 py-2.5 border-b border-dark-border">
        <label className="block text-[10px] text-gray-500 mb-1">选择会话</label>
        <select
          value={selectedSessionId ?? ''}
          onChange={e => setSelectedSessionId(e.target.value || null)}
          className="w-full px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent appearance-none cursor-pointer"
        >
          <option value="">-- 请选择会话 --</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.id.slice(0, 8)} - {(s as any).name || (s as any).model || '未命名'}
            </option>
          ))}
        </select>
      </div>

      {/* Search & controls */}
      {selectedSessionId && (
        <div className="px-4 py-2 border-b border-dark-border flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索文件..."
              className="w-full pl-8 pr-3 py-1.5 bg-dark-card border border-dark-border rounded-md text-xs outline-none focus:border-dark-accent"
            />
          </div>
          <button
            onClick={() => setSortMode(m => m === 'time' ? 'path' : 'time')}
            className="px-2 py-1.5 text-[10px] bg-dark-card border border-dark-border rounded-md text-gray-400 hover:text-white"
            title={sortMode === 'time' ? '按时间排序' : '按路径排序'}
          >
            {sortMode === 'time' ? '时间序' : '路径序'}
          </button>
          <button
            onClick={() => setGroupByDir(g => !g)}
            className={`px-2 py-1.5 text-[10px] border rounded-md ${
              groupByDir
                ? 'bg-blue-900/30 border-blue-800/40 text-blue-400'
                : 'bg-dark-card border-dark-border text-gray-400 hover:text-white'
            }`}
          >
            分组
          </button>
        </div>
      )}

      {/* File changes list */}
      <div className="flex-1 overflow-y-auto">
        {!selectedSessionId ? (
          <EmptyState message="请选择一个会话以查看文件变更" />
        ) : filtered.length === 0 ? (
          <EmptyState
            message={searchQuery ? '没有匹配的文件' : '该会话暂无文件变更记录'}
          />
        ) : groupByDir ? (
          <div className="p-2 space-y-0.5">
            {Array.from(grouped.entries()).map(([dir, items]) => {
              const collapsed = collapsedDirs.has(dir)
              return (
                <div key={dir}>
                  <button
                    onClick={() => toggleDir(dir)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-dark-hover rounded-md transition-colors"
                  >
                    {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <FolderOpen size={12} className="text-yellow-500/70" />
                    <span className="font-mono truncate">{dir}</span>
                    <span className="ml-auto text-[10px] text-gray-600">{items.length}</span>
                  </button>
                  {!collapsed && (
                    <div className="ml-4 space-y-0.5">
                      {items.map(c => (
                        <ChangeRow key={c.path + c.timestamp} change={c} showFullPath={false} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {filtered.map(c => (
              <ChangeRow key={c.path + c.timestamp} change={c} showFullPath />
            ))}
          </div>
        )}
      </div>

      {/* Summary bar */}
      {selectedSessionId && summary.total > 0 && (
        <div className="px-4 py-2 border-t border-dark-border flex items-center gap-4 text-[10px]">
          <span className="text-gray-500">共 {summary.total} 项变更</span>
          {summary.creates > 0 && (
            <span className="text-green-400">+{summary.creates} 新建</span>
          )}
          {summary.modifies > 0 && (
            <span className="text-yellow-400">~{summary.modifies} 修改</span>
          )}
          {summary.deletes > 0 && (
            <span className="text-red-400">-{summary.deletes} 删除</span>
          )}
        </div>
      )}
    </div>
  )
}

function ChangeRow({ change, showFullPath }: { change: FileChange; showFullPath: boolean }) {
  const cfg = changeConfig[change.changeType]
  const Icon = cfg.icon
  const displayName = showFullPath ? change.path : getFileName(change.path)
  const ts = change.timestamp
    ? new Date(change.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : ''

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-dark-hover group transition-colors">
      <div className={`p-1 rounded ${cfg.bg}`}>
        <Icon size={11} className={cfg.color} />
      </div>
      <File size={12} className="text-gray-600 shrink-0" />
      <span className="flex-1 text-xs font-mono truncate" title={change.path}>
        {displayName}
      </span>
      {change.concurrent && (
        <span
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] bg-orange-900/30 text-orange-400 rounded"
          title="多会话并发修改"
        >
          <AlertTriangle size={9} />
          并发
        </span>
      )}
      {ts && <span className="text-[10px] text-gray-600 shrink-0">{ts}</span>}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 py-16">
      <FileText size={36} className="mb-3 opacity-20" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

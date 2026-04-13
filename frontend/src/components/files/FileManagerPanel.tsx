import { useState, useEffect, useMemo } from 'react'
import {
  File, FileText, Plus, Minus, Edit3, RefreshCw,
  Search, AlertTriangle, FolderOpen, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
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
  create: { icon: Plus, color: 'text-[#3eb550]', bg: 'bg-transparent', badge: '+', label: '新建' },
  modify: { icon: Edit3, color: 'text-[#c4931a]', bg: 'bg-transparent', badge: '~', label: '修改' },
  delete: { icon: Minus, color: 'text-[#e04040]', bg: 'bg-transparent', badge: '-', label: '删除' },
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
  const sessions = useSessionStore((state) => state.sessions)
  const { sessionChanges, loadSessionChanges } = useTrackerStore(
    useShallow((state) => ({
      sessionChanges: state.sessionChanges,
      loadSessionChanges: state.loadSessionChanges,
    })),
  )

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('time')
  const [groupByDir, setGroupByDir] = useState(true)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (selectedSessionId) {
      void loadSessionChanges(selectedSessionId)
    }
  }, [selectedSessionId, loadSessionChanges])

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
    <div className="flex flex-col h-full bg-[#0c0c0c] text-[#e8e4de]">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[#1e1e1e] flex items-center gap-2">
        <span className="text-[9px] font-700 tracking-[0.18em] uppercase text-[#555] flex-1">FILE MANAGER</span>
        <button
          onClick={handleRefresh}
          disabled={!selectedSessionId || refreshing}
          className="p-1 text-[#444] hover:text-[#888] hover:bg-[#1a1a1a] disabled:opacity-30 transition-colors"
          title="刷新"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Session selector */}
      <div className="px-3 py-2 border-b border-[#1e1e1e]">
        <label className="block text-[9px] font-600 tracking-widest uppercase text-[#3a3a3a] mb-1">SESSION</label>
        <select
          value={selectedSessionId ?? ''}
          onChange={e => setSelectedSessionId(e.target.value || null)}
          className="w-full px-2 py-1.5 bg-[#111] border border-[#2e2e2e] text-xs text-[#aaa] outline-none focus:border-[#ff4f1a] appearance-none cursor-pointer"
          style={{ colorScheme: 'dark' }}
        >
          <option value="">-- 选择会话 --</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.id.slice(0, 8)} · {(s as any).name || (s as any).model || '未命名'}
            </option>
          ))}
        </select>
      </div>

      {/* Search & controls */}
      {selectedSessionId && (
        <div className="px-3 py-1.5 border-b border-[#1e1e1e] flex items-center gap-1.5">
          <div className="flex-1 relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#3a3a3a]" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="SEARCH..."
              className="w-full pl-6 pr-2 py-1 bg-[#111] border border-[#2e2e2e] text-[11px] text-[#aaa] outline-none focus:border-[#ff4f1a] placeholder:text-[9px] placeholder:tracking-wider placeholder:text-[#333]"
            />
          </div>
          <button
            onClick={() => setSortMode(m => m === 'time' ? 'path' : 'time')}
            className="px-1.5 py-1 text-[9px] font-600 uppercase tracking-wider bg-[#111] border border-[#2e2e2e] text-[#555] hover:text-[#888] hover:border-[#444]"
          >
            {sortMode === 'time' ? 'TIME' : 'PATH'}
          </button>
          <button
            onClick={() => setGroupByDir(g => !g)}
            className={`px-1.5 py-1 text-[9px] font-600 uppercase tracking-wider border ${
              groupByDir
                ? 'bg-[#1a1a1a] border-[#ff4f1a]/30 text-[#ff4f1a]'
                : 'bg-[#111] border-[#2e2e2e] text-[#555] hover:text-[#888]'
            }`}
          >
            GROUP
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
          <div className="space-y-0">
            {Array.from(grouped.entries()).map(([dir, items]) => {
              const collapsed = collapsedDirs.has(dir)
              return (
                <div key={dir} className="border-b border-[#1a1a1a]">
                  <button
                    onClick={() => toggleDir(dir)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-[#555] hover:text-[#888] hover:bg-[#111] transition-colors"
                  >
                    {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                    <FolderOpen size={10} className="text-[#c4931a]" />
                    <span className="font-mono truncate text-[#777]">{dir}</span>
                    <span className="ml-auto text-[9px] text-[#3a3a3a]">{items.length}</span>
                  </button>
                  {!collapsed && (
                    <div className="border-t border-[#1a1a1a]">
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
        <div className="px-3 py-1.5 border-t border-[#1e1e1e] flex items-center gap-4 text-[9px] font-600 uppercase tracking-wider">
          <span className="text-[#444]">TOTAL <span className="text-[#888]">{summary.total}</span></span>
          {summary.creates > 0 && (
            <span className="text-[#3eb550]">+{summary.creates}</span>
          )}
          {summary.modifies > 0 && (
            <span className="text-[#c4931a]">~{summary.modifies}</span>
          )}
          {summary.deletes > 0 && (
            <span className="text-[#e04040]">-{summary.deletes}</span>
          )}
        </div>
      )}
    </div>
  )
}

function ChangeRow({ change, showFullPath }: { change: FileChange; showFullPath: boolean }) {
  const cfg = changeConfig[change.changeType]
  const displayName = showFullPath ? change.path : getFileName(change.path)
  const ts = change.timestamp
    ? new Date(change.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : ''

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#111] group transition-colors border-b border-[#1a1a1a] last:border-0">
      <span className={`text-[10px] font-800 w-3 shrink-0 ${cfg.color}`}>{cfg.badge}</span>
      <span className="flex-1 text-[11px] font-mono truncate text-[#888]" title={change.path}>
        {displayName}
      </span>
      {change.concurrent && (
        <span
          className="flex items-center gap-0.5 px-1 py-0.5 text-[9px] border border-[#c4931a]/30 text-[#c4931a]"
          title="多会话并发修改"
        >
          <AlertTriangle size={8} />
          CONCURRENT
        </span>
      )}
      {ts && <span className="text-[9px] text-[#3a3a3a] shrink-0 tabular-nums">{ts}</span>}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 gap-2">
      <FileText size={24} className="text-[#2e2e2e]" />
      <p className="text-[10px] font-600 uppercase tracking-wider text-[#333]">{message}</p>
    </div>
  )
}

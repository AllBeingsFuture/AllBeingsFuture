import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { RefreshCw, ExternalLink, Trash2 } from 'lucide-react'
import { LogService } from '../../../bindings/allbeingsfuture/internal/services'
import type { LogEntry } from '../../../bindings/allbeingsfuture/internal/services/logservice'

type LogLevel = 'all' | 'error' | 'warn' | 'info' | 'debug'

const levelColors: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-gray-300',
  debug: 'text-gray-500',
}

const levelBadgeColors: Record<string, string> = {
  error: 'bg-red-500/20 text-red-400',
  warn: 'bg-yellow-500/20 text-yellow-400',
  info: 'bg-blue-500/10 text-blue-400',
  debug: 'bg-gray-500/20 text-gray-500',
}

export default function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogLevel>('all')
  const [loading, setLoading] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await LogService.GetRecent(500)
      setLogs(entries ?? [])
    } catch (err) {
      console.warn('[LogsTab] Failed to load logs:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleClear = useCallback(async () => {
    try {
      await LogService.Clear()
      setLogs([])
    } catch (err) {
      console.warn('[LogsTab] Failed to clear logs:', err)
    }
  }, [])

  const handleOpenFile = useCallback(async () => {
    try {
      const api = window.allBeingsFuture?.log
      await api?.openFile()
    } catch (err) {
      console.warn('[LogsTab] Failed to open log file:', err)
    }
  }, [])

  useEffect(() => {
    loadLogs()
    const timer = setInterval(loadLogs, 3000)
    return () => clearInterval(timer)
  }, [loadLogs])

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40)
  }, [])

  const filteredLogs = useMemo(
    () => filter === 'all' ? logs : logs.filter(entry => entry.level === filter),
    [logs, filter],
  )

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { error: 0, warn: 0, info: 0, debug: 0 }
    for (const entry of logs) {
      if (counts[entry.level] !== undefined) counts[entry.level]++
    }
    return counts
  }, [logs])

  return (
    <div className="space-y-3 h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">应用日志</h4>
          {loading && (
            <RefreshCw size={12} className="text-gray-500 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleClear}
            className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
            title="清空日志"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={loadLogs}
            className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={handleOpenFile}
            className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
            title="打开日志目录"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {/* Level filter */}
      <div className="flex gap-1.5">
        {(['all', 'error', 'warn', 'info', 'debug'] as LogLevel[]).map(level => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              filter === level
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            {level === 'all' ? `全部 (${logs.length})` : `${level.charAt(0).toUpperCase() + level.slice(1)} (${levelCounts[level] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-dark-bg border border-dark-border rounded-lg p-3 font-mono text-xs"
        style={{ maxHeight: '280px' }}
      >
        {filteredLogs.length === 0 ? (
          <p className="text-gray-600">暂无日志</p>
        ) : (
          filteredLogs.map((entry, i) => (
            <div
              key={i}
              className={`leading-relaxed break-all flex gap-2 ${levelColors[entry.level] || 'text-gray-400'}`}
            >
              <span className="text-gray-600 shrink-0 select-none">{entry.timestamp}</span>
              <span className={`shrink-0 px-1 rounded text-[10px] uppercase ${levelBadgeColors[entry.level] || ''}`}>
                {entry.level}
              </span>
              <span className="flex-1">{entry.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <span>共 {filteredLogs.length} 条日志</span>
        <div className="flex items-center gap-3">
          <span>每 3 秒自动刷新</span>
          <span className={autoScroll ? 'text-green-500' : 'text-gray-600'}>
            {autoScroll ? '自动滚动' : '已暂停滚动'}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * 时间线面板 - 展示会话活动事件流（占位版）
 */

import { useState, useEffect } from 'react'
import { Clock, Zap, Search, Activity } from 'lucide-react'
import { useSessionStore } from '../../stores/sessionStore'
import { STATUS_COLORS } from '../../constants/statusColors'

const STATUS_LABELS: Record<string, string> = {
  starting: '启动中',
  running: '运行中',
  idle: '空闲',
  waiting_input: '等待输入',
  paused: '已暂停',
  completed: '已完成',
  error: '出错',
  terminated: '已终止',
  interrupted: '已中断',
}

function formatDuration(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export default function TimelinePanel() {
  const sessions = useSessionStore(s => s.sessions)
  const selectedId = useSessionStore(s => s.selectedId)
  const selectSession = useSessionStore(s => s.select)
  const [duration, setDuration] = useState('-')
  const [searchQuery, setSearchQuery] = useState('')

  // 自动选中第一个活跃会话
  useEffect(() => {
    if (selectedId) return
    const activeSession = sessions.find(
      s => s.status === 'running' || s.status === 'idle' || s.status === 'waiting_input'
    )
    if (activeSession) selectSession(activeSession.id)
  }, [sessions, selectedId, selectSession])

  const selectedSession = sessions.find(s => s.id === selectedId)

  useEffect(() => {
    if (!selectedSession?.startedAt) { setDuration('-'); return }
    if (selectedSession.status === 'completed' || selectedSession.status === 'terminated') {
      setDuration(formatDuration(selectedSession.startedAt)); return
    }
    const update = () => setDuration(formatDuration(selectedSession.startedAt!))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [selectedSession?.id, selectedSession?.status, selectedSession?.startedAt])

  if (!selectedId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-text-muted text-sm">
          <p>未选择会话</p>
          <p className="mt-2 text-xs">点击侧边栏会话查看详情</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3">
      {/* 会话信息头 */}
      {selectedSession && (
        <div className="mb-3 p-2.5 rounded-lg bg-bg-primary border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-text-primary truncate">
              {selectedSession.name || '未命名会话'}
            </span>
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: (STATUS_COLORS[selectedSession.status] || '#8B949E') + '20',
                color: STATUS_COLORS[selectedSession.status] || '#8B949E',
              }}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${selectedSession.status === 'running' ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: STATUS_COLORS[selectedSession.status] || '#8B949E' }}
              />
              {STATUS_LABELS[selectedSession.status] || selectedSession.status}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {duration}
            </span>
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" /> — 事件
            </span>
          </div>
        </div>
      )}

      {/* 搜索框 */}
      <div className="mb-2 relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索事件..."
          className="w-full pl-7 pr-3 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
        />
      </div>

      {/* 时间线占位 */}
      <h3 className="text-xs font-medium mb-2 text-text-secondary">活动时间线</h3>

      <div className="flex-1 flex flex-col items-center justify-center py-8 text-text-muted">
        <Activity className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-xs">等待活动事件...</p>
        <p className="text-[10px] mt-1">活动追踪功能即将推出</p>
      </div>
    </div>
  )
}

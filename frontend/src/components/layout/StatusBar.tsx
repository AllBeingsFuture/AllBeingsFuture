/**
 * 底部状态栏
 * 左：活跃会话指示  中：视图模式切换  右：会话统计 + 运行时长
 */

import { useState, useEffect, useMemo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export default function StatusBar() {
  const sessions = useSessionStore((state) => state.sessions)
  const [elapsed, setElapsed] = useState(0)

  const { activeSessions, totalSessions, runningSessions, waitingSessions, errorSessions } = useMemo(() => {
    let activeSessions = 0
    let runningSessions = 0
    let waitingSessions = 0
    let errorSessions = 0

    for (const session of sessions) {
      if (session.status === 'running' || session.status === 'waiting_input') activeSessions++
      if (session.status === 'running') runningSessions++
      if (session.status === 'idle' || session.status === 'waiting_input') waitingSessions++
      if (session.status === 'error') errorSessions++
    }

    return { activeSessions, totalSessions: sessions.length, runningSessions, waitingSessions, errorSessions }
  }, [sessions])

  useEffect(() => {
    const timer = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="h-7 bg-bg-secondary/80 backdrop-blur-sm border-t border-white/[0.06] flex items-center justify-between px-4 text-[11px] text-text-secondary">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeSessions > 0 ? 'bg-accent-green shadow-[0_0_4px_rgba(63,185,80,0.5)]' : 'bg-text-muted'}`} />
          <span title="活跃会话 / 历史总会话" className="cursor-default">
            活跃 {activeSessions}
            <span className="mx-0.5 text-text-muted/50">/</span>
            共 {totalSessions}
          </span>
        </div>
      </div>

      <div className="text-text-muted cursor-default">会话视图</div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2.5 cursor-default" title="会话统计">
          <span className="text-text-muted">总 <span className="font-medium text-text-primary">{totalSessions}</span></span>
          <span className="text-white/[0.08]">|</span>
          <span className="text-text-muted">运行 <span className="font-medium text-accent-green">{runningSessions}</span></span>
          <span className="text-text-muted">等待 <span className="font-medium text-accent-yellow">{waitingSessions}</span></span>
          <span className="text-text-muted">异常 <span className="font-medium text-accent-red">{errorSessions}</span></span>
        </div>
        <span className="text-white/[0.08]">|</span>
        <span title="应用本次启动运行时长" className="cursor-default tabular-nums">运行 {formatDuration(elapsed * 1000)}</span>
      </div>
    </div>
  )
}

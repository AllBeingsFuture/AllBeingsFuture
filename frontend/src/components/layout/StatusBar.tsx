/**
 * 底部状态栏
 * 左：活跃会话指示  中：视图模式切换  右：会话统计 + 运行时长
 */

import { useState, useEffect, useMemo } from 'react'
import { Grid3x3, Columns2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import type { ViewMode } from '../../stores/ui-helpers'

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export default function StatusBar() {
  const { viewMode, setViewMode } = useUIStore(
    useShallow((state) => ({
      viewMode: state.viewMode,
      setViewMode: state.setViewMode,
    })),
  )
  const sessions = useSessionStore((state) => state.sessions)
  const [elapsed, setElapsed] = useState(0)

  const {
    activeSessions,
    totalSessions,
    runningSessions,
    waitingSessions,
    errorSessions,
  } = useMemo(() => {
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

    return {
      activeSessions,
      totalSessions: sessions.length,
      runningSessions,
      waitingSessions,
      errorSessions,
    }
  }, [sessions])

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="h-7 bg-bg-secondary/80 backdrop-blur-sm border-t border-white/[0.06] flex items-center justify-between px-4 text-[11px] text-text-secondary">
      {/* 左侧：活跃会话数 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              activeSessions > 0 ? 'bg-accent-green shadow-[0_0_4px_rgba(63,185,80,0.5)]' : 'bg-text-muted'
            }`}
          />
          <span title="活跃会话 / 历史总会话" className="cursor-default">
            活跃 {activeSessions}
            <span className="mx-0.5 text-text-muted/50">/</span>
            共 {totalSessions}
          </span>
        </div>
      </div>

      {/* 中间：视图模式切换 */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5 bg-white/[0.03] rounded-md px-0.5 py-0.5 border border-white/[0.04]">
          {([
            { mode: 'grid' as ViewMode, icon: Grid3x3, label: '网格视图' },
            { mode: 'tabs' as ViewMode, icon: Columns2, label: '标签页视图' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`p-1 rounded btn-transition ${
                viewMode === mode
                  ? 'bg-accent-blue/20 text-accent-blue shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
              }`}
              title={label}
            >
              <Icon className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>

      {/* 右侧：会话统计 + 运行时长 */}
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2.5 cursor-default" title="会话统计">
          <span className="text-text-muted">
            总 <span className="font-medium text-text-primary">{totalSessions}</span>
          </span>
          <span className="text-white/[0.08]">|</span>
          <span className="text-text-muted">
            运行 <span className="font-medium text-accent-green">{runningSessions}</span>
          </span>
          <span className="text-text-muted">
            等待 <span className="font-medium text-accent-yellow">{waitingSessions}</span>
          </span>
          <span className="text-text-muted">
            异常 <span className="font-medium text-accent-red">{errorSessions}</span>
          </span>
        </div>

        <span className="text-white/[0.08]">|</span>

        <span title="应用本次启动运行时长" className="cursor-default tabular-nums">
          运行 {formatDuration(elapsed * 1000)}
        </span>
      </div>
    </div>
  )
}

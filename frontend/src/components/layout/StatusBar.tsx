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
    <div className="h-7 bg-[#0c0c0c] border-t border-[#2e2e2e] flex items-center justify-between px-4 text-[10px] font-500 tracking-[0.08em] uppercase">
      {/* Left: active session count */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-[5px] h-[5px] ${activeSessions > 0 ? 'bg-[#3eb550]' : 'bg-[#333]'}`} />
          <span className="text-[#555]">
            ACTIVE <span className={activeSessions > 0 ? 'text-[#3eb550]' : 'text-[#888]'}>{activeSessions}</span>
            <span className="mx-1 text-[#333]">/</span>
            TOTAL <span className="text-[#888]">{totalSessions}</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <span className="text-[#555]">RUN <span className="text-[#3eb550]">{runningSessions}</span></span>
          <span className="text-[#555]">WAIT <span className="text-[#c4931a]">{waitingSessions}</span></span>
          {errorSessions > 0 && (
            <span className="text-[#555]">ERR <span className="text-[#e04040]">{errorSessions}</span></span>
          )}
        </div>
      </div>

      {/* Center: view mode */}
      <div className="flex items-center gap-1 border border-[#2e2e2e]">
        {([
          { mode: 'grid' as ViewMode, icon: Grid3x3, label: 'GRID' },
          { mode: 'tabs' as ViewMode, icon: Columns2, label: 'TABS' },
        ]).map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex items-center gap-1 px-2 py-0.5 btn-transition ${
              viewMode === mode
                ? 'bg-[#1a1a1a] text-[#ff4f1a]'
                : 'text-[#555] hover:text-[#888] hover:bg-[#111]'
            }`}
            title={label}
          >
            <Icon className="w-3 h-3" />
            <span className="text-[9px]">{label}</span>
          </button>
        ))}
      </div>

      {/* Right: uptime */}
      <span className="text-[#444] tabular-nums">
        UP <span className="text-[#666]">{formatDuration(elapsed * 1000)}</span>
      </span>
    </div>
  )
}

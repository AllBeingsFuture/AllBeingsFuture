/**
 * 监控看板侧边栏视图 - 会话统计和最近活跃会话
 */

import { useMemo } from 'react'
import { Monitor, Activity, HelpCircle, AlertCircle } from 'lucide-react'
import { useSessionStore } from '../../stores/sessionStore'
import { STATUS_COLORS } from '../../constants/statusColors'

export default function DashboardSidebarView() {
  const sessions = useSessionStore(s => s.sessions)

  const { totalCount, runningCount, waitingInputCount, errorCount, recentSessions } = useMemo(() => {
    let runningCount = 0
    let waitingInputCount = 0
    let errorCount = 0

    for (const session of sessions) {
      if (session.status === 'running' || session.status === 'starting') runningCount += 1
      if (session.status === 'waiting_input') waitingInputCount += 1
      if (session.status === 'error') errorCount += 1
    }

    return {
      totalCount: sessions.length,
      runningCount,
      waitingInputCount,
      errorCount,
      recentSessions: [...sessions]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 5),
    }
  }, [sessions])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          监控看板
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-bg-secondary border border-border rounded-lg p-2 flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <Monitor className="w-3 h-3 text-text-muted shrink-0" />
              <span className="text-xs text-text-muted truncate">总会话</span>
            </div>
            <span className="text-lg font-bold text-text-primary leading-none">{totalCount}</span>
          </div>

          <div className="bg-bg-secondary border border-border rounded-lg p-2 flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-accent-green shrink-0" />
              <span className="text-xs text-text-muted truncate">运行中</span>
            </div>
            <span className="text-lg font-bold text-accent-green leading-none">{runningCount}</span>
          </div>

          <div className="bg-bg-secondary border border-border rounded-lg p-2 flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <HelpCircle className="w-3 h-3 text-accent-yellow shrink-0" />
              <span className="text-xs text-text-muted truncate">等待输入</span>
            </div>
            <span className="text-lg font-bold text-accent-yellow leading-none">{waitingInputCount}</span>
          </div>

          <div className="bg-bg-secondary border border-border rounded-lg p-2 flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-accent-red shrink-0" />
              <span className="text-xs text-text-muted truncate">出错</span>
            </div>
            <span className="text-lg font-bold text-accent-red leading-none">{errorCount}</span>
          </div>
        </div>

        <div>
          <div className="px-1 mb-1">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              最近活跃
            </span>
          </div>

          {recentSessions.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-3">暂无会话</p>
          ) : (
            <div className="space-y-0.5">
              {recentSessions.map(session => (
                <div
                  key={session.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover transition-colors"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[session.status] ?? '#8B949E' }}
                  />
                  <span className="text-xs text-text-secondary truncate flex-1">
                    {session.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

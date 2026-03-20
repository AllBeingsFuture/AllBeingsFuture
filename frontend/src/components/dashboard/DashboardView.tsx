/**
 * Dashboard 视图 - 对齐 claudeops 风格
 * 统计卡片 + 会话列表 + 新建会话
 */

import { useEffect, useCallback } from 'react'
import {
  MessageSquare,
  Circle,
  FolderOpen,
  Clock,
  RefreshCw,
  Plus,
  Monitor,
  Activity,
  HelpCircle,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import { useSessionStore } from '../../stores/sessionStore'
import { useUIStore } from '../../stores/uiStore'
import { STATUS_COLORS } from '../../constants/statusColors'

const statusBadge: Record<string, { label: string; cls: string }> = {
  starting:      { label: '启动中',   cls: 'bg-gray-600 text-gray-200' },
  running:       { label: '运行中',   cls: 'bg-accent-green/20 text-accent-green' },
  idle:          { label: '空闲',     cls: 'bg-accent-blue/20 text-accent-blue' },
  waiting_input: { label: '等待输入', cls: 'bg-accent-yellow/20 text-accent-yellow' },
  completed:     { label: '已完成',   cls: 'bg-accent-blue/20 text-accent-blue' },
  error:         { label: '错误',     cls: 'bg-accent-red/20 text-accent-red' },
  terminated:    { label: '已终止',   cls: 'bg-text-muted/20 text-text-muted' },
}

function Badge({ status }: { status: string }) {
  const cfg = statusBadge[status] ?? { label: status, cls: 'bg-bg-hover text-text-muted' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

function shortPath(p: string | undefined): string {
  if (!p) return '-'
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
}

export default function DashboardView() {
  const { sessions, load: loadSessions, select: selectSession } = useSessionStore()
  const setShowCreator = useUIStore(s => s.setShowNewSessionDialog)

  const refresh = useCallback(async () => {
    await loadSessions()
  }, [loadSessions])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 10_000)
    return () => clearInterval(timer)
  }, [refresh])

  const totalSessions = sessions.length
  const runningSessions = sessions.filter(s => s.status === 'running' || s.status === 'starting').length
  const waitingSessions = sessions.filter(s => s.status === 'waiting_input').length
  const errorSessions = sessions.filter(s => s.status === 'error').length
  const completedSessions = sessions.filter(s => s.status === 'completed').length
  const recentSessions = sessions.slice(0, 20)

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5 bg-bg-primary">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">AllBeingsFuture Dashboard</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {runningSessions > 0
              ? `${runningSessions} 个活跃会话`
              : '暂无活跃会话'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
          >
            <RefreshCw size={13} />
            刷新
          </button>
          <button
            onClick={() => setShowCreator(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 transition-colors"
          >
            <Plus size={13} />
            新建会话
          </button>
        </div>
      </div>

      {/* 统计卡片行 */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-bg-secondary border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Monitor className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs text-text-muted">总会话</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{totalSessions}</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-accent-green" />
            <span className="text-xs text-text-muted">运行中</span>
          </div>
          <div className="text-2xl font-bold text-accent-green">{runningSessions}</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <HelpCircle className="w-3.5 h-3.5 text-accent-yellow" />
            <span className="text-xs text-text-muted">等待输入</span>
          </div>
          <div className="text-2xl font-bold text-accent-yellow">{waitingSessions}</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="w-3.5 h-3.5 text-accent-red" />
            <span className="text-xs text-text-muted">异常</span>
          </div>
          <div className="text-2xl font-bold text-accent-red">{errorSessions}</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle className="w-3.5 h-3.5 text-accent-blue" />
            <span className="text-xs text-text-muted">已完成</span>
          </div>
          <div className="text-2xl font-bold text-accent-blue">{completedSessions}</div>
        </div>
      </div>

      {/* 会话列表 */}
      <section className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <MessageSquare size={14} className="text-text-muted" />
          <h2 className="text-sm font-medium text-text-primary">会话</h2>
          <span className="text-xs text-text-muted ml-auto">{sessions.length} 个</span>
        </div>

        {recentSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <MessageSquare size={32} className="mb-3 opacity-40" />
            <p className="text-sm">暂无会话</p>
            <p className="text-xs mt-1">点击右上角「新建会话」开始工作</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {recentSessions.map(session => (
              <div
                key={session.id}
                onClick={() => selectSession(session.id)}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-bg-hover cursor-pointer transition-colors"
              >
                <Circle
                  size={8}
                  className="fill-current shrink-0"
                  style={{ color: STATUS_COLORS[session.status] || '#8B949E' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary truncate">{session.name}</span>
                    <Badge status={session.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <FolderOpen size={11} />
                      {shortPath(session.workingDirectory)}
                    </span>
                    {session.providerId && (
                      <span>{session.providerId}</span>
                    )}
                  </div>
                </div>
                <span className="flex items-center gap-1 text-xs text-text-muted shrink-0">
                  <Clock size={11} />
                  {relativeTime(session.startedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

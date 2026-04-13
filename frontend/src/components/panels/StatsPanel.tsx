/**
 * 统计面板 - 当前会话活动统计（占位版，无真实 activities 数据）
 */

import { useState, useEffect, useMemo } from 'react'
import { Activity, AlertCircle, CheckCircle, Zap, Clock } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
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

export default function StatsPanel() {
  const { sessions, selectedId } = useSessionStore(useShallow((state) => ({
    sessions: state.sessions,
    selectedId: state.selectedId,
  })))
  const [duration, setDuration] = useState('-')

  const { selectedSession, runningSessions, waitingSessions, errorSessions } = useMemo(() => {
    let selectedSession: (typeof sessions)[number] | null = null
    let runningSessions = 0
    let waitingSessions = 0
    let errorSessions = 0

    for (const session of sessions) {
      if (session.id === selectedId) {
        selectedSession = session
      }
      if (session.status === 'running') runningSessions++
      if (session.status === 'waiting_input') waitingSessions++
      if (session.status === 'error') errorSessions++
    }

    return {
      selectedSession,
      runningSessions,
      waitingSessions,
      errorSessions,
    }
  }, [selectedId, sessions])

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

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-3">
      {selectedSession ? (
        <>
          <div className="p-2.5 rounded-lg bg-bg-primary border border-border">
            <div className="text-[10px] text-text-muted mb-1">当前会话</div>
            <div className="flex items-center gap-2">
              {selectedSession.status === 'error' ? (
                <AlertCircle className="w-4 h-4 text-accent-red" />
              ) : selectedSession.status === 'completed' ? (
                <CheckCircle className="w-4 h-4 text-accent-blue" />
              ) : (
                <div
                  className={`w-3 h-3 rounded-full ${selectedSession.status === 'running' ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: STATUS_COLORS[selectedSession.status || 'idle'] }}
                />
              )}
              <span className="text-sm font-medium text-text-primary">
                {STATUS_LABELS[selectedSession.status] || '-'}
              </span>
              <span className="text-xs text-text-muted ml-auto">{duration}</span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-[11px] text-text-muted">
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-accent-yellow" />
                — tokens
              </span>
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                — 事件
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-bg-primary border border-border">
            <div className="text-[10px] text-text-muted mb-2">会话信息</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Provider</span>
                <span className="text-text-primary">{selectedSession.providerId || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">工作目录</span>
                <span className="text-text-primary truncate ml-2 max-w-[160px]" title={selectedSession.workingDirectory}>
                  {selectedSession.workingDirectory?.split(/[/\\]/).slice(-2).join('/') || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">启动时间</span>
                <span className="text-text-primary">
                  {selectedSession.startedAt ? new Date(selectedSession.startedAt).toLocaleTimeString() : '-'}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border" />
        </>
      ) : (
        <div className="flex items-center justify-center h-32 text-xs text-text-muted">
          未选择会话
        </div>
      )}

      {/* 全局统计 */}
      <div className="p-2.5 rounded-lg bg-bg-primary border border-border">
        <div className="text-[10px] text-text-muted mb-2">全局概览</div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-text-primary">{sessions.length}</div>
            <div className="text-[10px] text-text-muted">总会话</div>
          </div>
          <div>
            <div className="text-lg font-bold text-accent-green">{runningSessions}</div>
            <div className="text-[10px] text-text-muted">运行中</div>
          </div>
          <div>
            <div className="text-lg font-bold text-accent-yellow">{waitingSessions}</div>
            <div className="text-[10px] text-text-muted">等待输入</div>
          </div>
          <div>
            <div className="text-lg font-bold text-accent-red">{errorSessions}</div>
            <div className="text-[10px] text-text-muted">出错</div>
          </div>
        </div>
      </div>

      <div className="text-center text-text-muted text-xs py-4">
        <Zap className="w-6 h-6 mx-auto mb-1.5 opacity-20" />
        <p>用量统计即将推出</p>
      </div>
    </div>
  )
}

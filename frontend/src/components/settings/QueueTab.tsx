import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Play, RotateCcw, Trash2, Clock, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { QueueService } from '../../../bindings/allbeingsfuture/internal/services'

interface QueueTask {
  id: string
  name: string
  type: string
  payload: string
  status: string
  assignedTo: string
  attempt: number
  maxAttempts: number
  lastError: string
  runAfter: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock size={12} />, color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', label: '等待中' },
  in_progress: { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', label: '执行中' },
  completed: { icon: <CheckCircle2 size={12} />, color: 'text-green-400 bg-green-400/10 border-green-400/20', label: '已完成' },
  failed: { icon: <XCircle size={12} />, color: 'text-red-400 bg-red-400/10 border-red-400/20', label: '失败' },
  cancelled: { icon: <AlertCircle size={12} />, color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', label: '已取消' },
}

export default function QueueTab() {
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await QueueService.List(filter, 100)
      setTasks((result as QueueTask[]) ?? [])
    } catch (e: any) {
      setError(e?.message || '加载任务列表失败')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const handleRetry = async (id: string) => {
    try {
      await QueueService.Retry(id, '')
      await loadTasks()
    } catch (e: any) {
      setError(e?.message || '重试失败')
    }
  }

  const handleComplete = async (id: string, status: string) => {
    try {
      await QueueService.Complete(id, status, '')
      await loadTasks()
    } catch (e: any) {
      setError(e?.message || '操作失败')
    }
  }

  const formatTime = (ts: string) => {
    if (!ts) return '-'
    try {
      return new Date(ts).toLocaleString('zh-CN', { hour12: false })
    } catch {
      return ts
    }
  }

  return (
    <div className="space-y-5">
      {/* 过滤和刷新 */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {['', 'pending', 'in_progress', 'completed', 'failed'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                filter === s
                  ? 'border-blue-400/40 bg-blue-500/10 text-blue-200'
                  : 'border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {s === '' ? '全部' : STATUS_META[s]?.label || s}
            </button>
          ))}
        </div>
        <button
          onClick={loadTasks}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs border border-white/10 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '总任务', value: tasks.length, color: 'text-gray-200' },
          { label: '等待中', value: tasks.filter(t => t.status === 'pending').length, color: 'text-yellow-400' },
          { label: '执行中', value: tasks.filter(t => t.status === 'in_progress').length, color: 'text-blue-400' },
          { label: '失败', value: tasks.filter(t => t.status === 'failed').length, color: 'text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
            <p className={`text-xl font-semibold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 任务列表 */}
      {tasks.length === 0 && !loading ? (
        <div className="text-center py-10 text-gray-500">
          <Clock size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">暂无任务</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const meta = STATUS_META[task.status] || STATUS_META.pending
            return (
              <div
                key={task.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${meta.color}`}>
                    {meta.icon}
                    {meta.label}
                  </span>
                  <span className="text-sm font-medium text-gray-200 truncate">{task.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{task.type}</span>
                  <span className="ml-auto text-[10px] text-gray-500">
                    {task.attempt}/{task.maxAttempts} 次
                  </span>
                </div>

                {task.lastError && (
                  <p className="mt-1.5 text-xs text-red-400/80 truncate">{task.lastError}</p>
                )}

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-600">
                    创建: {formatTime(task.createdAt)}
                    {task.assignedTo && ` · Worker: ${task.assignedTo}`}
                  </span>

                  <div className="flex gap-1.5">
                    {(task.status === 'failed' || task.status === 'pending') && (
                      <button
                        onClick={() => handleRetry(task.id)}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-yellow-400 border border-yellow-400/20 rounded-lg hover:bg-yellow-400/10 transition-colors"
                        title="重试"
                      >
                        <RotateCcw size={10} /> 重试
                      </button>
                    )}
                    {task.status === 'in_progress' && (
                      <button
                        onClick={() => handleComplete(task.id, 'cancelled', )}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-red-400 border border-red-400/20 rounded-lg hover:bg-red-400/10 transition-colors"
                        title="取消"
                      >
                        <XCircle size={10} /> 取消
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

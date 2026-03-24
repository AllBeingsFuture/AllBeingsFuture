import { useMemo, useState } from 'react'
import { ClipboardList, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionStore } from '../../../stores/sessionStore'
import { useTaskStore } from '../../../stores/taskStore'
import { useUIStore } from '../../../stores/uiStore'

interface NewTaskDialogProps {
  onClose: () => void
}

export default function NewTaskDialog({ onClose }: NewTaskDialogProps) {
  const createTask = useTaskStore((state) => state.create)
  const { sessions, selectedId } = useSessionStore(useShallow((state) => ({
    sessions: state.sessions,
    selectedId: state.selectedId,
  })))
  const setActiveView = useUIStore((state) => state.setActiveView)

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessions],
  )

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('请输入任务标题')
      return
    }

    setCreating(true)
    setError('')

    try {
      await createTask({
        title: title.trim(),
        description: description.trim(),
        status: 'todo',
        priority: 'medium',
        sessionId: selectedSession?.id || '',
        workingDirectory: selectedSession?.workingDirectory || '',
        providerId: selectedSession?.providerId || '',
      })
      setActiveView('kanban')
      onClose()
    } catch (reason: any) {
      setError(reason?.message || '创建任务失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="floating-panel" onClick={onClose}>
      <div className="surface-card w-full max-w-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
              <ClipboardList size={18} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">新建任务</h3>
              <p className="text-sm text-gray-500">快速把当前会话里的工作项推送到 Kanban。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="titlebar-button">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-2 block text-sm text-gray-400">任务标题</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：迁移 claudeops TeamsLayout"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-400">补充说明</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="补充上下文、验收标准或依赖信息。"
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/40"
            />
          </div>

          {selectedSession && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-gray-300">
              <p className="font-medium text-white">关联会话</p>
              <p className="mt-1">{selectedSession.name}</p>
              <p className="mt-1 text-xs text-gray-500">{selectedSession.workingDirectory}</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/8 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-gray-400 transition hover:text-white">
            取消
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? '创建中...' : '创建任务'}
          </button>
        </div>
      </div>
    </div>
  )
}

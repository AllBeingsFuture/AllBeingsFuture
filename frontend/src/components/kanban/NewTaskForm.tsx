import { useState, useEffect, useRef } from 'react'
import { Plus, FolderOpen, Loader2 } from 'lucide-react'
import { PRIORITIES } from './kanbanConstants'

export interface NewTaskFormProps {
  onSubmit: (data: { title: string; description: string; priority: number; workingDirectory: string }) => void
  onCancel: () => void
  submitting: boolean
}

export default function NewTaskForm({ onSubmit, onCancel, submitting }: NewTaskFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState(3)
  const [workingDirectory, setWorkingDirectory] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({ title: title.trim(), description: description.trim(), priority, workingDirectory: workingDirectory.trim() })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="rounded-lg border border-dark-border bg-dark-card p-4 shadow-lg space-y-3"
    >
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">标题 *</label>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="任务标题"
          className="w-full rounded-md border border-dark-border bg-dark-bg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="任务描述（可选）"
          rows={3}
          className="w-full rounded-md border border-dark-border bg-dark-bg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">优先级</label>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-full rounded-md border border-dark-border bg-dark-bg px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">工作目录</label>
          <div className="relative">
            <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/path/to/project"
              className="w-full rounded-md border border-dark-border bg-dark-bg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-dark-border/50 transition-colors disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              创建中...
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              创建任务
            </>
          )}
        </button>
      </div>
    </form>
  )
}

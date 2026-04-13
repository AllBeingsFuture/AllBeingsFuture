import { useState } from 'react'
import { Trash2, ChevronRight, ExternalLink } from 'lucide-react'
import { truncate, getPriority, formatDate } from './kanbanConstants'
import MoveMenu from './MoveMenu'

interface TaskCardProps {
  task: any
  onMove: (id: string, status: string) => void
  onDelete: (id: string) => void
}

export default function TaskCard({ task, onMove, onDelete }: TaskCardProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const priority = getPriority(task.priority ?? 4)

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete(task.id)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  return (
    <div className="group rounded-lg border border-dark-border bg-dark-card p-3 shadow-sm hover:border-dark-border/80 hover:shadow-md transition-all duration-200">
      {/* Header: Title + Actions */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-sm font-medium text-gray-200 leading-snug line-clamp-2 flex-1">
          {task.title || '无标题'}
        </h4>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Move button */}
          <div className="relative">
            <button
              onClick={() => setShowMoveMenu(!showMoveMenu)}
              title="移动任务"
              className="rounded p-1 text-gray-500 hover:text-gray-300 hover:bg-dark-border/50 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {showMoveMenu && (
              <MoveMenu
                currentStatus={task.status}
                onMove={(status) => onMove(task.id, status)}
                onClose={() => setShowMoveMenu(false)}
              />
            )}
          </div>
          {/* Delete button */}
          <button
            onClick={handleDelete}
            title={confirmDelete ? '再次点击确认删除' : '删除任务'}
            className={`rounded p-1 transition-colors ${
              confirmDelete
                ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                : 'text-gray-500 hover:text-red-400 hover:bg-dark-border/50'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-400 leading-relaxed mb-2 line-clamp-2">
          {truncate(task.description, 120)}
        </p>
      )}

      {/* Footer: Priority + Meta */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* Priority badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${priority.color}/15 ${priority.text} border ${priority.border}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${priority.color}`} />
            {priority.label}
          </span>
          {/* Provider */}
          {task.providerId && (
            <span className="text-[10px] text-gray-500 truncate max-w-[80px]" title={task.providerId}>
              {task.providerId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Session link */}
          {task.sessionId && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-blue-400/70 hover:text-blue-400 cursor-pointer transition-colors"
              title={`会话: ${task.sessionId}`}
            >
              <ExternalLink className="h-2.5 w-2.5" />
              会话
            </span>
          )}
          {/* Date */}
          {task.createdAt && (
            <span className="text-[10px] text-gray-600">{formatDate(task.createdAt)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

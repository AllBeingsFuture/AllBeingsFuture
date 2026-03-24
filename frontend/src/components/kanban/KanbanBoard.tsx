import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useTaskStore } from '../../stores/taskStore'
import { COLUMNS } from './kanbanConstants'
import type { NewTaskFormProps } from './NewTaskForm'
import KanbanColumn from './KanbanColumn'

export default function KanbanBoard() {
  const { tasks, loading, load, create, moveTask, remove } = useTaskStore(
    useShallow((state) => ({
      tasks: state.tasks,
      loading: state.loading,
      load: state.load,
      create: state.create,
      moveTask: state.moveTask,
      remove: state.remove,
    })),
  )
  const [showNewForm, setShowNewForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initial load
  useEffect(() => {
    load()
  }, [load])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      load()
    }, 30_000)
    return () => clearInterval(interval)
  }, [load])

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, any[]> = {
      todo: [],
      in_progress: [],
      waiting: [],
      done: [],
    }
    for (const task of tasks) {
      const status = task.status ?? 'todo'
      if (grouped[status]) {
        grouped[status].push(task)
      } else {
        grouped.todo.push(task)
      }
    }
    // Sort each column: higher priority first (lower number), then by creation date
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a: any, b: any) => {
        const pa = a.priority ?? 4
        const pb = b.priority ?? 4
        if (pa !== pb) return pa - pb
        const da = a.createdAt ?? ''
        const db = b.createdAt ?? ''
        return db.localeCompare(da)
      })
    }
    return grouped
  }, [tasks])

  const handleCreateTask = useCallback(
    async (data: { title: string; description: string; priority: number; workingDirectory: string }) => {
      setSubmitting(true)
      setError(null)
      try {
        await create({
          title: data.title,
          description: data.description || undefined,
          priority: data.priority,
          status: 'todo',
          workingDirectory: data.workingDirectory || undefined,
        })
        setShowNewForm(false)
      } catch (err: any) {
        setError(err?.message ?? '创建任务失败')
      } finally {
        setSubmitting(false)
      }
    },
    [create],
  )

  const handleMove = useCallback(
    async (id: string, status: string) => {
      try {
        await moveTask(id, status)
      } catch (err: any) {
        setError(err?.message ?? '移动任务失败')
      }
    },
    [moveTask],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await remove(id)
      } catch (err: any) {
        setError(err?.message ?? '删除任务失败')
      }
    },
    [remove],
  )

  return (
    <div className="flex h-full flex-col bg-dark-bg">
      {/* Board Header */}
      <div className="flex items-center justify-between border-b border-dark-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-200">任务看板</h2>
          <span className="text-xs text-gray-500">
            共 {tasks.length} 项任务
          </span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            disabled={loading}
            className="rounded-md px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-dark-border/50 transition-colors disabled:opacity-50"
          >
            刷新
          </button>
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            新建任务
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:text-red-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Columns */}
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByStatus[column.id] ?? []}
            onMove={handleMove}
            onDelete={handleDelete}
            onNewTask={column.id === 'todo' ? () => setShowNewForm(true) : undefined}
            showNewForm={column.id === 'todo' && showNewForm}
            newFormProps={
              column.id === 'todo'
                ? {
                    onSubmit: handleCreateTask,
                    onCancel: () => setShowNewForm(false),
                    submitting,
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}

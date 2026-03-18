import { useState } from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { COLUMNS, COLUMN_STYLES } from './kanbanConstants'
import TaskCard from './TaskCard'
import NewTaskForm, { type NewTaskFormProps } from './NewTaskForm'

interface ColumnProps {
  column: (typeof COLUMNS)[number]
  tasks: any[]
  onMove: (id: string, status: string) => void
  onDelete: (id: string) => void
  onNewTask?: () => void
  showNewForm?: boolean
  newFormProps?: Omit<NewTaskFormProps, 'onSubmit' | 'onCancel'> & {
    onSubmit: NewTaskFormProps['onSubmit']
    onCancel: NewTaskFormProps['onCancel']
  }
}

export default function KanbanColumn({ column, tasks, onMove, onDelete, onNewTask, showNewForm, newFormProps }: ColumnProps) {
  const style = COLUMN_STYLES[column.color]
  const Icon = column.icon
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex flex-col min-w-[280px] max-w-[340px] flex-1">
      {/* Column Header */}
      <div
        className={`flex items-center justify-between rounded-t-lg border-t-2 ${style.accent} bg-dark-card px-3 py-2.5`}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
            />
          </button>
          <Icon className={`h-4 w-4 ${style.header}`} />
          <span className={`text-sm font-semibold ${style.header}`}>{column.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}>
            {tasks.length}
          </span>
        </div>

        {column.id === 'todo' && onNewTask && (
          <button
            onClick={onNewTask}
            className="rounded-md p-1 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
            title="新建任务"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Column Body */}
      {!collapsed && (
        <div className="flex-1 space-y-2 overflow-y-auto rounded-b-lg bg-dark-bg/50 p-2 border border-t-0 border-dark-border min-h-[200px] max-h-[calc(100vh-220px)]">
          {/* New task form (only in todo column) */}
          {showNewForm && newFormProps && <NewTaskForm {...newFormProps} />}

          {/* Task cards */}
          {tasks.length === 0 && !showNewForm ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-600">
              <Icon className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">暂无任务</p>
            </div>
          ) : (
            tasks.map((task) => (
              <TaskCard key={task.id} task={task} onMove={onMove} onDelete={onDelete} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

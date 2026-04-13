import { create } from 'zustand'
import { TaskService } from '../../bindings/allbeingsfuture/internal/services'

export interface Task {
  id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'waiting' | 'done'
  priority?: number | string
  sessionId?: string
  workingDirectory?: string
  providerId?: string
  assignedTo?: string
  createdAt: string
  updatedAt?: string
  completedAt?: string
}

interface TaskState {
  tasks: Task[]
  loading: boolean
  load: () => Promise<void>
  create: (config: Partial<Task>) => Promise<Task | null>
  update: (id: string, upd: Partial<Task>) => Promise<void>
  remove: (id: string) => Promise<void>
  moveTask: (id: string, status: string) => Promise<void>
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const tasks = await TaskService.GetAll()
      set({ tasks: tasks ?? [] })
    } finally {
      set({ loading: false })
    }
  },
  create: async (config) => {
    const task = await TaskService.Create(config)
    if (task) set(s => ({ tasks: [task, ...s.tasks] }))
    return task
  },
  update: async (id, upd) => {
    const task = await TaskService.Update(id, upd)
    if (task) {
      set(s => ({ tasks: s.tasks.map(t => t.id === id ? task : t) }))
    }
  },
  remove: async (id) => {
    await TaskService.Delete(id)
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
  },
  moveTask: async (id, status) => {
    await TaskService.Update(id, { status })
    await get().load()
  },
}))

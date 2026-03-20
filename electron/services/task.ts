/**
 * TaskService - Kanban task management
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

export interface TaskItem {
  id: string
  title: string
  description: string
  status: string
  priority: string
  sessionId: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  dueDate: string | null
  tags: string[]
  sortOrder: number
}

function rowToTask(row: any): TaskItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    sessionId: row.session_id || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    completedAt: row.completed_at || null,
    dueDate: row.due_date || null,
    tags: JSON.parse(row.tags || '[]'),
    sortOrder: row.sort_order || 0,
  }
}

export class TaskService {
  constructor(private db: Database) {}

  getAll(): TaskItem[] {
    return this.db.raw.prepare('SELECT * FROM tasks ORDER BY sort_order ASC').all().map(rowToTask)
  }

  getById(id: string): TaskItem | null {
    const row = this.db.raw.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    return row ? rowToTask(row) : null
  }

  create(data: Partial<TaskItem>): TaskItem {
    const id = uuidv4()
    const now = new Date().toISOString()
    this.db.raw.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, session_id, created_at, updated_at, tags, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.title || '', data.description || '', data.status || 'todo',
      data.priority || 'medium', data.sessionId || '', now, now,
      JSON.stringify(data.tags || []), data.sortOrder || 0)
    return this.getById(id)!
  }

  update(id: string, data: Partial<TaskItem>): void {
    const now = new Date().toISOString()
    const existing = this.getById(id)
    if (!existing) return

    this.db.raw.prepare(`
      UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?,
        session_id = ?, updated_at = ?, completed_at = ?, due_date = ?,
        tags = ?, sort_order = ?
      WHERE id = ?
    `).run(
      data.title ?? existing.title,
      data.description ?? existing.description,
      data.status ?? existing.status,
      data.priority ?? existing.priority,
      data.sessionId ?? existing.sessionId,
      now,
      data.status === 'done' ? now : (data.completedAt ?? existing.completedAt),
      data.dueDate ?? existing.dueDate,
      JSON.stringify(data.tags ?? existing.tags),
      data.sortOrder ?? existing.sortOrder,
      id,
    )
  }

  delete(id: string): void {
    this.db.raw.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }
}

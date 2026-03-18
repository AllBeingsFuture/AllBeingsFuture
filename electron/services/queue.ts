/**
 * QueueService - Task queue management
 * Replaces Go internal/services/queue.go
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

interface QueueTask {
  id: string
  name: string
  taskType: string
  payload: any
  status: 'pending' | 'claimed' | 'completed' | 'failed' | 'retrying'
  workerId: string
  retryCount: number
  maxRetries: number
  lastError: string
  createdAt: string
  claimedAt: string
  completedAt: string
}

export class QueueService {
  constructor(private db: Database) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS task_queue (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        task_type TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        worker_id TEXT NOT NULL DEFAULT '',
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        last_error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        claimed_at TEXT,
        completed_at TEXT
      )
    `)
  }

  private rowToTask(row: any): QueueTask {
    return {
      id: row.id,
      name: row.name,
      taskType: row.task_type,
      payload: JSON.parse(row.payload_json || '{}'),
      status: row.status,
      workerId: row.worker_id,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      lastError: row.last_error,
      createdAt: row.created_at,
      claimedAt: row.claimed_at || '',
      completedAt: row.completed_at || '',
    }
  }

  enqueue(name: string, taskType: string, payload: any): QueueTask {
    const id = uuidv4()
    const now = new Date().toISOString()
    this.db.raw.prepare(`
      INSERT INTO task_queue (id, name, task_type, payload_json, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(id, name, taskType, JSON.stringify(payload), now)
    return this.getById(id)!
  }

  getById(id: string): QueueTask | null {
    const row = this.db.raw.prepare('SELECT * FROM task_queue WHERE id = ?').get(id) as any
    return row ? this.rowToTask(row) : null
  }

  list(status?: string, limit: number = 50): QueueTask[] {
    let query = 'SELECT * FROM task_queue'
    const params: any[] = []
    if (status) {
      query += ' WHERE status = ?'
      params.push(status)
    }
    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)
    return (this.db.raw.prepare(query).all(...params) as any[]).map(r => this.rowToTask(r))
  }

  claimNext(workerId: string): QueueTask | null {
    const row = this.db.raw.prepare(
      "SELECT * FROM task_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
    ).get() as any
    if (!row) return null

    const now = new Date().toISOString()
    this.db.raw.prepare(
      "UPDATE task_queue SET status = 'claimed', worker_id = ?, claimed_at = ? WHERE id = ?"
    ).run(workerId, now, row.id)

    return this.getById(row.id)
  }

  complete(id: string, status: 'completed' | 'failed', lastError: string = ''): void {
    const now = new Date().toISOString()
    this.db.raw.prepare(
      'UPDATE task_queue SET status = ?, last_error = ?, completed_at = ? WHERE id = ?'
    ).run(status, lastError, now, id)
  }

  retry(id: string, lastError: string = ''): void {
    const task = this.getById(id)
    if (!task) return

    if (task.retryCount >= task.maxRetries) {
      this.complete(id, 'failed', `Max retries exceeded. Last error: ${lastError}`)
      return
    }

    this.db.raw.prepare(
      "UPDATE task_queue SET status = 'pending', retry_count = retry_count + 1, last_error = ?, worker_id = '', claimed_at = NULL WHERE id = ?"
    ).run(lastError, id)
  }
}

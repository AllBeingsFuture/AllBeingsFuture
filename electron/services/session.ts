/**
 * SessionService - manages AI chat sessions
 * Replaces Go internal/services/session.go
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

export interface SessionConfig {
  name: string
  providerId: string
  workingDirectory: string
  gitRepoPath?: string
  autoAccept?: boolean
  permissionMode?: string
  customInstructions?: string
  appendSystemPrompt?: string
  maxTurns?: number
  contextWindow?: string
  model?: string
  parentSessionId?: string
}

export interface Session {
  id: string
  name: string
  providerId: string
  workingDirectory: string
  status: string
  startedAt: string
  endedAt: string | null
  conversationId: string
  messagesJson: string
  parentSessionId: string
  worktreePath: string
  worktreeBranch: string
  worktreeBaseCommit: string
  worktreeBaseBranch: string
  worktreeSourceRepo: string
  worktreeMerged: boolean
  autoAccept: boolean
  permissionMode: string
  customInstructions: string
  appendSystemPrompt: string
  maxTurns: number
  contextWindow: string
  model: string
}

function rowToSession(row: any): Session {
  return {
    ...row,
    worktreeMerged: !!row.worktree_merged || !!row.worktreeMerged,
    autoAccept: !!row.auto_accept || !!row.autoAccept,
    startedAt: row.started_at || row.startedAt || '',
    endedAt: row.ended_at || row.endedAt || null,
    providerId: row.provider_id || row.providerId || '',
    workingDirectory: row.working_directory || row.workingDirectory || '',
    conversationId: row.conversation_id || row.conversationId || '',
    messagesJson: row.messages_json || row.messagesJson || '[]',
    parentSessionId: row.parent_session_id || row.parentSessionId || '',
    worktreePath: row.worktree_path || row.worktreePath || '',
    worktreeBranch: row.worktree_branch || row.worktreeBranch || '',
    worktreeBaseCommit: row.worktree_base_commit || row.worktreeBaseCommit || '',
    worktreeBaseBranch: row.worktree_base_branch || row.worktreeBaseBranch || '',
    worktreeSourceRepo: row.worktree_source_repo || row.worktreeSourceRepo || '',
    permissionMode: row.permission_mode || row.permissionMode || '',
    customInstructions: row.custom_instructions || row.customInstructions || '',
    appendSystemPrompt: row.append_system_prompt || row.appendSystemPrompt || '',
    maxTurns: row.max_turns || row.maxTurns || 0,
    contextWindow: row.context_window || row.contextWindow || '',
  }
}

/** Live statuses that cannot survive an app restart (no agent process remains). */
const ORPHAN_LIVE_STATUSES = ['running', 'starting', 'waiting_input'] as const

export class SessionService {
  constructor(private db: Database) {}

  getAll(): Session[] {
    const rows = this.db.raw.prepare(
      'SELECT * FROM sessions ORDER BY started_at DESC'
    ).all()
    return rows.map(rowToSession)
  }

  /**
   * After app cold start / reinstall, any session still marked as live in SQLite
   * is orphaned: the agent process is gone. Rewrite those rows to a non-live
   * status so the UI restores history only and nothing re-dispatches prompts.
   *
   * Does not launch agents or touch messages / conversation ids.
   *
   * @returns number of sessions rewritten
   */
  reconcileOrphanedLiveSessions(targetStatus = 'interrupted'): number {
    const placeholders = ORPHAN_LIVE_STATUSES.map(() => '?').join(', ')
    const result = this.db.raw.prepare(
      `UPDATE sessions SET status = ? WHERE status IN (${placeholders})`
    ).run(targetStatus, ...ORPHAN_LIVE_STATUSES) as { changes?: number }
    return Number(result?.changes ?? 0)
  }

  getById(id: string): Session | null {
    const row = this.db.raw.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    return row ? rowToSession(row) : null
  }

  create(config: SessionConfig): Session {
    const id = uuidv4()
    const now = new Date().toISOString()

    this.db.raw.prepare(`
      INSERT INTO sessions (id, name, provider_id, working_directory, status, started_at,
        auto_accept, permission_mode, custom_instructions, append_system_prompt,
        max_turns, context_window, model, parent_session_id, worktree_source_repo)
      VALUES (?, ?, ?, ?, 'idle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      config.name || 'New Session',
      config.providerId || '',
      config.workingDirectory || process.cwd(),
      now,
      config.autoAccept ? 1 : 0,
      config.permissionMode || '',
      config.customInstructions || '',
      config.appendSystemPrompt || '',
      config.maxTurns || 0,
      config.contextWindow || '',
      config.model || '',
      config.parentSessionId || '',
      config.gitRepoPath || '',
    )

    return this.getById(id)!
  }

  /**
   * All descendant session IDs under `id` at any depth (BFS), excluding `id`.
   * Used so multi-generation trees (爷爷→父亲→儿子) cascade-delete fully.
   */
  getDescendantIds(id: string): string[] {
    const all = this.getAll()
    const childrenByParent = new Map<string, string[]>()
    for (const s of all) {
      const pid = s.parentSessionId || ''
      if (!pid) continue
      let list = childrenByParent.get(pid)
      if (!list) {
        list = []
        childrenByParent.set(pid, list)
      }
      list.push(s.id)
    }
    const out: string[] = []
    const queue = [id]
    for (let i = 0; i < queue.length; i++) {
      const kids = childrenByParent.get(queue[i]!)
      if (!kids) continue
      for (const kid of kids) {
        out.push(kid)
        queue.push(kid)
      }
    }
    return out
  }

  delete(id: string): void {
    // Cascade: delete all descendants at any depth, then the session itself.
    // A single-level DELETE WHERE parent_session_id = ? leaves grandchildren
    // (parent = direct child) as orphans that surface as top-level sessions.
    const del = this.db.raw.prepare('DELETE FROM sessions WHERE id = ?')
    for (const descendantId of this.getDescendantIds(id)) {
      del.run(descendantId)
    }
    del.run(id)
  }

  end(id: string): void {
    const now = new Date().toISOString()
    this.db.raw.prepare(
      'UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?'
    ).run('completed', now, id)
  }

  reopen(id: string): void {
    this.db.raw.prepare(
      'UPDATE sessions SET status = ?, ended_at = NULL WHERE id = ?'
    ).run('running', id)
  }

  updateStatus(id: string, status: string): void {
    this.db.raw.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id)
  }

  updateName(id: string, name: string): void {
    this.db.raw.prepare('UPDATE sessions SET name = ? WHERE id = ?').run(name, id)
  }

  updateMessages(id: string, messagesJson: string): void {
    this.db.raw.prepare('UPDATE sessions SET messages_json = ? WHERE id = ?').run(messagesJson, id)
  }

  updateConversationId(id: string, conversationId: string): void {
    this.db.raw.prepare('UPDATE sessions SET conversation_id = ? WHERE id = ?').run(conversationId, id)
  }

  setWorktreeInfo(id: string, worktreePath: string, branch: string, baseCommit: string, baseBranch: string, sourceRepo: string): void {
    this.db.raw.prepare(`
      UPDATE sessions SET working_directory = ?, worktree_path = ?, worktree_branch = ?,
        worktree_base_commit = ?, worktree_base_branch = ?, worktree_source_repo = ?, worktree_merged = 0
      WHERE id = ?
    `).run(worktreePath, worktreePath, branch, baseCommit, baseBranch, sourceRepo, id)
  }

  markWorktreeMerged(id: string): void {
    this.db.raw.prepare(`
      UPDATE sessions
      SET worktree_merged = 1,
          working_directory = CASE
            WHEN worktree_source_repo IS NOT NULL AND worktree_source_repo != '' THEN worktree_source_repo
            ELSE working_directory
          END
      WHERE id = ?
    `).run(id)
  }

  markWorktreeMergedByRepoAndBranch(sourceRepo: string, branch: string): void {
    this.db.raw.prepare(`
      UPDATE sessions
      SET worktree_merged = 1,
          working_directory = CASE
            WHEN worktree_source_repo IS NOT NULL AND worktree_source_repo != '' THEN worktree_source_repo
            ELSE working_directory
          END
      WHERE worktree_source_repo = ? AND worktree_branch = ?
    `).run(sourceRepo, branch)
  }
}

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

export class SessionService {
  constructor(private db: Database) {}

  getAll(): Session[] {
    const rows = this.db.raw.prepare(
      'SELECT * FROM sessions ORDER BY started_at DESC'
    ).all()
    return rows.map(rowToSession)
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
        max_turns, context_window, model, parent_session_id)
      VALUES (?, ?, ?, ?, 'idle', ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    )

    return this.getById(id)!
  }

  delete(id: string): void {
    // Cascade: delete all child sessions first
    this.db.raw.prepare('DELETE FROM sessions WHERE parent_session_id = ?').run(id)
    this.db.raw.prepare('DELETE FROM sessions WHERE id = ?').run(id)
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
    this.db.raw.prepare('UPDATE sessions SET worktree_merged = 1 WHERE id = ?').run(id)
  }
}

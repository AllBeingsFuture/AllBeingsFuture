/**
 * Startup reconciliation: orphaned live session statuses must become non-live
 * after app restart without launching agents or rewriting messages.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { StatementSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'
import { SessionService } from '../services/session.js'

class StmtCompat {
  constructor(private readonly statement: StatementSync) {}
  run(...params: unknown[]): unknown {
    return this.statement.run(...(params as SQLInputValue[]))
  }
  get(...params: unknown[]): unknown {
    return this.statement.get(...(params as SQLInputValue[]))
  }
  all(...params: unknown[]): unknown[] {
    return this.statement.all(...(params as SQLInputValue[])) as unknown[]
  }
}

function createDbCompat(db: DatabaseSync) {
  return {
    prepare: (sql: string) => new StmtCompat(db.prepare(sql)),
    exec: (sql: string) => { db.exec(sql) },
  }
}

function createSessionsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      provider_id TEXT NOT NULL DEFAULT '',
      working_directory TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'idle',
      started_at TEXT NOT NULL DEFAULT '',
      ended_at TEXT,
      conversation_id TEXT NOT NULL DEFAULT '',
      messages_json TEXT NOT NULL DEFAULT '[]',
      parent_session_id TEXT NOT NULL DEFAULT '',
      worktree_path TEXT NOT NULL DEFAULT '',
      worktree_branch TEXT NOT NULL DEFAULT '',
      worktree_base_commit TEXT NOT NULL DEFAULT '',
      worktree_base_branch TEXT NOT NULL DEFAULT '',
      worktree_source_repo TEXT NOT NULL DEFAULT '',
      worktree_merged INTEGER NOT NULL DEFAULT 0,
      auto_accept INTEGER NOT NULL DEFAULT 0,
      permission_mode TEXT NOT NULL DEFAULT '',
      custom_instructions TEXT NOT NULL DEFAULT '',
      append_system_prompt TEXT NOT NULL DEFAULT '',
      max_turns INTEGER NOT NULL DEFAULT 0,
      context_window TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT ''
    );
  `)
}

function insertSession(
  db: DatabaseSync,
  row: { id: string; status: string; messagesJson?: string; conversationId?: string },
) {
  db.prepare(`
    INSERT INTO sessions (id, name, provider_id, working_directory, status, started_at, conversation_id, messages_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    `Session ${row.id}`,
    'codex',
    '/tmp/work',
    row.status,
    '2026-01-01T00:00:00.000Z',
    row.conversationId ?? `conv-${row.id}`,
    row.messagesJson ?? JSON.stringify([{ role: 'user', content: 'do the work' }]),
  )
}

function createSessionService() {
  const raw = new DatabaseSync(':memory:')
  createSessionsSchema(raw)
  const db = { raw: createDbCompat(raw) } as unknown as ConstructorParameters<typeof SessionService>[0]
  return { service: new SessionService(db), raw }
}

test('reconcileOrphanedLiveSessions rewrites running/starting/waiting_input to interrupted', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 's-running', status: 'running' })
  insertSession(raw, { id: 's-starting', status: 'starting' })
  insertSession(raw, { id: 's-waiting', status: 'waiting_input' })
  insertSession(raw, { id: 's-idle', status: 'idle' })
  insertSession(raw, { id: 's-completed', status: 'completed' })
  insertSession(raw, { id: 's-error', status: 'error' })

  const rewritten = service.reconcileOrphanedLiveSessions('interrupted')
  assert.equal(rewritten, 3)

  const byId = Object.fromEntries(service.getAll().map((s) => [s.id, s.status]))
  assert.equal(byId['s-running'], 'interrupted')
  assert.equal(byId['s-starting'], 'interrupted')
  assert.equal(byId['s-waiting'], 'interrupted')
  assert.equal(byId['s-idle'], 'idle')
  assert.equal(byId['s-completed'], 'completed')
  assert.equal(byId['s-error'], 'error')
})

test('reconcileOrphanedLiveSessions preserves messages and conversation ids (history only)', () => {
  const { service, raw } = createSessionService()
  const messagesJson = JSON.stringify([
    { role: 'user', content: 'prior prompt that must not re-run' },
    { role: 'assistant', content: 'partial answer' },
  ])
  insertSession(raw, {
    id: 's-hist',
    status: 'running',
    conversationId: 'acp-session-xyz',
    messagesJson,
  })

  const rewritten = service.reconcileOrphanedLiveSessions()
  assert.equal(rewritten, 1)

  const session = service.getById('s-hist')
  assert.ok(session)
  assert.equal(session!.status, 'interrupted')
  assert.equal(session!.conversationId, 'acp-session-xyz')
  assert.equal(session!.messagesJson, messagesJson)
})

test('reconcileOrphanedLiveSessions is a no-op when no live orphan rows exist', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 's-idle', status: 'idle' })
  insertSession(raw, { id: 's-done', status: 'completed' })

  const rewritten = service.reconcileOrphanedLiveSessions()
  assert.equal(rewritten, 0)
  assert.equal(service.getById('s-idle')?.status, 'idle')
  assert.equal(service.getById('s-done')?.status, 'completed')
})

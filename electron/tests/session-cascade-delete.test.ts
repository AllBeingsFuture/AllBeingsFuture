/**
 * Session cascade delete: multi-level parent_session_id trees and orphan purge.
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
  row: {
    id: string
    status?: string
    parentSessionId?: string
    messagesJson?: string
    conversationId?: string
  },
) {
  db.prepare(`
    INSERT INTO sessions (
      id, name, provider_id, working_directory, status, started_at,
      conversation_id, messages_json, parent_session_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    `Session ${row.id}`,
    'codex',
    '/tmp/work',
    row.status ?? 'idle',
    '2026-01-01T00:00:00.000Z',
    row.conversationId ?? `conv-${row.id}`,
    row.messagesJson ?? JSON.stringify([{ role: 'user', content: 'do the work' }]),
    row.parentSessionId ?? '',
  )
}

function createSessionService() {
  const raw = new DatabaseSync(':memory:')
  createSessionsSchema(raw)
  const db = { raw: createDbCompat(raw) } as unknown as ConstructorParameters<typeof SessionService>[0]
  return { service: new SessionService(db), raw }
}

function seedGrandfatherFatherSon(raw: DatabaseSync) {
  // G → F → S
  insertSession(raw, { id: 'G', status: 'idle' })
  insertSession(raw, { id: 'F', status: 'idle', parentSessionId: 'G' })
  insertSession(raw, { id: 'S', status: 'idle', parentSessionId: 'F' })
}

test('delete(G) removes entire G→F→S tree', () => {
  const { service, raw } = createSessionService()
  seedGrandfatherFatherSon(raw)

  service.delete('G')

  assert.equal(service.getById('G'), null)
  assert.equal(service.getById('F'), null)
  assert.equal(service.getById('S'), null)
  assert.equal(service.getAll().length, 0)
})

test('delete(F) removes S but leaves G', () => {
  const { service, raw } = createSessionService()
  seedGrandfatherFatherSon(raw)

  service.delete('F')

  assert.ok(service.getById('G'))
  assert.equal(service.getById('F'), null)
  assert.equal(service.getById('S'), null)
  assert.equal(service.getAll().length, 1)
  assert.equal(service.getAll()[0]!.id, 'G')
})

test('getDescendantSessionIds(G) returns F and S', () => {
  const { service, raw } = createSessionService()
  seedGrandfatherFatherSon(raw)

  const descendants = service.getDescendantSessionIds('G')
  assert.equal(descendants.length, 2)
  assert.ok(descendants.includes('F'))
  assert.ok(descendants.includes('S'))
  assert.ok(!descendants.includes('G'))
})

test('getDescendantSessionIds(F) returns only S', () => {
  const { service, raw } = createSessionService()
  seedGrandfatherFatherSon(raw)

  const descendants = service.getDescendantSessionIds('F')
  assert.deepEqual(descendants, ['S'])
})

test('purgeOrphanChildSessions removes rows whose parent is missing', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 'alive', status: 'idle' })
  insertSession(raw, { id: 'orphan', status: 'idle', parentSessionId: 'missing-parent' })

  const deleted = service.purgeOrphanChildSessions()
  assert.equal(deleted, 1)
  assert.equal(service.getById('orphan'), null)
  assert.ok(service.getById('alive'))
})

test('purgeOrphanChildSessions clears multi-level orphan chains', () => {
  const { service, raw } = createSessionService()
  // parent missing → orphan-mid → orphan-leaf
  insertSession(raw, { id: 'orphan-mid', status: 'idle', parentSessionId: 'gone' })
  insertSession(raw, { id: 'orphan-leaf', status: 'idle', parentSessionId: 'orphan-mid' })
  insertSession(raw, { id: 'root', status: 'idle' })

  const deleted = service.purgeOrphanChildSessions()
  assert.equal(deleted, 2)
  assert.equal(service.getById('orphan-mid'), null)
  assert.equal(service.getById('orphan-leaf'), null)
  assert.ok(service.getById('root'))
})

test('purgeOrphanChildSessions is a no-op when no orphans exist', () => {
  const { service, raw } = createSessionService()
  seedGrandfatherFatherSon(raw)

  const deleted = service.purgeOrphanChildSessions()
  assert.equal(deleted, 0)
  assert.equal(service.getAll().length, 3)
})

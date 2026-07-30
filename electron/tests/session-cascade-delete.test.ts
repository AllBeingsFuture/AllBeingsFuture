/**
 * DB-layer cascade delete for sessions: multi-level descendants + orphan purge.
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
    INSERT INTO sessions (id, name, provider_id, working_directory, status, started_at, conversation_id, messages_json, parent_session_id)
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

function idsOf(service: SessionService): string[] {
  return service.getAll().map((s) => s.id).sort()
}

test('delete(G) removes entire G→F→S tree', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 'G' })
  insertSession(raw, { id: 'F', parentSessionId: 'G' })
  insertSession(raw, { id: 'S', parentSessionId: 'F' })
  insertSession(raw, { id: 'other' })

  service.delete('G')

  assert.deepEqual(idsOf(service), ['other'])
  assert.equal(service.getById('G'), null)
  assert.equal(service.getById('F'), null)
  assert.equal(service.getById('S'), null)
})

test('delete(F) removes S, leaves G', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 'G' })
  insertSession(raw, { id: 'F', parentSessionId: 'G' })
  insertSession(raw, { id: 'S', parentSessionId: 'F' })

  service.delete('F')

  assert.deepEqual(idsOf(service), ['G'])
  assert.ok(service.getById('G'))
  assert.equal(service.getById('F'), null)
  assert.equal(service.getById('S'), null)
})

test('getDescendantSessionIds is BFS, excludes self, includes multi-level', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 'G' })
  insertSession(raw, { id: 'F', parentSessionId: 'G' })
  insertSession(raw, { id: 'S1', parentSessionId: 'F' })
  insertSession(raw, { id: 'S2', parentSessionId: 'F' })
  insertSession(raw, { id: 'orphan-branch', parentSessionId: 'missing' })

  const descendants = service.getDescendantSessionIds('G')
  assert.equal(descendants.includes('G'), false)
  assert.deepEqual([...descendants].sort(), ['F', 'S1', 'S2'])

  const fromF = service.getDescendantSessionIds('F')
  assert.deepEqual([...fromF].sort(), ['S1', 'S2'])

  assert.deepEqual(service.getDescendantSessionIds('S1'), [])
  assert.deepEqual(service.getDescendantSessionIds('missing-root'), [])
})

test('purgeOrphanChildSessions removes single-level orphans', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 'alive' })
  insertSession(raw, { id: 'orphan-a', parentSessionId: 'gone-parent' })
  insertSession(raw, { id: 'orphan-b', parentSessionId: 'also-gone' })
  insertSession(raw, { id: 'child-of-alive', parentSessionId: 'alive' })

  const deleted = service.purgeOrphanChildSessions()
  assert.equal(deleted, 2)
  assert.deepEqual(idsOf(service), ['alive', 'child-of-alive'])
})

test('purgeOrphanChildSessions cascades multi-level orphan chain', () => {
  const { service, raw } = createSessionService()
  // A is missing; B points at A; C points at B — iterative purge removes B then C
  insertSession(raw, { id: 'B', parentSessionId: 'A' })
  insertSession(raw, { id: 'C', parentSessionId: 'B' })
  insertSession(raw, { id: 'keep' })

  const deleted = service.purgeOrphanChildSessions()
  assert.equal(deleted, 2)
  assert.deepEqual(idsOf(service), ['keep'])
  assert.equal(service.getById('B'), null)
  assert.equal(service.getById('C'), null)
})

test('purgeOrphanChildSessions is a no-op when no orphans', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 'G' })
  insertSession(raw, { id: 'F', parentSessionId: 'G' })
  insertSession(raw, { id: 'S', parentSessionId: 'F' })

  const deleted = service.purgeOrphanChildSessions()
  assert.equal(deleted, 0)
  assert.deepEqual(idsOf(service), ['F', 'G', 'S'])
})

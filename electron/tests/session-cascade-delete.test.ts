/**
 * Cascade delete: deleting a parent must remove direct children AND grandchildren
 * so orphaned sub-agent sessions never surface as top-level after parent delete.
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
  row: { id: string; parentSessionId?: string; name?: string },
) {
  db.prepare(`
    INSERT INTO sessions (id, name, provider_id, working_directory, status, started_at, parent_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.name ?? `Session ${row.id}`,
    'codex',
    '/tmp/work',
    'idle',
    '2026-01-01T00:00:00.000Z',
    row.parentSessionId ?? '',
  )
}

function createSessionService() {
  const raw = new DatabaseSync(':memory:')
  createSessionsSchema(raw)
  const db = { raw: createDbCompat(raw) } as unknown as ConstructorParameters<typeof SessionService>[0]
  return { service: new SessionService(db), raw }
}

test('getDescendantIds returns direct children and grandchildren (BFS)', () => {
  const { service, raw } = createSessionService()
  // 爷爷 → 父亲 → 儿子; also sibling under 爷爷
  insertSession(raw, { id: 'grandpa' })
  insertSession(raw, { id: 'father', parentSessionId: 'grandpa' })
  insertSession(raw, { id: 'uncle', parentSessionId: 'grandpa' })
  insertSession(raw, { id: 'son', parentSessionId: 'father' })
  insertSession(raw, { id: 'other-top' }) // unrelated top-level

  const ids = service.getDescendantIds('grandpa')
  assert.deepEqual(new Set(ids), new Set(['father', 'uncle', 'son']))
  assert.equal(ids.includes('grandpa'), false)
  assert.equal(ids.includes('other-top'), false)
  // BFS: direct children before grandchild
  assert.ok(ids.indexOf('father') < ids.indexOf('son'))
  assert.ok(ids.indexOf('uncle') < ids.indexOf('son') || ids.indexOf('uncle') > ids.indexOf('father'))
})

test('delete cascades to direct children and grandchildren', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 'grandpa' })
  insertSession(raw, { id: 'father', parentSessionId: 'grandpa' })
  insertSession(raw, { id: 'son', parentSessionId: 'father' })
  insertSession(raw, { id: 'other-top' })

  service.delete('grandpa')

  const remaining = service.getAll().map((s) => s.id)
  assert.deepEqual(remaining, ['other-top'])
  assert.equal(service.getById('grandpa'), null)
  assert.equal(service.getById('father'), null)
  assert.equal(service.getById('son'), null)
})

test('delete of mid-level parent removes its subtree only', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 'grandpa' })
  insertSession(raw, { id: 'father', parentSessionId: 'grandpa' })
  insertSession(raw, { id: 'son', parentSessionId: 'father' })
  insertSession(raw, { id: 'uncle', parentSessionId: 'grandpa' })

  service.delete('father')

  const remaining = new Set(service.getAll().map((s) => s.id))
  assert.deepEqual(remaining, new Set(['grandpa', 'uncle']))
  assert.equal(service.getById('son'), null)
})

test('delete leaf only removes that session', () => {
  const { service, raw } = createSessionService()
  insertSession(raw, { id: 'parent' })
  insertSession(raw, { id: 'child', parentSessionId: 'parent' })

  service.delete('child')

  assert.equal(service.getById('child'), null)
  assert.ok(service.getById('parent'))
})

/**
 * MCPService defaults: new/synced servers start disabled; seed/sync must not
 * re-enable user-disabled rows; servers stay listed for opt-in.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import {
  MCPService,
  MCP_DEFAULT_IS_ENABLED,
} from '../services/mcp.js'

type FakeDb = { raw: ReturnType<typeof wrapSqlite> }

function wrapSqlite(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      return {
        run: (...params: unknown[]) => stmt.run(...(params as any[])),
        get: (...params: unknown[]) => stmt.get(...(params as any[])),
        all: (...params: unknown[]) => stmt.all(...(params as any[])) as unknown[],
      }
    },
    exec: (sql: string) => db.exec(sql),
  }
}

function createMcpSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      command TEXT NOT NULL DEFAULT '',
      args_json TEXT NOT NULL DEFAULT '[]',
      env_json TEXT NOT NULL DEFAULT '{}',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

async function withService(
  fn: (ctx: {
    service: MCPService
    db: DatabaseSync
    mcpsDir: string
    dir: string
  }) => Promise<void> | void,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'abf-mcp-'))
  const dbPath = path.join(dir, 'test.db')
  const mcpsDir = path.join(dir, 'mcps')
  try {
    const db = new DatabaseSync(dbPath)
    createMcpSchema(db)
    const fakeDb = { raw: wrapSqlite(db) } as unknown as FakeDb
    const service = new MCPService(fakeDb as any, {
      getMcpsDir: () => mcpsDir,
    })
    await fn({ service, db, mcpsDir, dir })
    db.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function writeBuiltin(
  mcpsDir: string,
  id: string,
  meta: { serverIdentifier: string; serverName: string; serverDescription?: string },
): Promise<void> {
  const serverDir = path.join(mcpsDir, id)
  await mkdir(serverDir, { recursive: true })
  await writeFile(
    path.join(serverDir, 'SERVER_METADATA.json'),
    JSON.stringify({
      serverIdentifier: meta.serverIdentifier,
      serverName: meta.serverName,
      serverDescription: meta.serverDescription || '',
      command: 'node',
      args: ['server.mjs'],
    }),
    'utf8',
  )
}

function rowEnabled(db: DatabaseSync, id: string): number | undefined {
  const row = db.prepare('SELECT is_enabled FROM mcp_servers WHERE id = ?').get(id) as
    | { is_enabled: number }
    | undefined
  return row?.is_enabled
}

test('MCP_DEFAULT_IS_ENABLED is opt-in (disabled)', () => {
  assert.equal(MCP_DEFAULT_IS_ENABLED, 0)
})

test('install inserts new servers as disabled', async () => {
  await withService(({ service, db }) => {
    const installed = service.install({
      id: 'custom-search',
      name: 'Custom Search',
      description: 'demo',
      command: 'node',
      args: ['x.js'],
      env: {},
    })

    assert.equal(installed.isEnabled, false)
    assert.equal(installed.enabled, false)
    assert.equal(rowEnabled(db, 'custom-search'), 0)
  })
})

test('seedBuiltins inserts discovered servers as disabled and keeps them listed', async () => {
  await withService(async ({ service, db, mcpsDir }) => {
    await writeBuiltin(mcpsDir, 'web-search', {
      serverIdentifier: 'web-search',
      serverName: 'Web Search',
      serverDescription: 'search',
    })
    await writeBuiltin(mcpsDir, 'agent-control', {
      serverIdentifier: 'agent-control',
      serverName: 'Agent Control',
    })

    service.seedBuiltins()

    assert.equal(rowEnabled(db, 'builtin-web-search'), 0)
    assert.equal(rowEnabled(db, 'builtin-agent-control'), 0)

    const listed = service.list()
    const ids = listed.map((s: any) => s.id).sort()
    assert.deepEqual(ids, ['builtin-agent-control', 'builtin-web-search'])
    assert.ok(listed.every((s: any) => s.isEnabled === false))

    // Opt-in path: enabled configs stay empty until toggle
    assert.deepEqual(service.getEnabledServerConfigs(), {})
  })
})

test('seed/sync updates metadata without re-enabling user-disabled servers', async () => {
  await withService(async ({ service, db, mcpsDir }) => {
    await writeBuiltin(mcpsDir, 'web-search', {
      serverIdentifier: 'web-search',
      serverName: 'Web Search v1',
      serverDescription: 'old',
    })

    service.seedBuiltins()
    assert.equal(rowEnabled(db, 'builtin-web-search'), 0)

    // User enables, then disables (opt-in then opt-out)
    service.toggleEnabled('builtin-web-search', true)
    assert.equal(rowEnabled(db, 'builtin-web-search'), 1)
    service.toggleEnabled('builtin-web-search', false)
    assert.equal(rowEnabled(db, 'builtin-web-search'), 0)

    // Metadata changes on disk; sync must refresh fields but not re-enable
    await writeBuiltin(mcpsDir, 'web-search', {
      serverIdentifier: 'web-search',
      serverName: 'Web Search v2',
      serverDescription: 'updated',
    })

    service.seedBuiltins()

    const row = db.prepare('SELECT name, description, is_enabled FROM mcp_servers WHERE id = ?')
      .get('builtin-web-search') as { name: string; description: string; is_enabled: number }

    assert.equal(row.name, 'Web Search v2')
    assert.equal(row.description, 'updated')
    assert.equal(row.is_enabled, 0, 'user-disabled flag must survive seed/sync')
  })
})

test('seed/sync preserves user-enabled servers as enabled', async () => {
  await withService(async ({ service, db, mcpsDir }) => {
    await writeBuiltin(mcpsDir, 'web-search', {
      serverIdentifier: 'web-search',
      serverName: 'Web Search',
    })

    service.seedBuiltins()
    service.toggleEnabled('builtin-web-search', true)
    assert.equal(rowEnabled(db, 'builtin-web-search'), 1)

    await writeBuiltin(mcpsDir, 'web-search', {
      serverIdentifier: 'web-search',
      serverName: 'Web Search Renamed',
    })
    service.seedBuiltins()

    assert.equal(rowEnabled(db, 'builtin-web-search'), 1, 'user-enabled flag preserved')
    const row = db.prepare('SELECT name FROM mcp_servers WHERE id = ?')
      .get('builtin-web-search') as { name: string }
    assert.equal(row.name, 'Web Search Renamed')
  })
})

test('re-install of existing server does not flip is_enabled', async () => {
  await withService(({ service, db }) => {
    service.install({
      id: 'custom-a',
      name: 'A',
      command: 'node',
      args: [],
    })
    service.toggleEnabled('custom-a', true)

    service.install({
      id: 'custom-a',
      name: 'A renamed',
      command: 'node',
      args: ['new.js'],
    })

    const row = db.prepare('SELECT name, args_json, is_enabled FROM mcp_servers WHERE id = ?')
      .get('custom-a') as { name: string; args_json: string; is_enabled: number }

    assert.equal(row.name, 'A renamed')
    assert.equal(row.args_json, JSON.stringify(['new.js']))
    assert.equal(row.is_enabled, 1, 'ON CONFLICT must not reset enabled state')
  })
})

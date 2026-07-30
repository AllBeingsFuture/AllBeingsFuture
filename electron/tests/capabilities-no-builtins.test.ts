/**
 * Product guard: no pre-seeded / auto-discovered built-in skills or MCP servers.
 * seed/list must yield zero builtins; purge removes legacy seeded rows.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { StatementSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'

const compiledDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(compiledDir, '../../..')
const electronRoot = path.join(workspaceRoot, 'electron')

// --- lightweight DB compat matching Database.raw used by services ---

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

function createSkillsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL DEFAULT '{}',
      slash_command TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'prompt',
      source TEXT NOT NULL DEFAULT 'custom',
      prompt_template TEXT NOT NULL DEFAULT '',
      system_prompt_addition TEXT NOT NULL DEFAULT '',
      input_variables_json TEXT NOT NULL DEFAULT '[]',
      compatible_providers TEXT NOT NULL DEFAULT 'all',
      version TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `)
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
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `)
}

// ---------------------------------------------------------------------------
// Source / packaging guards
// ---------------------------------------------------------------------------

test('BUILTIN_SKILLS catalog is empty', async () => {
  const source = readFileSync(path.join(electronRoot, 'services/builtin-skills.ts'), 'utf8')
  assert.match(source, /export const BUILTIN_SKILLS:\s*SkillDef\[\]\s*=\s*\[\]/)
  assert.equal(source.includes("id: 'builtin-"), false, 'must not define builtin skill entries')
})

test('SkillService does not discover or reinstall embedded catalogs on list/seed', () => {
  const source = readFileSync(path.join(electronRoot, 'services/skill.ts'), 'utf8')
  assert.equal(source.includes('discoverFilesystemSkills'), false)
  assert.equal(source.includes('syncSkillRegistry'), false)
  assert.equal(source.includes('from \'./builtin-skills.js\''), true)
  assert.match(source, /purgeSeededSkills|DELETE FROM skills/)
  assert.match(source, /seedBuiltins\(\):\s*void\s*\{[\s\S]*purgeSeededSkills/)
})

test('MCPService does not discover or reinstall embedded catalogs on list/seed', () => {
  const source = readFileSync(path.join(electronRoot, 'services/mcp.ts'), 'utf8')
  assert.equal(source.includes('discoverBuiltins'), false)
  assert.equal(source.includes('syncBuiltinsInternal'), false)
  assert.match(source, /purgeSeededBuiltins|DELETE FROM mcp_servers/)
  assert.match(source, /seedBuiltins\(\):\s*void\s*\{[\s\S]*purgeSeededBuiltins/)
})

test('package.json does not ship skill catalog or full MCP catalog as extraResources', () => {
  const pkg = JSON.parse(readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'))
  const resources: Array<{ from: string; to: string }> = pkg.build?.extraResources || []
  const froms = resources.map(r => r.from)
  assert.equal(
    froms.some(f => f === 'electron/embedded-assets/skills' || f.endsWith('/skills')),
    false,
    'skills catalog must not be packaged',
  )
  assert.equal(
    froms.some(f => f === 'electron/embedded-assets/mcps'),
    false,
    'full mcps dir must not be packaged; only agent-control if needed',
  )
  // Internal agent-control / mempalace-safe runtimes may still be packaged.
  const agentControl = froms.find(f => f.includes('agent-control'))
  assert.ok(agentControl, 'agent-control internal runtime should remain packaged')
  const mempalaceSafe = froms.find(f => f.includes('mempalace-safe'))
  assert.ok(mempalaceSafe, 'mempalace-safe internal proxy should remain packaged')
})

test('embedded skills directory has no SKILL.md catalog entries', () => {
  const skillsDir = path.join(electronRoot, 'embedded-assets/skills')
  assert.ok(existsSync(skillsDir))
  const walk = (dir: string): string[] => {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (entry.name === 'SKILL.md') out.push(full)
    }
    return out
  }
  assert.deepEqual(walk(skillsDir), [], 'no embedded SKILL.md files should remain')
})

test('embedded mcps has no user-facing catalog servers (only internal runtimes)', () => {
  const mcpsDir = path.join(electronRoot, 'embedded-assets/mcps')
  assert.ok(existsSync(mcpsDir))
  const dirs = readdirSync(mcpsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
  assert.deepEqual(
    dirs,
    ['agent-control', 'mempalace-safe'],
    'only internal agent-control + mempalace-safe may remain under mcps',
  )
  assert.equal(existsSync(path.join(mcpsDir, 'chrome-devtools')), false)
  assert.equal(existsSync(path.join(mcpsDir, 'web-search')), false)
})

// ---------------------------------------------------------------------------
// Runtime purge / list behavior (in-memory sqlite + service classes)
// ---------------------------------------------------------------------------

test('SkillService seedBuiltins purges builtins/local and leaves custom skills', async () => {
  // Dynamic import after ensuring compiled path is not required: tests run on compiled JS.
  // Import from compiled sibling services when available; fall back to direct path logic.
  const { SkillService } = await import('../services/skill.js')

  const db = new DatabaseSync(':memory:')
  createSkillsSchema(db)
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO skills (id, name, is_builtin, source, is_enabled, created_at, updated_at)
    VALUES
      ('builtin-code-review', 'Code Review', 1, 'builtin', 1, ?, ?),
      ('local-docx', 'Docx', 0, 'local', 1, ?, ?),
      ('local-system/foo', 'Sys', 0, 'local', 1, ?, ?),
      ('user-custom-1', 'My Skill', 0, 'custom', 1, ?, ?)
  `).run(now, now, now, now, now, now, now, now)

  const service = new SkillService({ raw: createDbCompat(db) } as any)
  service.seedBuiltins()

  const rows = (db.prepare('SELECT id, source FROM skills ORDER BY id').all() as Array<{ id: string; source: string }>)
    .map(r => ({ id: r.id, source: r.source }))
  assert.deepEqual(rows, [{ id: 'user-custom-1', source: 'custom' }])

  const listed = service.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.id, 'user-custom-1')
  assert.equal(listed.every(s => s.source !== 'builtin' && s.source !== 'local'), true)
  db.close()
})

test('SkillService list on empty DB yields zero skills (no auto-seed)', async () => {
  const { SkillService } = await import('../services/skill.js')
  const db = new DatabaseSync(':memory:')
  createSkillsSchema(db)
  const service = new SkillService({ raw: createDbCompat(db) } as any)
  service.seedBuiltins()
  assert.deepEqual(service.list(), [])
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS c FROM skills').get() as { c: number }).c,
    0,
  )
  db.close()
})

test('SkillService install still works for custom skills after purge', async () => {
  const { SkillService } = await import('../services/skill.js')
  const db = new DatabaseSync(':memory:')
  createSkillsSchema(db)
  const service = new SkillService({ raw: createDbCompat(db) } as any)
  service.seedBuiltins()

  const installed = service.install({
    id: 'custom-hello',
    name: 'Hello',
    description: 'Say hi',
    slashCommand: 'hello',
    type: 'prompt',
    promptTemplate: 'Hello {{user_input}}',
    source: 'custom',
  })
  assert.ok(installed)
  assert.equal(installed?.id, 'custom-hello')
  assert.equal(installed?.source, 'custom')
  assert.equal(service.list().length, 1)

  service.toggleEnabled('custom-hello', false)
  const row = db.prepare('SELECT is_enabled FROM skills WHERE id = ?').get('custom-hello') as { is_enabled: number }
  assert.equal(row.is_enabled, 0)
  db.close()
})

test('MCPService seedBuiltins purges builtin-* rows and leaves custom servers', async () => {
  const { MCPService } = await import('../services/mcp.js')
  const db = new DatabaseSync(':memory:')
  createMcpSchema(db)
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO mcp_servers (id, name, command, is_enabled, created_at, updated_at)
    VALUES
      ('builtin-web-search', 'Web Search', 'node', 1, ?, ?),
      ('builtin-agent-control', 'Agent Control', 'node', 1, ?, ?),
      ('custom-my-mcp', 'My MCP', 'npx', 1, ?, ?)
  `).run(now, now, now, now, now, now)

  const service = new MCPService({ raw: createDbCompat(db) } as any)
  service.seedBuiltins()

  const rows = (db.prepare('SELECT id FROM mcp_servers ORDER BY id').all() as Array<{ id: string }>)
    .map(r => ({ id: r.id }))
  assert.deepEqual(rows, [{ id: 'custom-my-mcp' }])

  const listed = service.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.id, 'custom-my-mcp')
  assert.equal(listed[0]?.source, 'custom')
  db.close()
})

test('MCPService list on empty DB yields zero servers (no auto-seed)', async () => {
  const { MCPService } = await import('../services/mcp.js')
  const db = new DatabaseSync(':memory:')
  createMcpSchema(db)
  const service = new MCPService({ raw: createDbCompat(db) } as any)
  service.seedBuiltins()
  assert.deepEqual(service.list(), [])
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS c FROM mcp_servers').get() as { c: number }).c,
    0,
  )
  db.close()
})

test('MCPService install/toggle still works for custom servers after purge', async () => {
  const { MCPService } = await import('../services/mcp.js')
  const db = new DatabaseSync(':memory:')
  createMcpSchema(db)
  const service = new MCPService({ raw: createDbCompat(db) } as any)
  service.seedBuiltins()

  const installed = service.install({
    id: 'custom-search',
    name: 'Search',
    description: 'Search tools',
    command: 'node',
    args: ['server.js'],
  })
  assert.ok(installed)
  assert.equal(installed?.id, 'custom-search')
  assert.equal(service.list().length, 1)

  service.toggleEnabled('custom-search', false)
  const row = db.prepare('SELECT is_enabled FROM mcp_servers WHERE id = ?').get('custom-search') as { is_enabled: number }
  assert.equal(row.is_enabled, 0)

  assert.throws(
    () => service.install({ id: 'builtin-evil', name: 'Nope', command: 'node' }),
    /Built-in MCP catalog is disabled/,
  )
  db.close()
})

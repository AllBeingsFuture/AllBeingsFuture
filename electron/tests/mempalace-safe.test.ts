/**
 * MemPalace safe proxy: write lock serialization + config wrap detection.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  applyMempalaceSafeProxy,
  isMempalaceSafeWrapped,
  isMempalaceServer,
  wrapMempalaceConfigIfNeeded,
} from '../services/mempalace-safe.js'

const compiledDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(compiledDir, '../../..')
const proxyDir = path.join(workspaceRoot, 'electron/embedded-assets/mcps/mempalace-safe')
const writeLockPath = path.join(proxyDir, 'write-lock.mjs')
const proxyPath = path.join(proxyDir, 'proxy.mjs')

test('isMempalaceServer detects name/command/args', () => {
  assert.equal(isMempalaceServer('mempalace', 'node', []), true)
  assert.equal(isMempalaceServer('memory', 'mempalace-mcp', []), true)
  assert.equal(isMempalaceServer('custom', 'npx', ['-y', 'mempalace']), true)
  assert.equal(isMempalaceServer('web-search', 'npx', ['-y', 'web-search']), false)
})

test('isMempalaceSafeWrapped detects proxy path', () => {
  assert.equal(isMempalaceSafeWrapped('node', [proxyPath]), true)
  assert.equal(isMempalaceSafeWrapped('mempalace-mcp', []), false)
})

test('wrapMempalaceConfigIfNeeded rewrites command to safe proxy', () => {
  const wrapped = wrapMempalaceConfigIfNeeded(
    'mempalace',
    {
      command: 'mempalace-mcp',
      args: ['--palace', '/tmp/p'],
      env: { FOO: '1' },
    },
    proxyPath,
  )
  assert.equal(wrapped.command, 'node')
  assert.deepEqual(wrapped.args, [proxyPath])
  assert.equal(wrapped.env.ABF_MEMPALACE_COMMAND, 'mempalace-mcp')
  assert.equal(wrapped.env.ABF_MEMPALACE_ARGS, JSON.stringify(['--palace', '/tmp/p']))
  assert.equal(wrapped.env.MEMPALACE_MCP_ALLOW_PEER_WRITER, '1')
  assert.equal(wrapped.env.FOO, '1')
})

test('wrapMempalaceConfigIfNeeded is no-op for non-mempalace and already wrapped', () => {
  const other = wrapMempalaceConfigIfNeeded(
    'web',
    { command: 'npx', args: ['web'], env: {} },
    proxyPath,
  )
  assert.equal(other.command, 'npx')

  const once = wrapMempalaceConfigIfNeeded(
    'mempalace',
    { command: 'node', args: [proxyPath], env: { ABF_MEMPALACE_COMMAND: 'x' } },
    proxyPath,
  )
  assert.equal(once.command, 'node')
  assert.deepEqual(once.args, [proxyPath])
})

test('applyMempalaceSafeProxy only rewrites mempalace keys', () => {
  const out = applyMempalaceSafeProxy(
    {
      mempalace: { command: 'mempalace-mcp', args: [], env: {} },
      other: { command: 'echo', args: [], env: {} },
    },
    proxyPath,
  )
  assert.equal(out.mempalace.command, 'node')
  assert.equal(out.other.command, 'echo')
})

test('write-lock serializes concurrent acquires (second waits then succeeds)', async () => {
  assert.ok(existsSync(writeLockPath), 'write-lock.mjs must exist')
  const { acquireWriteLock, withWriteLock } = await import(
    pathToFileUrl(writeLockPath)
  )

  const dir = mkdtempSync(path.join(os.tmpdir(), 'abf-mplock-'))
  const lockFile = path.join(dir, 'abf_write.lock')
  const order: string[] = []

  try {
    const a = withWriteLock(async () => {
      order.push('a-start')
      await new Promise((r) => setTimeout(r, 120))
      order.push('a-end')
      return 'A'
    }, { lockPath: lockFile, retries: 20, minMs: 20, maxMs: 80 })

    // Start B slightly after A has the lock
    await new Promise((r) => setTimeout(r, 30))
    const b = withWriteLock(async () => {
      order.push('b-start')
      order.push('b-end')
      return 'B'
    }, { lockPath: lockFile, retries: 30, minMs: 20, maxMs: 100 })

    const [ra, rb] = await Promise.all([a, b])
    assert.equal(ra, 'A')
    assert.equal(rb, 'B')
    // B must not start while A holds the lock
    assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end'])

    // lock file released
    assert.equal(existsSync(lockFile), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  // touch acquireWriteLock so tree-shaking / lint doesn't complain in some runners
  assert.equal(typeof acquireWriteLock, 'function')
})

test('proxy: concurrent write tools both succeed via mock child', async () => {
  assert.ok(existsSync(proxyPath))

  const mockChild = path.join(proxyDir, '_test_mock_mempalace.mjs')
  // write a tiny mock if missing for this test only — use inline spawn script via node -e file
  const mockSource = `
import { createInterface } from 'node:readline'
let writes = 0
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', async (line) => {
  const req = JSON.parse(line)
  if (req.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock', version: '0' } }
    }) + '\\n')
    return
  }
  if (req.method === 'tools/call' && req.params?.name === 'mempalace_checkpoint') {
    writes += 1
    const n = writes
    // simulate slow write so concurrent proxies would race without lock
    await new Promise(r => setTimeout(r, 80))
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, n }) }] }
    }) + '\\n')
    return
  }
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0', id: req.id, result: {}
  }) + '\\n')
})
`
  const { writeFileSync } = await import('node:fs')
  writeFileSync(mockChild, mockSource, 'utf8')

  const dir = mkdtempSync(path.join(os.tmpdir(), 'abf-mpproxy-'))
  const lockFile = path.join(dir, 'abf_write.lock')

  function runOneWrite(id: number): Promise<{ ok: boolean; body: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [proxyPath, '--', process.execPath, mockChild],
        {
          env: {
            ...process.env,
            ABF_MEMPALACE_WRITE_LOCK: lockFile,
            ABF_MEMPALACE_WRITE_RETRIES: '30',
            MEMPALACE_MCP_ALLOW_PEER_WRITER: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
      let out = ''
      child.stdout.on('data', (c) => { out += c.toString() })
      child.stderr.on('data', () => { /* ignore proxy logs */ })
      child.on('error', reject)

      const send = (obj: unknown) => {
        child.stdin.write(JSON.stringify(obj) + '\n')
      }

      // initialize then write
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      setTimeout(() => {
        send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'mempalace_checkpoint',
            arguments: { items: [{ wing: 't', room: 't', content: `w${id}` }] },
          },
        })
      }, 40)

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`timeout proxy write id=${id} out=${out}`))
      }, 8000)

      child.stdout.on('data', () => {
        // wait until we see id:2 response
        if (out.includes('"id":2') || out.includes('"id": 2')) {
          clearTimeout(timer)
          try {
            child.stdin.end()
          } catch { /* ignore */ }
          setTimeout(() => {
            child.kill('SIGTERM')
            resolve({ ok: !out.includes('error') || out.includes('"ok":true'), body: out })
          }, 50)
        }
      })
    })
  }

  try {
    const [r1, r2] = await Promise.all([runOneWrite(1), runOneWrite(2)])
    const parseWriteOk = (body: string, label: string) => {
      const msgs = body
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l)
          } catch {
            return null
          }
        })
        .filter(Boolean) as Array<{ id?: number; result?: unknown; error?: unknown }>
      const writeResp = msgs.find((m) => m.id === 2)
      assert.ok(writeResp, `${label} missing tools/call response: ${body}`)
      assert.equal(writeResp.error, undefined, `${label} unexpected error: ${body}`)
      assert.ok(writeResp.result, `${label} missing result: ${body}`)
      const contentText = (writeResp.result as { content?: Array<{ text?: string }> })
        ?.content?.[0]?.text
      assert.ok(contentText, `${label} missing content text: ${JSON.stringify(writeResp.result)}`)
      const payload = JSON.parse(contentText)
      assert.equal(payload.ok, true, `${label} payload not ok: ${contentText}`)
    }
    parseWriteOk(r1.body, 'r1')
    parseWriteOk(r2.body, 'r2')
    assert.equal(r1.body.includes('Peer MCP writer'), false)
    assert.equal(r2.body.includes('write lock busy'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    try {
      rmSync(mockChild, { force: true })
    } catch { /* ignore */ }
  }
})

test('getEnabledServerConfigs source wires applyMempalaceSafeProxy', () => {
  const source = readFileSync(
    path.join(workspaceRoot, 'electron/services/mcp.ts'),
    'utf8',
  )
  assert.match(source, /applyMempalaceSafeProxy/)
  assert.match(source, /mempalace-safe/)
})

test('package.json packages mempalace-safe extraResource', () => {
  const pkg = JSON.parse(readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'))
  const resources: Array<{ from: string; to: string }> = pkg.build?.extraResources || []
  assert.ok(
    resources.some(
      (r) =>
        r.from === 'electron/embedded-assets/mcps/mempalace-safe' &&
        r.to === 'mcps/mempalace-safe',
    ),
    'mempalace-safe must be packaged like agent-control',
  )
})

function pathToFileUrl(p: string): string {
  const resolved = path.resolve(p)
  if (process.platform === 'win32') {
    return 'file:///' + resolved.replace(/\\/g, '/')
  }
  return 'file://' + resolved
}

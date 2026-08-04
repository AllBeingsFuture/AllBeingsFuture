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

const testDir = path.dirname(fileURLToPath(import.meta.url))
// electron/tests (source) → ../.. ; electron/dist/tests (compiled) → ../../..
const workspaceRoot = existsSync(path.join(testDir, '../../package.json'))
  ? path.resolve(testDir, '../..')
  : path.resolve(testDir, '../../..')
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
  // Bounded timeout defaults injected only when unset (align with agent 15–20s window)
  assert.equal(wrapped.env.ABF_MEMPALACE_LOCK_MAX_MS, '18000')
  assert.equal(wrapped.env.ABF_MEMPALACE_TOOL_MAX_MS, '30000')
  assert.equal(wrapped.env.ABF_MEMPALACE_TOOL_RETRIES, '3')
  assert.equal(wrapped.env.ABF_MEMPALACE_CHILD_TIMEOUT_MS, '15000')
})

test('wrapMempalaceConfigIfNeeded does not override user timeout env', () => {
  const wrapped = wrapMempalaceConfigIfNeeded(
    'mempalace',
    {
      command: 'mempalace-mcp',
      args: [],
      env: {
        ABF_MEMPALACE_LOCK_MAX_MS: '9000',
        ABF_MEMPALACE_TOOL_MAX_MS: '30000',
        ABF_MEMPALACE_TOOL_RETRIES: '7',
        ABF_MEMPALACE_CHILD_TIMEOUT_MS: '20000',
      },
    },
    proxyPath,
  )
  assert.equal(wrapped.env.ABF_MEMPALACE_LOCK_MAX_MS, '9000')
  assert.equal(wrapped.env.ABF_MEMPALACE_TOOL_MAX_MS, '30000')
  assert.equal(wrapped.env.ABF_MEMPALACE_TOOL_RETRIES, '7')
  assert.equal(wrapped.env.ABF_MEMPALACE_CHILD_TIMEOUT_MS, '20000')
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

test('write-lock defaults align with multi-agent 15–20s retry window', async () => {
  assert.ok(existsSync(writeLockPath), 'write-lock.mjs must exist')
  const mod = await import(pathToFileUrl(writeLockPath))
  assert.equal(mod.DEFAULT_LOCK_MAX_WAIT_MS, 18_000)
  assert.equal(mod.DEFAULT_LOCK_RETRIES, 80)
  assert.equal(mod.DEFAULT_LOCK_BACKOFF_MIN_MS, 50)
  assert.equal(mod.DEFAULT_LOCK_BACKOFF_MAX_MS, 800)
  assert.equal(mod.DEFAULT_STALE_MS, 30_000)
  // Proxy env defaults must align with tool budget (lock wait + child write + retries)
  const proxySrc = readFileSync(proxyPath, 'utf8')
  assert.match(proxySrc, /ABF_MEMPALACE_LOCK_MAX_MS/)
  assert.match(proxySrc, /ABF_MEMPALACE_TOOL_MAX_MS/)
  assert.match(proxySrc, /ABF_MEMPALACE_CHILD_TIMEOUT_MS/)
  assert.match(proxySrc, /DEFAULT_LOCK_RETRIES/)
  assert.match(proxySrc, /parseEnvInt\('ABF_MEMPALACE_TOOL_RETRIES',\s*DEFAULT_TOOL_RETRIES\)/)
  assert.match(proxySrc, /parseEnvInt\('ABF_MEMPALACE_TOOL_MAX_MS',\s*DEFAULT_TOOL_MAX_MS\)/)
  assert.match(proxySrc, /DEFAULT_TOOL_MAX_MS\s*=\s*30_000/)
  assert.match(proxySrc, /DEFAULT_TOOL_RETRIES\s*=\s*3/)
  assert.match(proxySrc, /DEFAULT_CHILD_TIMEOUT_MS\s*=\s*15_000/)
  assert.match(proxySrc, /DEFAULT_READ_TIMEOUT_MS\s*=\s*60_000/)
  assert.match(proxySrc, /code:\s*-32002/)
  assert.match(proxySrc, /Math\.min\(1000,\s*80\s*\*\s*2\s*\*\*\s*attempt\)/)
  // Critical: lock-busy must retry inside tool budget, not return immediately
  assert.match(proxySrc, /ABF_WRITE_LOCK_BUSY/)
  assert.match(proxySrc, /canRetry/)
  assert.match(proxySrc, /continue/)
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
    }, { lockPath: lockFile, retries: 20, minMs: 20, maxMs: 80, maxWaitMs: 5000 })

    // Start B slightly after A has the lock
    await new Promise((r) => setTimeout(r, 30))
    const b = withWriteLock(async () => {
      order.push('b-start')
      order.push('b-end')
      return 'B'
    }, { lockPath: lockFile, retries: 30, minMs: 20, maxMs: 100, maxWaitMs: 5000 })

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

test('write-lock maxWaitMs deadline stops busy wait without inventing success', async () => {
  const { acquireWriteLock } = await import(pathToFileUrl(writeLockPath))
  const dir = mkdtempSync(path.join(os.tmpdir(), 'abf-mplock-deadline-'))
  const lockFile = path.join(dir, 'abf_write.lock')
  const { writeFileSync } = await import('node:fs')
  // Hold lock with a fake alive-looking pid (current process) so stale recovery does not steal it
  writeFileSync(lockFile, `${process.pid}\n`, 'utf8')

  const started = Date.now()
  let err: { code?: string; message?: string } | null = null
  try {
    await acquireWriteLock({
      lockPath: lockFile,
      retries: 200,
      minMs: 20,
      maxMs: 40,
      maxWaitMs: 250,
      staleMs: 3_600_000,
    })
  } catch (e) {
    err = e as { code?: string; message?: string }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  assert.ok(err, 'must throw ABF_WRITE_LOCK_BUSY')
  assert.equal(err!.code, 'ABF_WRITE_LOCK_BUSY')
  assert.match(String(err!.message), /write lock busy/i)
  const elapsed = Date.now() - started
  // Should respect short deadline (not hang for full retries budget)
  assert.ok(elapsed < 2000, `deadline should bind quickly, elapsed=${elapsed}`)
  assert.ok(elapsed >= 200, `should actually wait some backoff, elapsed=${elapsed}`)
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

test('proxy: peer-lock response is retried then succeeds (never invents success)', async () => {
  assert.ok(existsSync(proxyPath))
  const mockChild = path.join(proxyDir, '_test_mock_peerlock.mjs')
  const mockSource = `
import { createInterface } from 'node:readline'
let calls = 0
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
    calls += 1
    if (calls === 1) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: req.id,
        error: { code: -32000, message: 'Peer MCP writer active — palace peer lock — 未写入' }
      }) + '\\n')
      return
    }
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, calls }) }] }
    }) + '\\n')
    return
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} }) + '\\n')
})
`
  const { writeFileSync } = await import('node:fs')
  writeFileSync(mockChild, mockSource, 'utf8')

  const dir = mkdtempSync(path.join(os.tmpdir(), 'abf-mppeer-'))
  const lockFile = path.join(dir, 'abf_write.lock')

  try {
    const body = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [proxyPath, '--', process.execPath, mockChild],
        {
          env: {
            ...process.env,
            ABF_MEMPALACE_WRITE_LOCK: lockFile,
            ABF_MEMPALACE_WRITE_RETRIES: '20',
            ABF_MEMPALACE_LOCK_MAX_MS: '5000',
            ABF_MEMPALACE_TOOL_RETRIES: '5',
            ABF_MEMPALACE_TOOL_MAX_MS: '15000',
            MEMPALACE_MCP_ALLOW_PEER_WRITER: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
      let out = ''
      child.stdout.on('data', (c) => { out += c.toString() })
      child.stderr.on('data', () => { /* proxy logs */ })
      child.on('error', reject)

      const send = (obj: unknown) => {
        child.stdin.write(JSON.stringify(obj) + '\n')
      }
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      setTimeout(() => {
        send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'mempalace_checkpoint',
            arguments: { items: [{ wing: 't', room: 't', content: 'peer' }] },
          },
        })
      }, 40)

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`timeout peer-lock retry out=${out}`))
      }, 12000)

      const tryFinish = () => {
        const lines = out
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        for (const line of lines) {
          try {
            const msg = JSON.parse(line) as {
              id?: number
              result?: { content?: Array<{ text?: string }> }
              error?: unknown
            }
            if (msg.id !== 2) continue
            clearTimeout(timer)
            try { child.stdin.end() } catch { /* ignore */ }
            setTimeout(() => {
              child.kill('SIGTERM')
              resolve(out)
            }, 50)
            return
          } catch {
            /* ignore partial */
          }
        }
      }
      child.stdout.on('data', tryFinish)
    })

    const msgs = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) } catch { return null }
      })
      .filter(Boolean) as Array<{ id?: number; result?: unknown; error?: unknown }>
    const writeResp = msgs.find((m) => m.id === 2)
    assert.ok(writeResp, `missing tools/call response: ${body}`)
    assert.equal(writeResp.error, undefined, `peer retry should succeed, got error: ${body}`)
    const contentText = (writeResp.result as { content?: Array<{ text?: string }> })?.content?.[0]?.text
    assert.ok(contentText, `missing content: ${body}`)
    const payload = JSON.parse(contentText)
    assert.equal(payload.ok, true)
    assert.ok(payload.calls >= 2, `expected retry (calls>=2), got ${payload.calls}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    try { rmSync(mockChild, { force: true }) } catch { /* ignore */ }
  }
})

test('proxy: child hang returns timeout error within deadline (no infinite hang)', async () => {
  assert.ok(existsSync(proxyPath))
  const mockChild = path.join(proxyDir, '_test_mock_hang.mjs')
  // Never replies to checkpoint — proxy must timeout and release lock
  const mockSource = `
import { createInterface } from 'node:readline'
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', async (line) => {
  const req = JSON.parse(line)
  if (req.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock-hang', version: '0' } }
    }) + '\\n')
    return
  }
  if (req.method === 'tools/call' && req.params?.name === 'mempalace_checkpoint') {
    // hang forever — do not reply
    return
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} }) + '\\n')
})
`
  const { writeFileSync } = await import('node:fs')
  writeFileSync(mockChild, mockSource, 'utf8')

  const dir = mkdtempSync(path.join(os.tmpdir(), 'abf-mphang-'))
  const lockFile = path.join(dir, 'abf_write.lock')

  try {
    const started = Date.now()
    const body = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [proxyPath, '--', process.execPath, mockChild],
        {
          env: {
            ...process.env,
            ABF_MEMPALACE_WRITE_LOCK: lockFile,
            ABF_MEMPALACE_WRITE_RETRIES: '5',
            ABF_MEMPALACE_LOCK_MAX_MS: '2000',
            ABF_MEMPALACE_TOOL_RETRIES: '0',
            ABF_MEMPALACE_TOOL_MAX_MS: '1500',
            ABF_MEMPALACE_CHILD_TIMEOUT_MS: '800',
            MEMPALACE_MCP_ALLOW_PEER_WRITER: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
      let out = ''
      child.stdout.on('data', (c) => { out += c.toString() })
      child.stderr.on('data', () => { /* proxy logs */ })
      child.on('error', reject)

      const send = (obj: unknown) => {
        child.stdin.write(JSON.stringify(obj) + '\n')
      }
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      setTimeout(() => {
        send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'mempalace_checkpoint',
            arguments: { items: [{ wing: 't', room: 't', content: 'hang' }] },
          },
        })
      }, 30)

      // Wall clock must be well under old 10min / multi-minute hang
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`hang test wall timeout (proxy stuck) out=${out}`))
      }, 5000)

      const tryFinish = () => {
        const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
        for (const line of lines) {
          try {
            const msg = JSON.parse(line) as { id?: number; error?: { code?: number; message?: string } }
            if (msg.id !== 2) continue
            clearTimeout(timer)
            try { child.stdin.end() } catch { /* ignore */ }
            setTimeout(() => {
              child.kill('SIGTERM')
              resolve(out)
            }, 30)
            return
          } catch {
            /* ignore */
          }
        }
      }
      child.stdout.on('data', tryFinish)
    })

    const elapsed = Date.now() - started
    assert.ok(elapsed < 5000, `must error within 5s wall, elapsed=${elapsed}`)
    // With child timeout 800ms, expect roughly that order — not multi-second hang kill
    assert.ok(elapsed < 4000, `should not approach hard kill wall, elapsed=${elapsed}`)

    const msgs = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) } catch { return null }
      })
      .filter(Boolean) as Array<{ id?: number; result?: unknown; error?: { code?: number; message?: string } }>
    const writeResp = msgs.find((m) => m.id === 2)
    assert.ok(writeResp, `missing tools/call response: ${body}`)
    assert.ok(writeResp.error, `expected timeout error, got success: ${body}`)
    assert.equal(writeResp.error!.code, -32002)
    assert.match(String(writeResp.error!.message), /timeout/i)
    // lock must be released after timeout
    assert.equal(existsSync(lockFile), false, 'lock must be released after child timeout')
  } finally {
    rmSync(dir, { recursive: true, force: true })
    try { rmSync(mockChild, { force: true }) } catch { /* ignore */ }
  }
})

test('proxy: lock held then released — wait and succeed (not busy)', async () => {
  assert.ok(existsSync(proxyPath))
  const mockChild = path.join(proxyDir, '_test_mock_contend_ok.mjs')
  const mockSource = `
import { createInterface } from 'node:readline'
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', async (line) => {
  const req = JSON.parse(line)
  if (req.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock-contend', version: '0' } }
    }) + '\\n')
    return
  }
  if (req.method === 'tools/call') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, waited: true }) }] }
    }) + '\\n')
    return
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} }) + '\\n')
})
`
  const { writeFileSync, unlinkSync } = await import('node:fs')
  writeFileSync(mockChild, mockSource, 'utf8')

  const dir = mkdtempSync(path.join(os.tmpdir(), 'abf-mpcontend-'))
  const lockFile = path.join(dir, 'abf_write.lock')
  // Hold lock with live PID for ~1.2s then release — proxy should wait and succeed
  writeFileSync(lockFile, `${process.pid}\n`, 'utf8')
  const releaseTimer = setTimeout(() => {
    try { unlinkSync(lockFile) } catch { /* ignore */ }
  }, 1200)

  try {
    const body = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [proxyPath, '--', process.execPath, mockChild],
        {
          env: {
            ...process.env,
            ABF_MEMPALACE_WRITE_LOCK: lockFile,
            ABF_MEMPALACE_WRITE_RETRIES: '40',
            ABF_MEMPALACE_LOCK_MAX_MS: '3000',
            ABF_MEMPALACE_LOCK_BACKOFF_MAX_MS: '100',
            ABF_MEMPALACE_TOOL_RETRIES: '2',
            ABF_MEMPALACE_TOOL_MAX_MS: '10000',
            ABF_MEMPALACE_CHILD_TIMEOUT_MS: '3000',
            MEMPALACE_MCP_ALLOW_PEER_WRITER: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
      let out = ''
      child.stdout.on('data', (c) => { out += c.toString() })
      child.stderr.on('data', () => { /* ignore */ })
      child.on('error', reject)

      const send = (obj: unknown) => {
        child.stdin.write(JSON.stringify(obj) + '\n')
      }
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      setTimeout(() => {
        send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'mempalace_checkpoint',
            arguments: { items: [{ wing: 't', room: 't', content: 'contend-ok' }] },
          },
        })
      }, 30)

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`contend-then-success wall timeout out=${out}`))
      }, 12000)

      const tryFinish = () => {
        const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
        for (const line of lines) {
          try {
            const msg = JSON.parse(line) as { id?: number; error?: unknown; result?: unknown }
            if (msg.id !== 2) continue
            clearTimeout(timer)
            try { child.stdin.end() } catch { /* ignore */ }
            setTimeout(() => {
              child.kill('SIGTERM')
              resolve(out)
            }, 30)
            return
          } catch {
            /* ignore */
          }
        }
      }
      child.stdout.on('data', tryFinish)
    })

    const msgs = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) } catch { return null }
      })
      .filter(Boolean) as Array<{ id?: number; result?: { content?: Array<{ text?: string }> }; error?: unknown }>
    const writeResp = msgs.find((m) => m.id === 2)
    assert.ok(writeResp, `missing tools/call response: ${body}`)
    assert.equal(writeResp.error, undefined, `should wait and succeed, got error: ${body}`)
    const contentText = writeResp.result?.content?.[0]?.text
    assert.ok(contentText, `missing content: ${body}`)
    const payload = JSON.parse(contentText)
    assert.equal(payload.ok, true)
  } finally {
    clearTimeout(releaseTimer)
    rmSync(dir, { recursive: true, force: true })
    try { rmSync(mockChild, { force: true }) } catch { /* ignore */ }
  }
})

test('proxy: lock-busy retries within tool budget then succeeds', async () => {
  assert.ok(existsSync(proxyPath))
  const mockChild = path.join(proxyDir, '_test_mock_busy_retry.mjs')
  const mockSource = `
import { createInterface } from 'node:readline'
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', async (line) => {
  const req = JSON.parse(line)
  if (req.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock-busy-retry', version: '0' } }
    }) + '\\n')
    return
  }
  if (req.method === 'tools/call') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, via: 'busy-retry' }) }] }
    }) + '\\n')
    return
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} }) + '\\n')
})
`
  const { writeFileSync, unlinkSync } = await import('node:fs')
  writeFileSync(mockChild, mockSource, 'utf8')

  const dir = mkdtempSync(path.join(os.tmpdir(), 'abf-mpbusyretry-'))
  const lockFile = path.join(dir, 'abf_write.lock')
  // Hold lock longer than a single short maxWait (500ms) but release before tool deadline
  // so the proxy must retry lock-busy (not return immediately after first acquire fail)
  writeFileSync(lockFile, `${process.pid}\n`, 'utf8')
  const releaseTimer = setTimeout(() => {
    try { unlinkSync(lockFile) } catch { /* ignore */ }
  }, 900)

  try {
    const body = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [proxyPath, '--', process.execPath, mockChild],
        {
          env: {
            ...process.env,
            ABF_MEMPALACE_WRITE_LOCK: lockFile,
            ABF_MEMPALACE_WRITE_RETRIES: '20',
            // Short per-acquire wait so first attempt fails with BUSY while lock held
            ABF_MEMPALACE_LOCK_MAX_MS: '400',
            ABF_MEMPALACE_LOCK_BACKOFF_MAX_MS: '50',
            // Multiple tool retries + enough overall budget to re-acquire after release
            ABF_MEMPALACE_TOOL_RETRIES: '5',
            ABF_MEMPALACE_TOOL_MAX_MS: '8000',
            ABF_MEMPALACE_CHILD_TIMEOUT_MS: '2000',
            MEMPALACE_MCP_ALLOW_PEER_WRITER: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
      let out = ''
      child.stdout.on('data', (c) => { out += c.toString() })
      child.stderr.on('data', () => { /* ignore */ })
      child.on('error', reject)

      const send = (obj: unknown) => {
        child.stdin.write(JSON.stringify(obj) + '\n')
      }
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      setTimeout(() => {
        send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'mempalace_checkpoint',
            arguments: { items: [{ wing: 't', room: 't', content: 'busy-retry' }] },
          },
        })
      }, 30)

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`lock-busy retry wall timeout out=${out}`))
      }, 12000)

      const tryFinish = () => {
        const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
        for (const line of lines) {
          try {
            const msg = JSON.parse(line) as { id?: number; error?: unknown; result?: unknown }
            if (msg.id !== 2) continue
            clearTimeout(timer)
            try { child.stdin.end() } catch { /* ignore */ }
            setTimeout(() => {
              child.kill('SIGTERM')
              resolve(out)
            }, 30)
            return
          } catch {
            /* ignore */
          }
        }
      }
      child.stdout.on('data', tryFinish)
    })

    const msgs = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) } catch { return null }
      })
      .filter(Boolean) as Array<{ id?: number; result?: { content?: Array<{ text?: string }> }; error?: unknown }>
    const writeResp = msgs.find((m) => m.id === 2)
    assert.ok(writeResp, `missing tools/call response: ${body}`)
    assert.equal(writeResp.error, undefined, `lock-busy should retry and succeed, got: ${body}`)
    const contentText = writeResp.result?.content?.[0]?.text
    assert.ok(contentText, `missing content: ${body}`)
    const payload = JSON.parse(contentText)
    assert.equal(payload.ok, true)
    assert.equal(payload.via, 'busy-retry')
  } finally {
    clearTimeout(releaseTimer)
    rmSync(dir, { recursive: true, force: true })
    try { rmSync(mockChild, { force: true }) } catch { /* ignore */ }
  }
})

test('proxy: permanent lock contention returns busy within short maxWait (not hang)', async () => {
  assert.ok(existsSync(proxyPath))
  const mockChild = path.join(proxyDir, '_test_mock_busy.mjs')
  const mockSource = `
import { createInterface } from 'node:readline'
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', async (line) => {
  const req = JSON.parse(line)
  if (req.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock-busy', version: '0' } }
    }) + '\\n')
    return
  }
  if (req.method === 'tools/call') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }
    }) + '\\n')
    return
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} }) + '\\n')
})
`
  const { writeFileSync } = await import('node:fs')
  writeFileSync(mockChild, mockSource, 'utf8')

  const dir = mkdtempSync(path.join(os.tmpdir(), 'abf-mpbusy-'))
  const lockFile = path.join(dir, 'abf_write.lock')
  // Hold lock with live PID so proxy cannot steal via stale recovery (permanent hold)
  writeFileSync(lockFile, `${process.pid}\n`, 'utf8')

  try {
    const started = Date.now()
    const body = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [proxyPath, '--', process.execPath, mockChild],
        {
          env: {
            ...process.env,
            ABF_MEMPALACE_WRITE_LOCK: lockFile,
            ABF_MEMPALACE_WRITE_RETRIES: '40',
            ABF_MEMPALACE_LOCK_MAX_MS: '400',
            ABF_MEMPALACE_LOCK_BACKOFF_MAX_MS: '50',
            // No tool-level retries: exhaust on first lock-busy within short maxWait
            ABF_MEMPALACE_TOOL_RETRIES: '0',
            ABF_MEMPALACE_TOOL_MAX_MS: '3000',
            ABF_MEMPALACE_CHILD_TIMEOUT_MS: '1000',
            MEMPALACE_MCP_ALLOW_PEER_WRITER: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
      let out = ''
      child.stdout.on('data', (c) => { out += c.toString() })
      child.stderr.on('data', () => { /* ignore */ })
      child.on('error', reject)

      const send = (obj: unknown) => {
        child.stdin.write(JSON.stringify(obj) + '\n')
      }
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      setTimeout(() => {
        send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'mempalace_checkpoint',
            arguments: { items: [{ wing: 't', room: 't', content: 'busy' }] },
          },
        })
      }, 30)

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`lock busy wall timeout out=${out}`))
      }, 5000)

      const tryFinish = () => {
        const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
        for (const line of lines) {
          try {
            const msg = JSON.parse(line) as { id?: number; error?: { code?: number; message?: string } }
            if (msg.id !== 2) continue
            clearTimeout(timer)
            try { child.stdin.end() } catch { /* ignore */ }
            setTimeout(() => {
              child.kill('SIGTERM')
              resolve(out)
            }, 30)
            return
          } catch {
            /* ignore */
          }
        }
      }
      child.stdout.on('data', tryFinish)
    })

    const elapsed = Date.now() - started
    assert.ok(elapsed < 2500, `busy should fail within lock max + overhead, elapsed=${elapsed}`)
    assert.ok(elapsed >= 300, `should wait some of lock budget, elapsed=${elapsed}`)

    const msgs = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) } catch { return null }
      })
      .filter(Boolean) as Array<{ id?: number; error?: { code?: number; message?: string } }>
    const writeResp = msgs.find((m) => m.id === 2)
    assert.ok(writeResp, `missing tools/call response: ${body}`)
    assert.ok(writeResp.error, `expected busy error: ${body}`)
    assert.equal(writeResp.error!.code, -32001)
    assert.match(String(writeResp.error!.message), /write lock busy/i)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    try { rmSync(mockChild, { force: true }) } catch { /* ignore */ }
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

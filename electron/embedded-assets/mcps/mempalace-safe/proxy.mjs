#!/usr/bin/env node
/**
 * ABF MemPalace Safe Proxy — stdio MCP wrapper
 *
 * Problem: each ABF agent session starts its own mempalace-mcp process. The
 * palace holds a process-lifetime exclusive writer lease, so peers get:
 *   "Peer MCP writer active… / palace peer lock — 未写入"
 *
 * This proxy:
 * 1. Spawns the user's real mempalace command (from env / argv)
 * 2. Sets MEMPALACE_MCP_ALLOW_PEER_WRITER=1 so peers are not sticky read-only
 * 3. Serializes write tools with a cross-process file lock + exponential backoff
 * 4. On peer-lock JSON-RPC errors, re-acquires lock and retries the tools/call
 *    (never reports success without a successful child response)
 *
 * Env:
 *   ABF_MEMPALACE_COMMAND  — child executable (default: mempalace-mcp)
 *   ABF_MEMPALACE_ARGS     — JSON array of child args
 *   ABF_MEMPALACE_WRITE_LOCK — lock file path (optional)
 *   ABF_MEMPALACE_WRITE_RETRIES — lock acquire retries (default 80)
 *   ABF_MEMPALACE_LOCK_MAX_MS — total lock wait budget ms (default 18000)
 *   ABF_MEMPALACE_LOCK_BACKOFF_MAX_MS — per-sleep backoff cap ms (default 800)
 *   ABF_MEMPALACE_TOOL_RETRIES — peer/lock-busy response retries (default 3)
 *   ABF_MEMPALACE_TOOL_MAX_MS — overall write tools/call deadline ms (default 30000)
 *   ABF_MEMPALACE_CHILD_TIMEOUT_MS — per-attempt child response timeout on writes (default 15000)
 *   MEMPALACE_MCP_ALLOW_PEER_WRITER — default forced to "1" unless already set
 *
 * Argv: node proxy.mjs [--] <command> [args...]
 *   overrides ABF_MEMPALACE_COMMAND / ARGS when present after --
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import {
  acquireWriteLock,
  isWriteTool,
  defaultLockPath,
  DEFAULT_LOCK_MAX_WAIT_MS,
  DEFAULT_LOCK_RETRIES,
  DEFAULT_LOCK_BACKOFF_MAX_MS,
} from './write-lock.mjs'

/** Default overall write budget (lock wait + peer retries + child waits). */
const DEFAULT_TOOL_MAX_MS = 30_000
/** Default peer/lock-busy retries (deadline usually binds first). */
const DEFAULT_TOOL_RETRIES = 3
/** Default per-attempt child wait on write path. */
const DEFAULT_CHILD_TIMEOUT_MS = 15_000
/** Default wait for non-write child responses (reads / initialize). */
const DEFAULT_READ_TIMEOUT_MS = 60_000

function parseEnvInt(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? Math.max(0, n) : fallback
}

function parseChildLaunch() {
  const argv = process.argv.slice(2)
  const dash = argv.indexOf('--')
  const rest = dash >= 0 ? argv.slice(dash + 1) : argv.filter((a) => !a.startsWith('--lock='))

  if (rest.length > 0) {
    return { command: rest[0], args: rest.slice(1) }
  }

  const command = process.env.ABF_MEMPALACE_COMMAND || 'mempalace-mcp'
  let args = []
  if (process.env.ABF_MEMPALACE_ARGS) {
    try {
      const parsed = JSON.parse(process.env.ABF_MEMPALACE_ARGS)
      if (Array.isArray(parsed)) args = parsed.map(String)
    } catch {
      process.stderr.write('[mempalace-safe] invalid ABF_MEMPALACE_ARGS JSON; ignoring\n')
    }
  }
  return { command, args }
}

function peerLockMarkersIn(blob) {
  const s = String(blob || '').toLowerCase()
  return (
    s.includes('未写入') ||
    s.includes('peer-writer') ||
    s.includes('palace lock') ||
    s.includes('palace peer lock') ||
    s.includes('read-only for mutating') ||
    s.includes('minealreadyrunning') ||
    s.includes('another mempalace writer') ||
    (s.includes('peer') && s.includes('lock'))
  )
}

function isPeerLockResponse(msg) {
  if (!msg || typeof msg !== 'object') return false
  if (msg.error) {
    if (peerLockMarkersIn(JSON.stringify(msg.error))) return true
  }
  // Defensive: some servers surface lock failures in result content text
  const content = msg.result?.content
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part.text === 'string' && peerLockMarkersIn(part.text)) return true
    }
  }
  return false
}

function toolNameFromRequest(req) {
  if (!req || req.method !== 'tools/call') return null
  const name = req.params?.name
  return typeof name === 'string' ? name : null
}

const { command, args } = parseChildLaunch()
const lockPath = process.env.ABF_MEMPALACE_WRITE_LOCK || defaultLockPath()
const lockRetries = parseEnvInt('ABF_MEMPALACE_WRITE_RETRIES', DEFAULT_LOCK_RETRIES)
const lockMaxMs = parseEnvInt('ABF_MEMPALACE_LOCK_MAX_MS', DEFAULT_LOCK_MAX_WAIT_MS)
const lockBackoffMaxMs = parseEnvInt('ABF_MEMPALACE_LOCK_BACKOFF_MAX_MS', DEFAULT_LOCK_BACKOFF_MAX_MS)
const toolRetries = parseEnvInt('ABF_MEMPALACE_TOOL_RETRIES', DEFAULT_TOOL_RETRIES)
const toolMaxMs = parseEnvInt('ABF_MEMPALACE_TOOL_MAX_MS', DEFAULT_TOOL_MAX_MS)
const childTimeoutMs = parseEnvInt('ABF_MEMPALACE_CHILD_TIMEOUT_MS', DEFAULT_CHILD_TIMEOUT_MS)

const childEnv = { ...process.env }
if (!('MEMPALACE_MCP_ALLOW_PEER_WRITER' in childEnv) || !String(childEnv.MEMPALACE_MCP_ALLOW_PEER_WRITER || '').trim()) {
  childEnv.MEMPALACE_MCP_ALLOW_PEER_WRITER = '1'
}
// Avoid recursive wrap if someone nested proxies
delete childEnv.ABF_MEMPALACE_COMMAND
delete childEnv.ABF_MEMPALACE_ARGS

process.stderr.write(
  `[mempalace-safe] proxy → ${command} ${args.join(' ')} (write-lock=${lockPath}; lockRetries=${lockRetries}; lockMaxMs=${lockMaxMs}; toolRetries=${toolRetries}; toolMaxMs=${toolMaxMs}; childTimeoutMs=${childTimeoutMs})\n`,
)

const child = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: childEnv,
})

child.on('error', (err) => {
  process.stderr.write(`[mempalace-safe] failed to spawn ${command}: ${err.message}\n`)
  process.exit(1)
})

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk)
})

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 0)
})

/** @type {Map<string|number, { resolve: Function, reject: Function }>} */
const pendingChild = new Map()

/** Serialize write tools within this proxy process */
let writeChain = Promise.resolve()

function sendToChild(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n')
}

function waitChildResponse(id, timeoutMs = DEFAULT_READ_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_READ_TIMEOUT_MS
    const timer = setTimeout(() => {
      pendingChild.delete(id)
      const err = new Error(`mempalace tools/call timeout after ${ms}ms`)
      err.code = 'ABF_CHILD_TIMEOUT'
      err.timeoutMs = ms
      reject(err)
    }, ms)

    pendingChild.set(id, {
      resolve: (msg) => {
        clearTimeout(timer)
        resolve(msg)
      },
      reject: (err) => {
        clearTimeout(timer)
        reject(err)
      },
    })
  })
}

const childRl = createInterface({ input: child.stdout, crlfDelay: Infinity })
childRl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let msg
  try {
    msg = JSON.parse(trimmed)
  } catch {
    // non-JSON from child — forward raw
    process.stdout.write(line + '\n')
    return
  }

  if (msg && (typeof msg.id === 'string' || typeof msg.id === 'number') && pendingChild.has(msg.id)) {
    const p = pendingChild.get(msg.id)
    pendingChild.delete(msg.id)
    p.resolve(msg)
    return
  }

  // notifications / unmatched — forward
  process.stdout.write(JSON.stringify(msg) + '\n')
})

function forwardToClient(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function peerRetryBackoffMs(attempt) {
  // Cap at 1s so peer retries stay within the overall write budget
  return Math.min(1000, 80 * 2 ** attempt)
}

function busyLockErrorResponse(req, message, attempt) {
  return {
    jsonrpc: '2.0',
    id: req.id,
    error: {
      code: -32001,
      message,
      data: {
        tool: toolNameFromRequest(req),
        retried: attempt,
        hint: 'Another ABF session is writing the palace; retry later',
      },
    },
  }
}

async function handleWriteCall(req) {
  let lastPeerErr = null
  let lastLockBusyMessage = null
  const toolStart = Date.now()
  const toolDeadline = toolMaxMs > 0 ? toolStart + toolMaxMs : Number.POSITIVE_INFINITY

  for (let attempt = 0; attempt <= toolRetries; attempt++) {
    if (attempt > 0 && Date.now() >= toolDeadline) break

    let lock
    try {
      // Cap single acquire wait by remaining overall tool budget
      const remainingForLock = toolDeadline - Date.now()
      if (remainingForLock <= 0) break
      const effectiveMaxWait =
        lockMaxMs > 0 ? Math.min(lockMaxMs, Math.max(0, remainingForLock)) : lockMaxMs
      lock = await acquireWriteLock({
        lockPath,
        retries: lockRetries,
        maxWaitMs: effectiveMaxWait,
        minMs: 50,
        maxMs: lockBackoffMaxMs,
      })
    } catch (err) {
      if (err && err.code === 'ABF_WRITE_LOCK_BUSY') {
        lastLockBusyMessage = err.message
        // Retry lock-busy inside the tool budget (like peer-lock), not fail-fast on first busy
        const canRetry = attempt < toolRetries && Date.now() < toolDeadline
        if (!canRetry) {
          return busyLockErrorResponse(req, err.message, attempt)
        }
        const sleepFor = peerRetryBackoffMs(attempt)
        const remaining = toolDeadline - Date.now()
        if (remaining <= 0) {
          return busyLockErrorResponse(req, err.message, attempt)
        }
        await new Promise((r) => setTimeout(r, Math.min(sleepFor, remaining)))
        continue
      }
      return busyLockErrorResponse(
        req,
        `mempalace write lock failed: ${err?.message || err}`,
        attempt,
      )
    }

    let response
    try {
      const remainingBudget = toolDeadline - Date.now()
      if (remainingBudget <= 0) {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: -32002,
            message: `mempalace tools/call timeout after ${toolMaxMs}ms`,
            data: { tool: toolNameFromRequest(req), reason: 'tool_budget_exhausted' },
          },
        }
      }
      // Per-attempt child wait: never exceed remaining overall write budget
      const waitMs =
        childTimeoutMs > 0
          ? Math.min(childTimeoutMs, remainingBudget)
          : remainingBudget
      sendToChild(req)
      response = await waitChildResponse(req.id, waitMs)
    } catch (err) {
      if (err && (err.code === 'ABF_CHILD_TIMEOUT' || /timeout/i.test(String(err?.message || '')))) {
        const waited = err.timeoutMs || childTimeoutMs || toolMaxMs
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: -32002,
            message: `mempalace tools/call timeout after ${waited}ms`,
            data: {
              tool: toolNameFromRequest(req),
              attempt,
              hint: 'Underlying mempalace did not respond in time; lock released',
            },
          },
        }
      }
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32000,
          message: `mempalace-safe proxy error: ${err?.message || err}`,
          data: { tool: toolNameFromRequest(req) },
        },
      }
    } finally {
      // always release before peer-lock backoff so other writers can proceed
      lock.release()
    }

    if (!isPeerLockResponse(response)) {
      return response
    }

    lastPeerErr = response
    const canRetry = attempt < toolRetries && Date.now() < toolDeadline
    if (!canRetry) {
      return response
    }
    const sleepFor = peerRetryBackoffMs(attempt)
    const remaining = toolDeadline - Date.now()
    if (remaining <= 0) {
      return response
    }
    await new Promise((r) => setTimeout(r, Math.min(sleepFor, remaining)))
  }

  // Exhausted peer/lock-busy retries / deadline — return last real error (never invent success)
  if (lastPeerErr) return lastPeerErr
  if (lastLockBusyMessage) {
    return busyLockErrorResponse(req, lastLockBusyMessage, toolRetries)
  }
  return {
    jsonrpc: '2.0',
    id: req.id,
    error: {
      code: -32001,
      message: `mempalace write failed after ${toolRetries + 1} peer-lock retries`,
      data: { tool: toolNameFromRequest(req) },
    },
  }
}

const stdinRl = createInterface({ input: process.stdin, crlfDelay: Infinity })
stdinRl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return

  let req
  try {
    req = JSON.parse(trimmed)
  } catch {
    // pass through unparsed
    child.stdin.write(line + '\n')
    return
  }

  const name = toolNameFromRequest(req)
  const needsWriteGate = name && isWriteTool(name) && req.id !== undefined && req.id !== null

  if (!needsWriteGate) {
    // reads / initialize / notifications: transparent (bounded wait, not 10min)
    if (req.id !== undefined && req.id !== null) {
      waitChildResponse(req.id, DEFAULT_READ_TIMEOUT_MS)
        .then(forwardToClient)
        .catch((err) => {
          const isTimeout = err && (err.code === 'ABF_CHILD_TIMEOUT' || /timeout/i.test(String(err?.message || '')))
          forwardToClient({
            jsonrpc: '2.0',
            id: req.id,
            error: {
              code: isTimeout ? -32002 : -32000,
              message: String(err?.message || err),
            },
          })
        })
    }
    sendToChild(req)
    return
  }

  // Chain writes so this process never double-locks against itself
  writeChain = writeChain
    .then(async () => {
      const response = await handleWriteCall(req)
      forwardToClient(response)
    })
    .catch((err) => {
      forwardToClient({
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32000,
          message: `mempalace-safe proxy error: ${err?.message || err}`,
        },
      })
    })
})

process.stdin.on('end', () => {
  try {
    child.stdin.end()
  } catch {
    /* ignore */
  }
})

function shutdown() {
  try {
    child.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      child.kill('SIGKILL')
    } catch {
      /* ignore */
    }
    process.exit(0)
  }, 2000).unref?.()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

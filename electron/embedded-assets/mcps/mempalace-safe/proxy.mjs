#!/usr/bin/env node
/**
 * ABF MemPalace Safe Proxy — stdio MCP wrapper
 *
 * Problem: each ABF agent session starts its own mempalace-mcp process. The
 * palace holds a process-lifetime exclusive writer lease, so peers get:
 *   "Peer MCP writer active… / palace peer lock — 未写入"
 * Even with MEMPALACE_MCP_ALLOW_PEER_WRITER=1, per-write mine_palace_lock
 * (non-blocking flock) still fails concurrent chroma upserts with
 * MineAlreadyRunning ("palace … is held by …").
 *
 * Strategy:
 *   cross-process exclusive write queue (file lock + heartbeat) + in-process
 *   write chain; reads unguarded; wait/retry until tool budget so concurrent
 *   multi-agent writers eventually succeed (not busy-skip as the normal path).
 *   On child hang/timeout: kill+respawn child (releases OS flocks) and retry.
 *
 * This proxy:
 * 1. Spawns the user's real mempalace command (from env / argv)
 * 2. Sets MEMPALACE_MCP_ALLOW_PEER_WRITER=1 so peers are not sticky read-only
 * 3. Serializes write tools with a cross-process file lock + exponential backoff
 * 4. On peer-lock / lock-busy / child-timeout, re-acquires lock and retries
 *    within the overall tool budget (never reports success without a child OK)
 *
 * Env:
 *   ABF_MEMPALACE_COMMAND  — child executable (default: mempalace-mcp)
 *   ABF_MEMPALACE_ARGS     — JSON array of child args
 *   ABF_MEMPALACE_WRITE_LOCK — lock file path (optional)
 *   ABF_MEMPALACE_WRITE_RETRIES — lock acquire retries (default 400)
 *   ABF_MEMPALACE_LOCK_MAX_MS — total lock wait budget ms (default 180000)
 *   ABF_MEMPALACE_LOCK_BACKOFF_MAX_MS — per-sleep backoff cap ms (default 250)
 *   ABF_MEMPALACE_LOCK_MAX_HOLD_MS — stuck-holder reclaim ms (default 180000)
 *   ABF_MEMPALACE_TOOL_RETRIES — peer/lock-busy/timeout retries (default 12)
 *   ABF_MEMPALACE_TOOL_MAX_MS — overall write tools/call deadline ms (default 180000)
 *   ABF_MEMPALACE_CHILD_TIMEOUT_MS — per-attempt child response timeout on writes (default 90000)
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
  DEFAULT_LOCK_BACKOFF_MIN_MS,
  DEFAULT_LOCK_BACKOFF_MAX_MS,
  DEFAULT_MAX_HOLD_MS,
  formatHolder,
  readLockMeta,
} from './write-lock.mjs'

/** Default overall write budget (queue wait + own write + peer retries). */
const DEFAULT_TOOL_MAX_MS = 180_000
/** Default peer/lock-busy/timeout retries (deadline usually binds first). */
const DEFAULT_TOOL_RETRIES = 12
/**
 * Default per-attempt child wait on write path.
 * Cold ONNX embed + chroma can take 5–30s+; multi-item checkpoint higher.
 */
const DEFAULT_CHILD_TIMEOUT_MS = 90_000
/** Default wait for non-write child responses (reads / initialize). */
const DEFAULT_READ_TIMEOUT_MS = 60_000
/** Heartbeat while holding the write lock so waiters can detect stuck holders. */
const LOCK_HEARTBEAT_MS = 5_000

/** Min remaining tool budget (ms) to bother another lock-busy retry. */
const MIN_RETRY_REMAINING_MS = 500

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
    s.includes('mine already running') ||
    s.includes('another mempalace writer') ||
    s.includes('is held by') ||
    s.includes('wait for it to finish') ||
    s.includes('peer mcp writer') ||
    (s.includes('peer') && s.includes('lock')) ||
    (s.includes('palace') && s.includes('held by'))
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
  // result payload may be a structured object (some transports)
  if (msg.result && typeof msg.result === 'object' && peerLockMarkersIn(JSON.stringify(msg.result))) {
    return true
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
const lockMaxHoldMs = parseEnvInt('ABF_MEMPALACE_LOCK_MAX_HOLD_MS', DEFAULT_MAX_HOLD_MS)
const toolRetries = parseEnvInt('ABF_MEMPALACE_TOOL_RETRIES', DEFAULT_TOOL_RETRIES)
const toolMaxMs = parseEnvInt('ABF_MEMPALACE_TOOL_MAX_MS', DEFAULT_TOOL_MAX_MS)
const childTimeoutMs = parseEnvInt('ABF_MEMPALACE_CHILD_TIMEOUT_MS', DEFAULT_CHILD_TIMEOUT_MS)

function buildChildEnv() {
  const childEnv = { ...process.env }
  if (
    !('MEMPALACE_MCP_ALLOW_PEER_WRITER' in childEnv) ||
    !String(childEnv.MEMPALACE_MCP_ALLOW_PEER_WRITER || '').trim()
  ) {
    childEnv.MEMPALACE_MCP_ALLOW_PEER_WRITER = '1'
  }
  // Avoid recursive wrap if someone nested proxies
  delete childEnv.ABF_MEMPALACE_COMMAND
  delete childEnv.ABF_MEMPALACE_ARGS
  return childEnv
}

process.stderr.write(
  `[mempalace-safe] proxy → ${command} ${args.join(' ')} (write-lock=${lockPath}; lockRetries=${lockRetries}; lockMaxMs=${lockMaxMs}; lockMaxHoldMs=${lockMaxHoldMs}; toolRetries=${toolRetries}; toolMaxMs=${toolMaxMs}; childTimeoutMs=${childTimeoutMs})\n`,
)

/** @type {import('node:child_process').ChildProcess | null} */
let child = null
/** @type {import('node:readline').Interface | null} */
let childRl = null
/** @type {Map<string|number, { resolve: Function, reject: Function }>} */
const pendingChild = new Map()

/** Serialize write tools within this proxy process */
let writeChain = Promise.resolve()

function rejectAllPending(err) {
  for (const [, p] of pendingChild) {
    try {
      p.reject(err)
    } catch {
      /* ignore */
    }
  }
  pendingChild.clear()
}

function attachChildHandlers(proc) {
  proc.on('error', (err) => {
    process.stderr.write(`[mempalace-safe] child error: ${err.message}\n`)
    rejectAllPending(err)
  })

  proc.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  proc.on('exit', (code, signal) => {
    // Intentional respawn nulls/replaces `child` before killing the old proc.
    if (proc !== child) return
    const err = new Error(
      `mempalace child exited (code=${code ?? 'null'}, signal=${signal || 'none'})`,
    )
    err.code = 'ABF_CHILD_EXIT'
    rejectAllPending(err)
    process.stderr.write(`[mempalace-safe] child exited code=${code} signal=${signal}\n`)
    // Unexpected death of the active child — exit so the host restarts MCP.
    if (signal) process.exit(1)
    process.exit(code ?? 0)
  })

  if (childRl) {
    try {
      childRl.close()
    } catch {
      /* ignore */
    }
  }
  childRl = createInterface({ input: proc.stdout, crlfDelay: Infinity })
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
}

function spawnChild() {
  const proc = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: buildChildEnv(),
  })
  attachChildHandlers(proc)
  return proc
}

child = spawnChild()

function sendToChild(obj) {
  if (!child || !child.stdin || child.stdin.destroyed || child.killed) {
    throw Object.assign(new Error('mempalace child stdin not available'), {
      code: 'ABF_CHILD_DEAD',
    })
  }
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

/**
 * Kill stuck child and spawn a fresh one so OS-level mine_palace flock
 * is released and a subsequent write can proceed.
 */
async function restartChild(reason) {
  process.stderr.write(`[mempalace-safe] restarting child (${reason})\n`)
  const old = child
  // Detach old so its exit handler does not race with the new child assignment
  child = null
  rejectAllPending(
    Object.assign(new Error(`mempalace child restarted: ${reason}`), {
      code: 'ABF_CHILD_RESTART',
    }),
  )

  if (old) {
    try {
      old.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 400))
    try {
      if (!old.killed) old.kill('SIGKILL')
    } catch {
      /* ignore */
    }
    // Give OS a moment to release flock on mine_palace_*.lock
    await new Promise((r) => setTimeout(r, 200))
  }

  child = spawnChild()
  // Best-effort initialize so the new child is ready for tools/call
  try {
    const initId = `abf-reinit-${Date.now()}`
    sendToChild({
      jsonrpc: '2.0',
      id: initId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mempalace-safe', version: '0' },
      },
    })
    await waitChildResponse(initId, 15_000)
    // notifications/initialized (no id) — fire and forget
    try {
      sendToChild({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
    } catch {
      /* ignore */
    }
  } catch (err) {
    process.stderr.write(
      `[mempalace-safe] child re-init after restart failed: ${err?.message || err}\n`,
    )
  }
}

function forwardToClient(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function peerRetryBackoffMs(attempt) {
  // Modest cap so peer retries stay within overall write budget (lease clear)
  return Math.min(2000, 100 * 2 ** attempt)
}

function busyLockErrorResponse(req, message, attempt, extra = {}) {
  const meta = readLockMeta(lockPath)
  return {
    jsonrpc: '2.0',
    id: req.id,
    error: {
      code: -32001,
      message,
      data: {
        tool: toolNameFromRequest(req),
        retried: attempt,
        holder: formatHolder(meta),
        waitedHint: 'queued writers retry until tool budget',
        hint: 'Another ABF session is writing the palace; queued writers retry until tool budget',
        ...extra,
      },
    },
  }
}

function startLockHeartbeat(lock) {
  if (!lock || typeof lock.touch !== 'function') return () => {}
  const timer = setInterval(() => {
    try {
      lock.touch()
    } catch {
      /* ignore */
    }
  }, LOCK_HEARTBEAT_MS)
  timer.unref?.()
  return () => clearInterval(timer)
}

async function handleWriteCall(req) {
  let lastPeerErr = null
  let lastLockBusyMessage = null
  let lastTimeoutMessage = null
  const toolStart = Date.now()
  const toolDeadline = toolMaxMs > 0 ? toolStart + toolMaxMs : Number.POSITIVE_INFINITY

  for (let attempt = 0; attempt <= toolRetries; attempt++) {
    if (attempt > 0 && Date.now() >= toolDeadline) break

    let lock
    let stopHeartbeat = () => {}
    try {
      // Single acquire spans remaining tool budget (queue until front of line).
      // lockMaxMs is an upper cap; never wait longer than remaining budget.
      const remainingForLock = toolDeadline - Date.now()
      if (remainingForLock <= 0) break
      const effectiveMaxWait =
        lockMaxMs > 0 ? Math.min(lockMaxMs, Math.max(0, remainingForLock)) : remainingForLock
      lock = await acquireWriteLock({
        lockPath,
        retries: lockRetries,
        maxWaitMs: effectiveMaxWait,
        minMs: DEFAULT_LOCK_BACKOFF_MIN_MS,
        maxMs: lockBackoffMaxMs,
        maxHoldMs: lockMaxHoldMs,
      })
      stopHeartbeat = startLockHeartbeat(lock)
    } catch (err) {
      if (err && err.code === 'ABF_WRITE_LOCK_BUSY') {
        lastLockBusyMessage = err.message
        // Retry lock-busy while budget remains and attempts left
        const remaining = toolDeadline - Date.now()
        const canRetry = attempt < toolRetries && remaining > MIN_RETRY_REMAINING_MS
        if (!canRetry) {
          return busyLockErrorResponse(req, err.message, attempt, {
            waitedMs: err.waitedMs,
          })
        }
        const sleepFor = peerRetryBackoffMs(attempt)
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
    let childTimedOut = false
    let childDied = false
    let fatalProxyError = null
    try {
      const remainingBudget = toolDeadline - Date.now()
      if (remainingBudget <= 0) {
        // Fall through to release lock below; mark as exhausted timeout.
        childTimedOut = true
        lastTimeoutMessage = `mempalace tools/call timeout after ${toolMaxMs}ms`
      } else {
        // Per-attempt child wait: never exceed remaining overall write budget.
        // Prefer generous childTimeout so slow embeddings complete under the lock.
        const waitMs =
          childTimeoutMs > 0
            ? Math.min(childTimeoutMs, remainingBudget)
            : remainingBudget
        sendToChild(req)
        response = await waitChildResponse(req.id, waitMs)
      }
    } catch (err) {
      if (err && (err.code === 'ABF_CHILD_TIMEOUT' || /timeout/i.test(String(err?.message || '')))) {
        childTimedOut = true
        const waited = err.timeoutMs || childTimeoutMs || toolMaxMs
        lastTimeoutMessage = `mempalace tools/call timeout after ${waited}ms`
      } else if (
        err &&
        (err.code === 'ABF_CHILD_DEAD' ||
          err.code === 'ABF_CHILD_EXIT' ||
          err.code === 'ABF_CHILD_RESTART')
      ) {
        childDied = true
        lastTimeoutMessage = String(err.message || err)
      } else {
        fatalProxyError = err
      }
    }

    // CRITICAL: on hang/timeout, kill+respawn the child WHILE still holding the
    // write lock. Releasing first lets another agent start a concurrent Chroma
    // write against a still-running hung process → multi-client pile-up.
    if (childTimedOut || childDied) {
      try {
        await restartChild(childTimedOut ? 'write-timeout' : 'child-dead')
      } catch (re) {
        process.stderr.write(`[mempalace-safe] restart failed: ${re?.message || re}\n`)
      }
    }

    try {
      stopHeartbeat()
    } catch {
      /* ignore */
    }
    try {
      lock.release()
    } catch {
      /* ignore */
    }

    if (fatalProxyError) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32000,
          message: `mempalace-safe proxy error: ${fatalProxyError?.message || fatalProxyError}`,
          data: { tool: toolNameFromRequest(req), attempt },
        },
      }
    }

    if (childTimedOut || childDied) {
      const remaining = toolDeadline - Date.now()
      const canRetry = attempt < toolRetries && remaining > MIN_RETRY_REMAINING_MS
      if (!canRetry) {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: -32002,
            message: lastTimeoutMessage || `mempalace tools/call timeout after ${toolMaxMs}ms`,
            data: {
              tool: toolNameFromRequest(req),
              attempt,
              waitedMs: Date.now() - toolStart,
              hint: 'Underlying mempalace did not respond in time; child killed under lock then lock released',
            },
          },
        }
      }
      const sleepFor = peerRetryBackoffMs(attempt)
      await new Promise((r) => setTimeout(r, Math.min(sleepFor, Math.max(0, toolDeadline - Date.now()))))
      continue
    }

    if (!isPeerLockResponse(response)) {
      return response
    }

    lastPeerErr = response
    const remaining = toolDeadline - Date.now()
    const canRetry = attempt < toolRetries && remaining > MIN_RETRY_REMAINING_MS
    if (!canRetry) {
      // Enrich last peer error with queue diagnostics when possible
      if (lastPeerErr && lastPeerErr.error && typeof lastPeerErr.error === 'object') {
        lastPeerErr = {
          ...lastPeerErr,
          error: {
            ...lastPeerErr.error,
            data: {
              ...(lastPeerErr.error.data && typeof lastPeerErr.error.data === 'object'
                ? lastPeerErr.error.data
                : {}),
              abf: {
                attempt,
                waitedMs: Date.now() - toolStart,
                holder: formatHolder(readLockMeta(lockPath)),
                hint: 'palace peer/mine lock still held after retries; lock released between attempts',
              },
            },
          },
        }
      }
      return lastPeerErr
    }
    const sleepFor = peerRetryBackoffMs(attempt)
    await new Promise((r) => setTimeout(r, Math.min(sleepFor, remaining)))
  }

  // Exhausted peer/lock-busy retries / deadline — return last real error (never invent success)
  if (lastPeerErr) return lastPeerErr
  if (lastLockBusyMessage) {
    return busyLockErrorResponse(req, lastLockBusyMessage, toolRetries, {
      waitedMs: Date.now() - toolStart,
    })
  }
  if (lastTimeoutMessage) {
    return {
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: -32002,
        message: lastTimeoutMessage,
        data: {
          tool: toolNameFromRequest(req),
          waitedMs: Date.now() - toolStart,
        },
      },
    }
  }
  return {
    jsonrpc: '2.0',
    id: req.id,
    error: {
      code: -32001,
      message: `mempalace write failed after ${toolRetries + 1} peer-lock retries (waited ${Date.now() - toolStart}ms)`,
      data: {
        tool: toolNameFromRequest(req),
        holder: formatHolder(readLockMeta(lockPath)),
      },
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
    try {
      child?.stdin?.write(line + '\n')
    } catch {
      /* ignore */
    }
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
          const isTimeout =
            err && (err.code === 'ABF_CHILD_TIMEOUT' || /timeout/i.test(String(err?.message || '')))
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
    try {
      sendToChild(req)
    } catch (err) {
      if (req.id !== undefined && req.id !== null) {
        forwardToClient({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32000, message: String(err?.message || err) },
        })
      }
    }
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
    child?.stdin?.end()
  } catch {
    /* ignore */
  }
})

function shutdown() {
  try {
    child?.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      child?.kill('SIGKILL')
    } catch {
      /* ignore */
    }
    process.exit(0)
  }, 2000).unref?.()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

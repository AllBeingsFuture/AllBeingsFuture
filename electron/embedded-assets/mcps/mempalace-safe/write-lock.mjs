/**
 * Cross-process exclusive file lock for MemPalace write serialization.
 * Used by the ABF mempalace-safe MCP proxy so multi-agent sessions do not
 * race the shared Chroma/SQLite palace.
 *
 * Lock strategy: O_EXCL create + PID/heartbeat body + stale recovery:
 *   - dead PID → reclaim
 *   - invalid/null PID aged beyond staleMs → reclaim
 *   - live PID with heartbeat older than maxHoldMs → reclaim (stuck holder)
 *   - live PID with fresh heartbeat → never steal
 * Fair queue via wait/retry until maxWaitMs deadline.
 * Release only unlinks when we still own the lock (PID match) so a late
 * release cannot destroy a successor's lock after max-hold steal.
 * No native deps (proper-lockfile / flock bindings not required).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Default total wall-clock budget for lock acquire (queue behind other agents). */
export const DEFAULT_LOCK_MAX_WAIT_MS = 180_000
/** Safety cap on acquire attempts; wall-clock deadline usually binds first. */
export const DEFAULT_LOCK_RETRIES = 400
/** Minimum per-attempt backoff sleep. */
export const DEFAULT_LOCK_BACKOFF_MIN_MS = 25
/** Maximum per-attempt backoff sleep (snappier handoff after release). */
export const DEFAULT_LOCK_BACKOFF_MAX_MS = 250
/**
 * Stale age threshold — only applies when PID is invalid/null.
 * Live PIDs use maxHoldMs (heartbeat age) instead.
 */
export const DEFAULT_STALE_MS = 120_000
/**
 * Max time a live holder may sit without a fresh heartbeat before reclaim.
 * Must exceed a legitimate slow checkpoint (embed + chroma). Heartbeat is
 * refreshed while the proxy holds the lock during an in-flight write.
 */
export const DEFAULT_MAX_HOLD_MS = 180_000

/** Mutating mempalace MCP tools (align with mempalace.service.WRITE_TOOLS + maintenance writers). */
export const WRITE_TOOLS = new Set([
  'mempalace_add_drawer',
  'mempalace_checkpoint',
  'mempalace_delete_by_source',
  'mempalace_delete_drawer',
  'mempalace_update_drawer',
  'mempalace_diary_write',
  'mempalace_kg_add',
  'mempalace_kg_invalidate',
  'mempalace_kg_supersede',
  'mempalace_create_tunnel',
  'mempalace_delete_tunnel',
  'mempalace_delete_hallway',
  'mempalace_hook_settings',
  'mempalace_mine',
  'mempalace_sync',
  // common short aliases if any host strips prefix
  'kg_add',
])

export function isWriteTool(name) {
  const n = String(name || '').trim()
  if (!n) return false
  if (WRITE_TOOLS.has(n)) return true
  // tolerate server-qualified names: mempalace__mempalace_checkpoint
  const bare = n.includes('__') ? n.split('__').pop() : n
  return WRITE_TOOLS.has(bare)
}

export function defaultLockPath() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir()
  return path.join(home, '.mempalace', 'locks', 'abf_write.lock')
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function backoffMs(attempt, { minMs = DEFAULT_LOCK_BACKOFF_MIN_MS, maxMs = DEFAULT_LOCK_BACKOFF_MAX_MS } = {}) {
  const exp = Math.min(maxMs, minMs * 2 ** attempt)
  // full jitter
  return Math.floor(Math.random() * exp)
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM means process exists but we cannot signal it
    return err && err.code === 'EPERM'
  }
}

/**
 * Lock file body (line-oriented, forward-compatible):
 *   line0: pid
 *   line1: startedAtMs (optional)
 *   line2: heartbeatAtMs (optional)
 *   line3: hostname (optional)
 */
export function readLockMeta(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8')
    const lines = raw.split(/\r?\n/)
    const pid = parseInt(String(lines[0] || '').trim().split(/\s+/)[0], 10)
    const startedAtMs = parseInt(String(lines[1] || '').trim(), 10)
    const heartbeatAtMs = parseInt(String(lines[2] || '').trim(), 10)
    const st = fs.statSync(lockPath)
    return {
      pid: Number.isFinite(pid) ? pid : null,
      startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : null,
      heartbeatAtMs: Number.isFinite(heartbeatAtMs) ? heartbeatAtMs : null,
      mtimeMs: st.mtimeMs,
      raw: raw.trim(),
    }
  } catch {
    return null
  }
}

export function formatHolder(meta) {
  if (!meta) return 'unknown holder'
  const parts = []
  if (meta.pid != null) parts.push(`pid ${meta.pid}`)
  else parts.push('unknown pid')
  const now = Date.now()
  const start = meta.startedAtMs ?? meta.mtimeMs
  if (Number.isFinite(start)) parts.push(`held ${Math.max(0, now - start)}ms`)
  const hb = meta.heartbeatAtMs ?? meta.mtimeMs
  if (Number.isFinite(hb)) parts.push(`heartbeatAge ${Math.max(0, now - hb)}ms`)
  return parts.join(', ')
}

function writeLockBody(fdOrPath, { pid, startedAtMs, heartbeatAtMs }) {
  const body = `${pid}\n${startedAtMs}\n${heartbeatAtMs}\n${os.hostname()}\n`
  if (typeof fdOrPath === 'number') {
    fs.ftruncateSync(fdOrPath, 0)
    fs.writeSync(fdOrPath, body, 0, 'utf8')
    try {
      fs.fsyncSync(fdOrPath)
    } catch {
      /* fsync best-effort */
    }
  } else {
    fs.writeFileSync(fdOrPath, body, 'utf8')
  }
}

/**
 * Refresh heartbeat for a lock we own. Safe no-op if we no longer own it.
 * @returns {boolean} true if heartbeat written
 */
export function touchLock(lockPath, { fd = null } = {}) {
  const now = Date.now()
  try {
    if (fd != null) {
      // Re-read start from existing body when possible
      let startedAtMs = now
      try {
        const meta = readLockMeta(lockPath)
        if (meta?.startedAtMs) startedAtMs = meta.startedAtMs
      } catch {
        /* ignore */
      }
      writeLockBody(fd, { pid: process.pid, startedAtMs, heartbeatAtMs: now })
      return true
    }
    const meta = readLockMeta(lockPath)
    if (!meta || meta.pid !== process.pid) return false
    writeLockBody(lockPath, {
      pid: process.pid,
      startedAtMs: meta.startedAtMs ?? now,
      heartbeatAtMs: now,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Reclaim a lock file only when it is safe:
 * - PID known and dead → reclaim
 * - PID invalid/null and aged beyond staleMs → reclaim
 * - PID alive but heartbeat older than maxHoldMs → reclaim (stuck holder)
 * - PID alive with fresh heartbeat → never reclaim
 *
 * @returns {boolean} true if lock file was removed
 */
export function tryRemoveStale(
  lockPath,
  { staleMs = DEFAULT_STALE_MS, maxHoldMs = DEFAULT_MAX_HOLD_MS } = {},
) {
  const meta = readLockMeta(lockPath)
  if (!meta) return false

  const now = Date.now()
  const hb = meta.heartbeatAtMs ?? meta.mtimeMs
  const heartbeatAge = Number.isFinite(hb) ? now - hb : Infinity

  // Live holder with fresh heartbeat: never steal
  if (meta.pid != null && isPidAlive(meta.pid)) {
    if (maxHoldMs > 0 && heartbeatAge > maxHoldMs) {
      // Stuck live holder (no heartbeat for too long) — reclaim so queue can proceed
      try {
        fs.unlinkSync(lockPath)
        return true
      } catch {
        return false
      }
    }
    return false
  }

  // Dead PID (known and not alive) → reclaim
  const dead = meta.pid != null && !isPidAlive(meta.pid)
  // Invalid/null PID → reclaim only when aged
  const invalidPid = meta.pid == null
  const aged = now - meta.mtimeMs > staleMs

  if (!dead && !(invalidPid && aged)) return false

  try {
    fs.unlinkSync(lockPath)
    return true
  } catch {
    return false
  }
}

/**
 * Acquire exclusive write lock.
 * Retries until retries exhausted or wall-clock deadline (maxWaitMs) is hit.
 * @returns {{ release: () => void, touch: () => boolean, attempts: number, lockPath: string, fd: number }}
 */
export async function acquireWriteLock(options = {}) {
  const lockPath = options.lockPath || defaultLockPath()
  const retries = options.retries ?? DEFAULT_LOCK_RETRIES
  const minMs = options.minMs ?? DEFAULT_LOCK_BACKOFF_MIN_MS
  const maxMs = options.maxMs ?? DEFAULT_LOCK_BACKOFF_MAX_MS
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_LOCK_MAX_WAIT_MS
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS
  const maxHoldMs = options.maxHoldMs ?? DEFAULT_MAX_HOLD_MS

  const start = Date.now()
  // maxWaitMs === 0 → no wall-clock deadline (retries still cap); prefer both caps in normal use
  const deadline = maxWaitMs > 0 ? start + maxWaitMs : Number.POSITIVE_INFINITY

  fs.mkdirSync(path.dirname(lockPath), { recursive: true })

  let lastErr = null
  let attempts = 0
  for (let attempt = 0; attempt <= retries && Date.now() < deadline; attempt++) {
    attempts = attempt + 1
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600)
      const now = Date.now()
      try {
        writeLockBody(fd, { pid: process.pid, startedAtMs: now, heartbeatAtMs: now })
      } catch {
        // ignore write body failure; exclusive create is enough
      }
      let released = false
      const release = () => {
        if (released) return
        released = true
        try {
          fs.closeSync(fd)
        } catch {
          /* ignore */
        }
        // Only unlink if we still own the lock — a max-hold reclaim may have
        // already given the path to another process.
        try {
          const meta = readLockMeta(lockPath)
          if (meta && meta.pid === process.pid) {
            fs.unlinkSync(lockPath)
          }
        } catch {
          /* ignore */
        }
      }
      const touch = () => touchLock(lockPath, { fd })
      return { release, touch, attempts, lockPath, fd }
    } catch (err) {
      lastErr = err
      if (!err || err.code !== 'EEXIST') {
        throw err
      }
      tryRemoveStale(lockPath, { staleMs, maxHoldMs })
      // stop if next attempt would exceed retries or we are at/after deadline
      if (attempt >= retries || Date.now() >= deadline) break
      const sleepFor = backoffMs(attempt, { minMs, maxMs })
      // do not sleep past deadline when maxWaitMs is finite
      if (maxWaitMs > 0) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) break
        await sleep(Math.min(sleepFor, remaining))
      } else {
        await sleep(sleepFor)
      }
    }
  }

  const waitedMs = Date.now() - start
  const meta = readLockMeta(lockPath)
  const holder = formatHolder(meta)
  const alive =
    meta?.pid != null && isPidAlive(meta.pid) ? 'alive' : meta?.pid != null ? 'dead' : 'n/a'
  const err = new Error(
    `mempalace write lock busy (${holder}, ${alive}), retried ${attempts} times over ${waitedMs}ms: ${lockPath}`,
  )
  err.code = 'ABF_WRITE_LOCK_BUSY'
  err.cause = lastErr
  err.waitedMs = waitedMs
  err.attempts = attempts
  err.holder = meta
  throw err
}

/**
 * Run async fn under write lock.
 */
export async function withWriteLock(fn, options = {}) {
  const handle = await acquireWriteLock(options)
  let heartbeatTimer = null
  try {
    if (typeof handle.touch === 'function') {
      heartbeatTimer = setInterval(() => {
        try {
          handle.touch()
        } catch {
          /* ignore */
        }
      }, 5_000)
      heartbeatTimer.unref?.()
    }
    return await fn(handle)
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    handle.release()
  }
}

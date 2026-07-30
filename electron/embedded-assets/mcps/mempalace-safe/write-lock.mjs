/**
 * Cross-process exclusive file lock for MemPalace write serialization.
 * Used by the ABF mempalace-safe MCP proxy so multi-agent sessions do not
 * race the shared Chroma/SQLite palace.
 *
 * Lock strategy: O_EXCL create + PID body + stale recovery (dead PID / mtime).
 * No native deps (proper-lockfile not required).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Default total wall-clock budget for lock acquire (multi-agent short contention). */
export const DEFAULT_LOCK_MAX_WAIT_MS = 90_000
/** High safety cap on acquire attempts; deadline usually binds first. */
export const DEFAULT_LOCK_RETRIES = 200
/** Minimum per-attempt backoff sleep. */
export const DEFAULT_LOCK_BACKOFF_MIN_MS = 50
/** Maximum per-attempt backoff sleep (not total wait). */
export const DEFAULT_LOCK_BACKOFF_MAX_MS = 3000

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

function readLockMeta(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8').trim()
    const pid = parseInt(raw.split(/\s+/)[0], 10)
    const st = fs.statSync(lockPath)
    return { pid: Number.isFinite(pid) ? pid : null, mtimeMs: st.mtimeMs, raw }
  } catch {
    return null
  }
}

function tryRemoveStale(lockPath, { staleMs = 120_000 } = {}) {
  const meta = readLockMeta(lockPath)
  if (!meta) return false
  const dead = meta.pid != null && !isPidAlive(meta.pid)
  const aged = Date.now() - meta.mtimeMs > staleMs
  if (!dead && !aged) return false
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
 * @returns {{ release: () => void, attempts: number, lockPath: string }}
 */
export async function acquireWriteLock(options = {}) {
  const lockPath = options.lockPath || defaultLockPath()
  const retries = options.retries ?? DEFAULT_LOCK_RETRIES
  const minMs = options.minMs ?? DEFAULT_LOCK_BACKOFF_MIN_MS
  const maxMs = options.maxMs ?? DEFAULT_LOCK_BACKOFF_MAX_MS
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_LOCK_MAX_WAIT_MS
  const staleMs = options.staleMs ?? 120_000

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
      try {
        fs.writeFileSync(fd, `${process.pid}\n`, 'utf8')
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
        try {
          fs.unlinkSync(lockPath)
        } catch {
          /* ignore */
        }
      }
      return { release, attempts, lockPath }
    } catch (err) {
      lastErr = err
      if (!err || err.code !== 'EEXIST') {
        throw err
      }
      tryRemoveStale(lockPath, { staleMs })
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
  const holder = meta?.pid != null ? `pid ${meta.pid}` : 'unknown holder'
  const err = new Error(
    `mempalace write lock busy (${holder}), retried ${attempts} times over ${waitedMs}ms: ${lockPath}`,
  )
  err.code = 'ABF_WRITE_LOCK_BUSY'
  err.cause = lastErr
  throw err
}

/**
 * Run async fn under write lock.
 */
export async function withWriteLock(fn, options = {}) {
  const handle = await acquireWriteLock(options)
  try {
    return await fn(handle)
  } finally {
    handle.release()
  }
}

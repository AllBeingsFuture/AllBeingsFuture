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

export function backoffMs(attempt, { minMs = 50, maxMs = 2000 } = {}) {
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
 * @returns {{ release: () => void, attempts: number, lockPath: string }}
 */
export async function acquireWriteLock(options = {}) {
  const lockPath = options.lockPath || defaultLockPath()
  const retries = options.retries ?? 10
  const minMs = options.minMs ?? 50
  const maxMs = options.maxMs ?? 2000
  const staleMs = options.staleMs ?? 120_000

  fs.mkdirSync(path.dirname(lockPath), { recursive: true })

  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt++) {
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
      return { release, attempts: attempt + 1, lockPath }
    } catch (err) {
      lastErr = err
      if (!err || err.code !== 'EEXIST') {
        throw err
      }
      tryRemoveStale(lockPath, { staleMs })
      if (attempt >= retries) break
      await sleep(backoffMs(attempt, { minMs, maxMs }))
    }
  }

  const meta = readLockMeta(lockPath)
  const holder = meta?.pid != null ? `pid ${meta.pid}` : 'unknown holder'
  const err = new Error(
    `mempalace write lock busy (${holder}), retried ${retries + 1} times: ${lockPath}`,
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

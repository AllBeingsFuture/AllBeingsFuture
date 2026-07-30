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
 *   ABF_MEMPALACE_WRITE_RETRIES — lock acquire retries (default 10)
 *   ABF_MEMPALACE_TOOL_RETRIES — peer-lock response retries (default 5)
 *   MEMPALACE_MCP_ALLOW_PEER_WRITER — default forced to "1" unless already set
 *
 * Argv: node proxy.mjs [--] <command> [args...]
 *   overrides ABF_MEMPALACE_COMMAND / ARGS when present after --
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { acquireWriteLock, isWriteTool, defaultLockPath } from './write-lock.mjs'

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

function isPeerLockResponse(msg) {
  if (!msg || typeof msg !== 'object') return false
  if (!msg.error) return false
  const blob = JSON.stringify(msg.error).toLowerCase()
  return (
    blob.includes('peer') ||
    blob.includes('palace lock') ||
    blob.includes('peer-writer') ||
    blob.includes('read-only for mutating') ||
    blob.includes('minealreadyrunning') ||
    blob.includes('another mempalace writer')
  )
}

function toolNameFromRequest(req) {
  if (!req || req.method !== 'tools/call') return null
  const name = req.params?.name
  return typeof name === 'string' ? name : null
}

const { command, args } = parseChildLaunch()
const lockPath = process.env.ABF_MEMPALACE_WRITE_LOCK || defaultLockPath()
const lockRetries = Math.max(0, parseInt(process.env.ABF_MEMPALACE_WRITE_RETRIES || '10', 10) || 10)
const toolRetries = Math.max(0, parseInt(process.env.ABF_MEMPALACE_TOOL_RETRIES || '5', 10) || 5)

const childEnv = { ...process.env }
if (!('MEMPALACE_MCP_ALLOW_PEER_WRITER' in childEnv) || !String(childEnv.MEMPALACE_MCP_ALLOW_PEER_WRITER || '').trim()) {
  childEnv.MEMPALACE_MCP_ALLOW_PEER_WRITER = '1'
}
// Avoid recursive wrap if someone nested proxies
delete childEnv.ABF_MEMPALACE_COMMAND
delete childEnv.ABF_MEMPALACE_ARGS

process.stderr.write(
  `[mempalace-safe] proxy → ${command} ${args.join(' ')} (write-lock=${lockPath})\n`,
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

function waitChildResponse(id, timeoutMs = 600_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingChild.delete(id)
      reject(new Error(`mempalace-safe: timeout waiting for child response id=${id}`))
    }, timeoutMs)

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

async function handleWriteCall(req) {
  let lastPeerErr = null
  for (let attempt = 0; attempt <= toolRetries; attempt++) {
    let lock
    try {
      lock = await acquireWriteLock({
        lockPath,
        retries: lockRetries,
        minMs: 50,
        maxMs: 2000,
      })
    } catch (err) {
      const message =
        err && err.code === 'ABF_WRITE_LOCK_BUSY'
          ? err.message
          : `mempalace write lock failed: ${err?.message || err}`
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

    try {
      sendToChild(req)
      const response = await waitChildResponse(req.id)
      if (isPeerLockResponse(response) && attempt < toolRetries) {
        lastPeerErr = response
        // brief pause so peer can release process-lifetime lease or finish write
        await new Promise((r) => setTimeout(r, 50 * 2 ** attempt))
        continue
      }
      return response
    } finally {
      lock.release()
    }
  }

  // Exhausted peer retries — return last child error (never invent success)
  if (lastPeerErr) return lastPeerErr
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
    // reads / initialize / notifications: transparent
    if (req.id !== undefined && req.id !== null) {
      waitChildResponse(req.id)
        .then(forwardToClient)
        .catch((err) => {
          forwardToClient({
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32000, message: String(err?.message || err) },
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

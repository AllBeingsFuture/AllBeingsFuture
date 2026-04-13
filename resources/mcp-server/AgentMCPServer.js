#!/usr/bin/env node

/**
 * AllBeingsFuture Agent MCP Server
 *
 * A Model Context Protocol (MCP) server that runs over stdio and bridges
 * AI CLI tools (Claude Code, Codex, etc.) to the AllBeingsFuture Go backend.
 *
 * Features:
 * - File operation tools (edit, write, create, delete) with change tracking
 * - Agent management tools (spawn, wait, cancel) forwarded to Go bridge
 * - Git worktree tools (enter, check_merge, merge) forwarded to Go bridge
 * - Cross-session awareness tools (list, search, summary)
 * - Session mode filtering (supervisor / member / awareness)
 *
 * Environment variables:
 *   ABF_SESSION_ID   - Current session ID
 *   ABF_BRIDGE_PORT  - Go bridge WebSocket port
 *   ABF_WORK_DIR     - Working directory
 *   ABF_SESSION_MODE - Tool visibility tier (supervisor|member|awareness)
 *   ABF_MCP_TOKEN    - Auth token for bridge connection
 */

import { createInterface } from 'node:readline'
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'

// ---- Configuration ----
const SESSION_ID = process.env.ABF_SESSION_ID || ''
const BRIDGE_PORT = parseInt(process.env.ABF_BRIDGE_PORT || '0', 10)
let currentWorkDir = process.env.ABF_WORK_DIR || process.cwd()
const SESSION_MODE = process.env.ABF_SESSION_MODE || 'supervisor'
const MCP_TOKEN = process.env.ABF_MCP_TOKEN || ''

// ---- Logging (stderr only, stdout is for MCP protocol) ----
function log(...args) {
  process.stderr.write(`[AgentMCPServer] ${args.join(' ')}\n`)
}

// ---- WebSocket Bridge Client ----
let ws = null
let wsReady = false
const pendingRequests = new Map() // id → { resolve, reject, timer }

function connectBridge() {
  if (!BRIDGE_PORT) {
    log('No BRIDGE_PORT set, bridge features disabled')
    return
  }

  const url = `ws://127.0.0.1:${BRIDGE_PORT}?token=${encodeURIComponent(MCP_TOKEN)}`
  log(`Connecting to bridge: ws://127.0.0.1:${BRIDGE_PORT}`)

  try {
    ws = new WebSocket(url)
  } catch (err) {
    log('WebSocket constructor failed:', err.message)
    scheduleReconnect()
    return
  }

  ws.addEventListener('open', () => {
    log('Bridge connected, registering session:', SESSION_ID)
    ws.send(JSON.stringify({ type: 'register', sessionId: SESSION_ID }))
  })

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())

      if (msg.type === 'registered') {
        wsReady = true
        log('Bridge registered successfully')
        return
      }

      if (msg.type === 'pong') return

      if (msg.type === 'response' && msg.id) {
        const pending = pendingRequests.get(msg.id)
        if (pending) {
          pendingRequests.delete(msg.id)
          clearTimeout(pending.timer)
          if (msg.error) {
            pending.reject(new Error(msg.error))
          } else {
            pending.resolve(msg.result)
          }
        }
        return
      }
    } catch (err) {
      log('Message parse error:', err.message)
    }
  })

  ws.addEventListener('close', () => {
    wsReady = false
    log('Bridge disconnected')
    rejectAllPending('Bridge disconnected')
    scheduleReconnect()
  })

  ws.addEventListener('error', (err) => {
    log('Bridge error:', err.message || 'unknown')
  })
}

let reconnectTimer = null
function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectBridge()
  }, 3000)
}

function rejectAllPending(reason) {
  for (const [id, pending] of pendingRequests) {
    clearTimeout(pending.timer)
    pending.reject(new Error(reason))
    pendingRequests.delete(id)
  }
}

/**
 * Send a request to the Go bridge and wait for response.
 */
function bridgeRequest(method, params, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (!ws || !wsReady) {
      reject(new Error('Bridge not connected'))
      return
    }
    const id = randomUUID()
    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Bridge request timeout: ${method}`))
    }, timeoutMs)

    pendingRequests.set(id, { resolve, reject, timer })

    ws.send(JSON.stringify({
      type: 'request',
      id,
      sessionId: SESSION_ID,
      method,
      params: params || {},
    }))
  })
}

function findGitMetadataPath(startDir) {
  let dir = resolve(startDir || currentWorkDir || process.cwd())
  while (true) {
    const gitPath = resolve(dir, '.git')
    if (existsSync(gitPath)) return gitPath
    const parent = resolve(dir, '..')
    if (parent === dir) return null
    dir = parent
  }
}

function isWorktreeSessionDir(dir) {
  const markers = [
    '.allbeingsfuture-worktrees',
    '.abf-worktrees',
    '.claude/worktrees',
    '.claude\\worktrees',
  ]
  if (markers.some(marker => String(dir || '').includes(marker))) return true

  const gitPath = findGitMetadataPath(dir)
  if (!gitPath) return false

  try {
    return statSync(gitPath).isFile()
  } catch {
    return false
  }
}

function requireWorktreeForWrite() {
  const gitPath = findGitMetadataPath(currentWorkDir)
  if (!gitPath) return null
  if (isWorktreeSessionDir(currentWorkDir)) return null

  return {
    isError: true,
    content: [{
      type: 'text',
      text: `Write operations are blocked in non-worktree sessions. Call enter_worktree first (cwd: ${currentWorkDir}).`,
    }],
  }
}

function updateCurrentWorkDirFromResult(result) {
  const candidates = [
    result?.path,
    result?.worktreePath,
    result?.worktree_path,
    result?.data?.path,
    result?.data?.worktreePath,
    result?.data?.worktree_path,
    result?.worktree?.path,
    result?.worktree?.worktreePath,
  ]

  const nextDir = candidates.find(value => typeof value === 'string' && value.trim().length > 0)
  if (nextDir) {
    currentWorkDir = nextDir
    log(`Updated work dir to worktree: ${currentWorkDir}`)
  }
}

/**
 * Notify bridge of a file change (fire-and-forget).
 */
function notifyFileChange(filePath, action) {
  if (!ws || !wsReady) return
  try {
    ws.send(JSON.stringify({
      type: 'file-change',
      sessionId: SESSION_ID,
      data: { filePath, action, timestamp: Date.now() },
    }))
  } catch (_) { /* ignore */ }
}

// ---- Tool Definitions ----

const FILE_TOOLS = [
  {
    name: 'allbeingsfuture_edit_file',
    description: 'Edit a file by replacing a specific string with a new string. The old_string must uniquely match exactly one location in the file.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit' },
        old_string: { type: 'string', description: 'The exact string to find and replace (must be unique in the file)' },
        new_string: { type: 'string', description: 'The replacement string' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'allbeingsfuture_write_file',
    description: 'Write content to a file, overwriting any existing content. Creates parent directories if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to write' },
        content: { type: 'string', description: 'Complete file content to write' },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'allbeingsfuture_create_file',
    description: 'Create a new file with the given content. Fails if the file already exists.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path for the new file' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'allbeingsfuture_delete_file',
    description: 'Delete a file at the given path.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to delete' },
      },
      required: ['file_path'],
    },
  },
]

const AGENT_TOOLS = [
  {
    name: 'spawn_agent',
    description: 'Create a child agent session to handle a sub-task. Returns agentId and childSessionId.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name' },
        prompt: { type: 'string', description: 'Initial prompt/task for the agent' },
        workDir: { type: 'string', description: 'Working directory (optional)' },
        provider: { type: 'string', description: 'AI provider to use (optional)' },
        oneShot: { type: 'boolean', description: 'Auto-exit after completion (default true)' },
      },
      required: ['name', 'prompt'],
    },
  },
  {
    name: 'send_to_agent',
    description: 'Send a follow-up message to a running agent (only useful when oneShot=false).',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID returned by spawn_agent' },
        message: { type: 'string', description: 'Message to send' },
      },
      required: ['agentId', 'message'],
    },
  },
  {
    name: 'wait_agent_idle',
    description: 'Wait for an agent to finish its current task and become idle.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (optional)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'wait_agent',
    description: 'Wait for an agent process to exit completely and get the final result.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (optional)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'get_agent_output',
    description: 'Get the last N lines of terminal output from an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        lines: { type: 'number', description: 'Number of lines to retrieve (default 50)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'get_agent_status',
    description: 'Get the current status and metadata of an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'list_agents',
    description: 'List all child agents spawned by the current session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cancel_agent',
    description: 'Terminate a child agent session.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to cancel' },
      },
      required: ['agentId'],
    },
  },
]

const WORKTREE_TOOLS = [
  {
    name: 'enter_worktree',
    description: 'Create an isolated git worktree for the current session.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Repository path (optional, auto-detected)' },
        worktreeName: { type: 'string', description: 'Human-readable name for the worktree' },
        branchName: { type: 'string', description: 'Branch name (auto-generated if omitted)' },
        baseBranch: { type: 'string', description: 'Expected base branch (validation)' },
        allowDirty: { type: 'boolean', description: 'Allow creation even with uncommitted changes' },
      },
    },
  },
  {
    name: 'check_merge',
    description: 'Check if a worktree branch can be safely merged back to main.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Repository path (optional)' },
        worktreePath: { type: 'string', description: 'Worktree path (optional)' },
      },
    },
  },
  {
    name: 'merge_worktree',
    description: 'Merge a worktree branch back into the target branch.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Repository path (optional)' },
        branchName: { type: 'string', description: 'Branch to merge (optional, auto-detected)' },
        worktreePath: { type: 'string', description: 'Worktree path (optional)' },
        targetBranch: { type: 'string', description: 'Target branch (default: main)' },
        squash: { type: 'boolean', description: 'Squash merge (default true)' },
        message: { type: 'string', description: 'Commit message' },
        cleanup: { type: 'boolean', description: 'Remove worktree after merge' },
      },
    },
  },
]

const STICKER_TOOLS = [
  {
    name: 'send_sticker',
    description: 'Send a sticker/emoji image to express emotion in the conversation. Use this when you want to react with a fun sticker image. Available moods: happy (开心), sad (难过), angry (生气), greeting (问候), encourage (加油), love (爱), tired (摸鱼), surprise (震惊). The tool returns a sticker image URL that will be rendered inline in the conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          description: 'The mood/emotion to express',
          enum: ['happy', 'sad', 'angry', 'greeting', 'encourage', 'love', 'tired', 'surprise'],
        },
      },
      required: ['mood'],
    },
  },
]

const AWARENESS_TOOLS = [
  {
    name: 'list_sessions',
    description: 'List all sessions with their names, status, and working directories.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status (optional)' },
        limit: { type: 'number', description: 'Max results (optional)' },
      },
    },
  },
  {
    name: 'get_session_summary',
    description: 'Get a summary of a session\'s activity including AI responses, modified files, and commands.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID (optional)' },
        sessionName: { type: 'string', description: 'Session name (optional)' },
      },
    },
  },
  {
    name: 'search_sessions',
    description: 'Search across all sessions by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (optional)' },
      },
      required: ['query'],
    },
  },
]

/**
 * Get tools visible for the current session mode.
 */
function getVisibleTools() {
  switch (SESSION_MODE) {
    case 'supervisor':
      return [...FILE_TOOLS, ...AGENT_TOOLS, ...WORKTREE_TOOLS, ...AWARENESS_TOOLS, ...STICKER_TOOLS]
    case 'member':
      return [...FILE_TOOLS, ...WORKTREE_TOOLS, ...STICKER_TOOLS]
    case 'awareness':
      return [...AWARENESS_TOOLS]
    default:
      return [...FILE_TOOLS, ...STICKER_TOOLS]
  }
}

// ---- File Operation Implementations ----

function resolvePath(filePath) {
  if (isAbsolute(filePath)) return filePath
  return resolve(currentWorkDir, filePath)
}

function handleEditFile(args) {
  const isolationError = requireWorktreeForWrite()
  if (isolationError) return isolationError

  const { file_path, old_string, new_string } = args
  const fullPath = resolvePath(file_path)

  if (!existsSync(fullPath)) {
    return { isError: true, content: [{ type: 'text', text: `File not found: ${fullPath}` }] }
  }

  const content = readFileSync(fullPath, 'utf-8')
  const occurrences = content.split(old_string).length - 1

  if (occurrences === 0) {
    return { isError: true, content: [{ type: 'text', text: `old_string not found in ${fullPath}` }] }
  }
  if (occurrences > 1) {
    return { isError: true, content: [{ type: 'text', text: `old_string matches ${occurrences} locations in ${fullPath}. Provide more context to make it unique.` }] }
  }

  const newContent = content.replace(old_string, new_string)
  writeFileSync(fullPath, newContent, 'utf-8')
  notifyFileChange(fullPath, 'edit')

  return { content: [{ type: 'text', text: `Successfully edited ${fullPath}` }] }
}

function handleWriteFile(args) {
  const isolationError = requireWorktreeForWrite()
  if (isolationError) return isolationError

  const { file_path, content } = args
  const fullPath = resolvePath(file_path)

  const dir = dirname(fullPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(fullPath, content, 'utf-8')
  notifyFileChange(fullPath, 'write')

  return { content: [{ type: 'text', text: `Successfully wrote ${fullPath} (${content.length} chars)` }] }
}

function handleCreateFile(args) {
  const isolationError = requireWorktreeForWrite()
  if (isolationError) return isolationError

  const { file_path, content } = args
  const fullPath = resolvePath(file_path)

  if (existsSync(fullPath)) {
    return { isError: true, content: [{ type: 'text', text: `File already exists: ${fullPath}. Use allbeingsfuture_write_file to overwrite.` }] }
  }

  const dir = dirname(fullPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(fullPath, content, 'utf-8')
  notifyFileChange(fullPath, 'create')

  return { content: [{ type: 'text', text: `Successfully created ${fullPath} (${content.length} chars)` }] }
}

function handleDeleteFile(args) {
  const isolationError = requireWorktreeForWrite()
  if (isolationError) return isolationError

  const { file_path } = args
  const fullPath = resolvePath(file_path)

  if (!existsSync(fullPath)) {
    return { isError: true, content: [{ type: 'text', text: `File not found: ${fullPath}` }] }
  }

  unlinkSync(fullPath)
  notifyFileChange(fullPath, 'delete')

  return { content: [{ type: 'text', text: `Successfully deleted ${fullPath}` }] }
}

// ---- Bridge-forwarded Tool Handler ----

const BRIDGE_METHODS = new Set([
  'spawn_agent', 'send_to_agent', 'wait_agent_idle', 'wait_agent',
  'get_agent_output', 'get_agent_status', 'list_agents', 'cancel_agent',
  'enter_worktree', 'check_merge', 'merge_worktree',
  'list_sessions', 'get_session_summary', 'search_sessions',
  'send_sticker',
])

async function handleToolCall(name, args) {
  // File operations: handled locally
  switch (name) {
    case 'allbeingsfuture_edit_file':
      return handleEditFile(args)
    case 'allbeingsfuture_write_file':
      return handleWriteFile(args)
    case 'allbeingsfuture_create_file':
      return handleCreateFile(args)
    case 'allbeingsfuture_delete_file':
      return handleDeleteFile(args)
  }

  // Bridge-forwarded tools
  if (BRIDGE_METHODS.has(name)) {
    // Long-running operations get extended timeout
    const longRunning = new Set(['wait_agent', 'wait_agent_idle', 'spawn_agent', 'merge_worktree'])
    const timeout = longRunning.has(name) ? 600000 : 120000

    try {
      const result = await bridgeRequest(name, args, timeout)
      if (name === 'enter_worktree') {
        updateCurrentWorkDirFromResult(result)
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Bridge error (${name}): ${err.message}` }] }
    }
  }

  return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
}

// ---- MCP Protocol (JSON-RPC 2.0 over stdio) ----

const SERVER_INFO = {
  name: 'allbeingsfuture-agent',
  version: '1.0.0',
}

const CAPABILITIES = {
  tools: {},
}

function sendResponse(id, result) {
  const msg = { jsonrpc: '2.0', id, result }
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function sendError(id, code, message) {
  const msg = { jsonrpc: '2.0', id, error: { code, message } }
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function sendNotification(method, params) {
  const msg = { jsonrpc: '2.0', method, params }
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function handleMessage(raw) {
  let msg
  try {
    msg = JSON.parse(raw)
  } catch {
    sendError(null, -32700, 'Parse error')
    return
  }

  const { id, method, params } = msg

  switch (method) {
    case 'initialize':
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        serverInfo: SERVER_INFO,
        capabilities: CAPABILITIES,
      })
      break

    case 'initialized':
      // Client acknowledgement, no response needed (it's a notification)
      break

    case 'ping':
      sendResponse(id, {})
      break

    case 'tools/list':
      sendResponse(id, { tools: getVisibleTools() })
      break

    case 'tools/call': {
      const toolName = params?.name
      const toolArgs = params?.arguments || {}

      // Verify tool is visible for current session mode
      const visible = getVisibleTools()
      if (!visible.find(t => t.name === toolName)) {
        sendResponse(id, {
          isError: true,
          content: [{ type: 'text', text: `Tool "${toolName}" is not available in session mode "${SESSION_MODE}"` }],
        })
        break
      }

      try {
        const result = await handleToolCall(toolName, toolArgs)
        sendResponse(id, result)
      } catch (err) {
        sendResponse(id, {
          isError: true,
          content: [{ type: 'text', text: `Tool execution failed: ${err.message}` }],
        })
      }
      break
    }

    case 'notifications/cancelled':
      // Client cancelled a request, ignore gracefully
      break

    default:
      if (id !== undefined) {
        sendError(id, -32601, `Method not found: ${method}`)
      }
      break
  }
}

// ---- Heartbeat ----

let heartbeatTimer = null
function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    if (ws && wsReady) {
      try {
        ws.send(JSON.stringify({ type: 'ping', sessionId: SESSION_ID }))
      } catch (_) { /* ignore */ }
    }
  }, 30000)
}

// ---- Main ----

function main() {
  log(`Starting (session=${SESSION_ID}, mode=${SESSION_MODE}, bridge=:${BRIDGE_PORT})`)

  // Connect to Go bridge
  connectBridge()
  startHeartbeat()

  // Read JSON-RPC messages from stdin (one per line)
  const rl = createInterface({ input: process.stdin, terminal: false })

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    handleMessage(trimmed).catch(err => {
      log('Message handler error:', err.message)
    })
  })

  rl.on('close', () => {
    log('stdin closed, shutting down')
    cleanup()
    process.exit(0)
  })

  // Graceful shutdown
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
}

function cleanup() {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  rejectAllPending('Server shutting down')
  if (ws) {
    try { ws.close() } catch (_) { /* ignore */ }
  }
}

main()

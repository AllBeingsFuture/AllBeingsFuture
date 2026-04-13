/**
 * AgentApi - Internal HTTP API for MCP server to manage persistent child agents
 *
 * Runs a lightweight HTTP server on localhost:0 (random port).
 * The agent-control MCP server (spawned by Claude SDK) calls these endpoints
 * to spawn / send / list / close persistent child agents.
 */

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ProcessService } from './process.js'
import type { ProviderService } from './provider.js'
import type { AIProvider } from './provider.js'
import type { AgentApiBody } from './process-types.js'
import { appLog } from './log.js'

export class AgentApi {
  private server: http.Server | null = null
  private port = 0

  constructor(
    private processService: ProcessService,
    private providerService: ProviderService,
  ) {}

  getPort(): number {
    return this.port
  }

  async start(): Promise<number> {
    if (this.server) return this.port

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          appLog('error', `Agent API unhandled: ${err.message}`, 'agent-api')
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
          }
          res.end(JSON.stringify({ error: err.message }))
        })
      })

      // Keep connections alive for long-running requests (agent processing)
      this.server.keepAliveTimeout = 600_000
      this.server.headersTimeout = 610_000

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as AddressInfo
        this.port = addr.port
        appLog('info', `Agent API started on port ${this.port}`, 'agent-api')
        resolve(this.port)
      })

      this.server.on('error', (err) => {
        appLog('error', `Agent API listen error: ${err.message}`, 'agent-api')
        reject(err)
      })
    })
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close()
      this.server = null
      this.port = 0
    }
  }

  // ─── Request routing ───────────────────────────────────────────

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // Only allow localhost connections
    const remote = req.socket.remoteAddress || ''
    if (!remote.includes('127.0.0.1') && remote !== '::1') {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    // Disable response timeout for long-running agent operations
    res.setTimeout(0)

    const url = new URL(req.url || '/', 'http://localhost')

    try {
      const body: AgentApiBody = req.method === 'POST' ? await this.readBody(req) : {}
      let result: unknown

      switch (url.pathname) {
        case '/spawn':
          result = await this.handleSpawn(body)
          break
        case '/send':
          result = await this.handleSend(body)
          break
        case '/list':
          result = await this.handleList(body)
          break
        case '/close':
          result = await this.handleClose(body)
          break
        case '/wait-idle':
          result = await this.handleWaitIdle(body)
          break
        case '/get-output':
          result = await this.handleGetOutput(body)
          break
        case '/get-status':
          result = await this.handleGetStatus(body)
          break
        case '/list-sessions':
          result = await this.handleListSessions(body)
          break
        case '/get-session-summary':
          result = await this.handleGetSessionSummary(body)
          break
        case '/search-sessions':
          result = await this.handleSearchSessions(body)
          break
        case '/health':
          result = { ok: true }
          break
        default:
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Not found' }))
          return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      appLog('error', `Agent API ${url.pathname}: ${message}`, 'agent-api')
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    }
  }

  private readBody(req: http.IncomingMessage): Promise<AgentApiBody> {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk: Buffer) => { data += chunk })
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {})
        } catch {
          reject(new Error('Invalid JSON body'))
        }
      })
      req.on('error', reject)
    })
  }

  // ─── Endpoint handlers ────────────────────────────────────────

  private async handleSpawn(body: AgentApiBody) {
    const { parentSessionId, name, prompt, providerId } = body
    if (!parentSessionId) throw new Error('parentSessionId required')
    if (!name) throw new Error('name required')
    if (!prompt) throw new Error('prompt required')

    // Resolve provider if specified by name/alias (e.g. "codex", "claude")
    let resolvedProviderId = providerId
    if (providerId && typeof providerId === 'string') {
      const providers = this.providerService.getRunnable()
      const match = providers.find((p: AIProvider) =>
        p.id === providerId ||
        p.name.toLowerCase().includes(providerId.toLowerCase()) ||
        (p.adapterType || '').toLowerCase().includes(providerId.toLowerCase()) ||
        (p.command || '').toLowerCase().includes(providerId.toLowerCase())
      )
      if (match) {
        resolvedProviderId = match.id
      } else {
        appLog('warn', `Requested child provider "${providerId}" is not runnable; falling back to parent session provider`, 'agent-api')
        resolvedProviderId = undefined
      }
    }

    const { childSessionId, result } = await this.processService.spawnChildSessionAndWait(
      parentSessionId,
      { name, prompt, providerId: resolvedProviderId },
    )
    return { success: true, childSessionId, result }
  }

  private async handleSend(body: AgentApiBody) {
    const { parentSessionId, childSessionId, message } = body
    if (!parentSessionId) throw new Error('parentSessionId required')
    if (!childSessionId) throw new Error('childSessionId required')
    if (!message) throw new Error('message required')

    const result = await this.processService.sendToChildAndWait(
      parentSessionId,
      childSessionId,
      message,
    )
    return { success: true, result }
  }

  private async handleList(body: AgentApiBody) {
    const parentSessionId = body.parentSessionId
    if (!parentSessionId) throw new Error('parentSessionId required')
    const agents = this.processService.getAgentsBySession(parentSessionId)
    return { agents }
  }

  private async handleClose(body: AgentApiBody) {
    const { parentSessionId, childSessionId } = body
    if (!parentSessionId) throw new Error('parentSessionId required')
    if (!childSessionId) throw new Error('childSessionId required')

    await this.processService.closeChildSession(parentSessionId, childSessionId)
    return { success: true }
  }

  private async handleWaitIdle(body: AgentApiBody) {
    const { parentSessionId, childSessionId, timeout } = body
    if (!parentSessionId) throw new Error('parentSessionId required')
    if (!childSessionId) throw new Error('childSessionId required')

    const result = await this.processService.waitAgentIdle(
      parentSessionId,
      childSessionId,
      timeout || 300_000,
    )
    return result
  }

  private async handleGetOutput(body: AgentApiBody) {
    const { childSessionId, lines } = body
    if (!childSessionId) throw new Error('childSessionId required')

    return this.processService.getAgentOutput(childSessionId, lines)
  }

  private async handleGetStatus(body: AgentApiBody) {
    const { parentSessionId, childSessionId } = body
    if (!parentSessionId) throw new Error('parentSessionId required')
    if (!childSessionId) throw new Error('childSessionId required')

    const status = this.processService.getAgentStatus(parentSessionId, childSessionId)
    return status || { error: 'Agent not found' }
  }

  // ─── Cross-Session Awareness endpoints ──────────────────────────

  private async handleListSessions(body: AgentApiBody) {
    const { status, limit } = body
    const sessions = this.processService.listSessionsForAwareness({ status, limit })
    return { sessions }
  }

  private async handleGetSessionSummary(body: AgentApiBody) {
    const { sessionId, maxMessages } = body
    if (!sessionId) throw new Error('sessionId required')

    const summary = this.processService.getSessionSummary(sessionId, maxMessages)
    if (!summary) {
      return { error: `Session not found: ${sessionId}` }
    }
    return summary
  }

  private async handleSearchSessions(body: AgentApiBody) {
    const { query, limit } = body
    if (!query) throw new Error('query required')

    const results = this.processService.searchSessions(query, limit)
    return { results }
  }
}

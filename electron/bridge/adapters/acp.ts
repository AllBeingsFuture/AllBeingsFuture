import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import {
  PROTOCOL_VERSION,
  client,
  methods,
  ndJsonStream,
  type AgentCapabilities,
  type ClientConnection,
  type ContentBlock,
  type InitializeResponse,
  type McpServer,
  type PermissionOption,
  type RequestPermissionOutcome,
  type RequestPermissionRequest,
  type SessionNotification,
  type SessionUpdate,
  type ToolCall,
  type ToolCallUpdate,
} from '@agentclientprotocol/sdk'
import { buildChildProcessEnv, parseCommand, resolveProcessCommand } from '../runtime.js'
import type { BridgeEvent, BridgeEventCallback, ProviderAdapter } from '../types.js'

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2_000
const MAX_STDERR_CHARS = 4_000

export type AcpPermissionHandler = (
  request: RequestPermissionRequest,
  signal: AbortSignal,
  requestId: string,
) => Promise<RequestPermissionOutcome> | RequestPermissionOutcome

export interface AcpAdapterConfig {
  command?: string
  executablePath?: string
  defaultArgs?: string
  workDir?: string
  envOverrides?: Record<string, string>
  mcpServers?: unknown
  resumeSessionId?: string
  autoAccept?: boolean
  customInstructions?: string
  appendSystemPrompt?: string
  startupTimeoutMs?: number
  shutdownTimeoutMs?: number
  permissionHandler?: AcpPermissionHandler
}

interface TrackedToolCall {
  name: string
  input: Record<string, unknown>
  status?: ToolCall['status']
}

function positiveTimeout(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs))
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return value === undefined ? {} : { value }
}

function parseAdditionalArgs(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  const parsed = parseCommand(raw, '')
  return [parsed.command, ...parsed.args].filter(Boolean)
}

function normalizeMcpServers(input: unknown): McpServer[] {
  if (Array.isArray(input)) {
    return input.filter((entry): entry is McpServer => Boolean(entry && typeof entry === 'object'))
  }
  if (!input || typeof input !== 'object') return []

  const servers: McpServer[] = []
  for (const [name, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const config = raw as Record<string, unknown>
    if (typeof config.command === 'string' && config.command.trim()) {
      servers.push({
        name,
        command: config.command.trim(),
        args: Array.isArray(config.args) ? config.args.map(String) : [],
        env: config.env && typeof config.env === 'object'
          ? Object.entries(config.env as Record<string, unknown>).map(([envName, value]) => ({
              name: envName,
              value: String(value),
            }))
          : [],
      })
      continue
    }

    if (typeof config.url === 'string' && config.url.trim()) {
      const headers = config.headers && typeof config.headers === 'object'
        ? Object.entries(config.headers as Record<string, unknown>).map(([headerName, value]) => ({
            name: headerName,
            value: String(value),
          }))
        : []
      servers.push({
        type: config.type === 'sse' ? 'sse' : 'http',
        name,
        url: config.url.trim(),
        headers,
      })
    }
  }
  return servers
}

function assertMcpCapabilities(servers: McpServer[], capabilities: AgentCapabilities | undefined): void {
  for (const server of servers) {
    // normalizeMcpServers only produces stdio / http / sse entries.
    const transport = 'type' in server ? server.type : 'stdio'
    if (transport === 'http' && !capabilities?.mcpCapabilities?.http) {
      throw new Error(`ACP agent did not negotiate HTTP MCP support required by '${server.name}'`)
    }
    if (transport === 'sse' && !capabilities?.mcpCapabilities?.sse) {
      throw new Error(`ACP agent did not negotiate SSE MCP support required by '${server.name}'`)
    }
  }
}

function textFromContent(content: ContentBlock): string | undefined {
  return content.type === 'text' ? content.text : undefined
}

function conciseError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class AcpAdapter implements ProviderAdapter {
  public currentRequestId: string | null = null

  private readonly config: AcpAdapterConfig
  private readonly emit: BridgeEventCallback
  private process: ChildProcess | null = null
  private connection: ClientConnection | null = null
  private remoteSessionId: string | null = null
  private initializeResponse: InitializeResponse | null = null
  private promptTask: Promise<void> | null = null
  private turnController: AbortController | null = null
  private stderr = ''
  private exitDescription = ''
  private initialized = false
  private destroying = false
  private fatalErrorEmitted = false
  private initialInstructionsSent = false
  private processExit: Promise<void> | null = null
  private resolveProcessExit: (() => void) | null = null
  private readonly toolCalls = new Map<string, TrackedToolCall>()

  constructor(config: AcpAdapterConfig, emit: BridgeEventCallback) {
    this.config = config
    this.emit = emit
  }

  async init(): Promise<void> {
    if (this.isAlive()) return

    const rawCommand = this.config.executablePath?.trim() || this.config.command?.trim()
    if (!rawCommand) {
      throw new Error('ACP adapter requires a configured command or executable path')
    }

    const resolved = resolveProcessCommand(rawCommand, '')
    const args = [...resolved.args, ...parseAdditionalArgs(this.config.defaultArgs)]
    const workDir = path.resolve(this.config.workDir || process.cwd())
    this.destroying = false
    this.fatalErrorEmitted = false
    this.stderr = ''
    this.exitDescription = ''
    this.initialInstructionsSent = false

    // buildChildProcessEnv clears ELECTRON_RUN_AS_NODE; re-apply runner env after.
    const env = buildChildProcessEnv(this.config.envOverrides)
    if (resolved.env) {
      for (const [key, value] of Object.entries(resolved.env)) {
        env[key] = value
      }
    }

    const child = spawn(resolved.command, args, {
      cwd: workDir,
      env,
      shell: resolved.shell,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.process = child
    this.processExit = new Promise((resolve) => {
      this.resolveProcessExit = resolve
    })

    child.stdin?.on('error', () => {})
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString()}`.slice(-MAX_STDERR_CHARS)
    })

    let rejectStartup: ((error: Error) => void) | null = null
    const startupFailure = new Promise<never>((_resolve, reject) => {
      rejectStartup = reject
    })

    child.once('error', (error) => {
      const detail = (error.message || String(error)).replace(/\.$/, '')
      const hint = /ENOENT/i.test(detail)
        ? ' CLI binary not found — install it, put it on PATH, or set Provider executable path / GROK_PATH.'
        : ''
      const wrapped = new Error(`Failed to start ACP agent '${resolved.command}': ${detail}.${hint}`)
      if (!this.initialized) rejectStartup?.(wrapped)
      else this.emitFatal(wrapped.message)
    })
    child.once('close', (code, signal) => {
      this.exitDescription = signal ? `exited with signal ${signal}` : `exited with code ${code ?? 'unknown'}`
      const wasInitialized = this.initialized
      this.initialized = false
      this.process = null
      this.resolveProcessExit?.()
      this.resolveProcessExit = null
      if (!this.destroying) {
        const suffix = this.stderr.trim() ? ` Stderr: ${this.stderr.trim()}` : ''
        const message = `ACP agent exited unexpectedly (${signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`}).${suffix}`
        if (!wasInitialized) rejectStartup?.(new Error(message))
        else this.emitFatal(message)
      }
    })

    try {
      if (!child.stdin || !child.stdout) {
        throw new Error('ACP agent did not expose piped stdin/stdout')
      }

      const app = client({ name: 'allbeingsfuture' })
        .onRequest(methods.client.session.requestPermission, ({ params, signal, requestId }) =>
          this.handlePermissionRequest(params, signal, requestId))
        .onNotification(methods.client.session.update, ({ params }) => {
          this.handleSessionUpdate(params)
        })

      const stream = ndJsonStream(
        Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
        Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      )
      this.connection = app.connect(stream)

      const startupTimeoutMs = positiveTimeout(this.config.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS)
      const initializeResponse = await withTimeout(
        Promise.race([
          this.connection.agent.request(methods.agent.initialize, {
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: { plan: {} },
            clientInfo: { name: 'AllBeingsFuture', version: '1.5.1' },
          }),
          startupFailure,
        ]),
        startupTimeoutMs,
        `ACP initialize timed out after ${startupTimeoutMs}ms for '${resolved.command}'`,
      )

      if (initializeResponse.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(
          `ACP protocol version mismatch: client supports v${PROTOCOL_VERSION}, agent selected v${initializeResponse.protocolVersion}`,
        )
      }
      this.initializeResponse = initializeResponse

      const mcpServers = normalizeMcpServers(this.config.mcpServers)
      assertMcpCapabilities(mcpServers, initializeResponse.agentCapabilities)
      if (this.config.resumeSessionId && !initializeResponse.agentCapabilities?.loadSession) {
        throw new Error('ACP agent does not support session/load; the configured conversation cannot be resumed')
      }
      if (this.config.resumeSessionId) {
        await withTimeout(
          this.connection.agent.request(methods.agent.session.load, {
            sessionId: this.config.resumeSessionId,
            cwd: workDir,
            mcpServers,
          }),
          startupTimeoutMs,
          `ACP session/load timed out after ${startupTimeoutMs}ms`,
        )
        this.remoteSessionId = this.config.resumeSessionId
      } else {
        const session = await withTimeout(
          this.connection.agent.request(methods.agent.session.new, { cwd: workDir, mcpServers }),
          startupTimeoutMs,
          `ACP session/new timed out after ${startupTimeoutMs}ms`,
        )
        this.remoteSessionId = session.sessionId
      }

      this.initialized = true
      this.emitEvent({
        event: 'status',
        type: 'status',
        phase: 'ready',
        detail: initializeResponse.agentInfo?.name || 'ACP agent ready',
        conversationId: this.remoteSessionId,
        initializeResponse,
      })
    } catch (error) {
      if (/connection closed/i.test(conciseError(error))) {
        await Promise.race([this.processExit || Promise.resolve(), sleep(100)])
      }
      await this.shutdownProcess()
      const stderr = this.stderr.trim()
      const processDetail = this.exitDescription ? ` Agent process ${this.exitDescription}.` : ''
      const detail = stderr ? ` Stderr: ${stderr}` : ''
      throw new Error(`ACP startup failed: ${conciseError(error)}.${processDetail}${detail}`)
    }
  }

  async send(message: string, images?: Array<{ data: string; mimeType: string }>): Promise<void> {
    if (!this.connection || !this.remoteSessionId || !this.isAlive()) {
      throw new Error('ACP session is not initialized or its agent process is no longer running')
    }
    if (this.promptTask) {
      throw new Error('ACP session already has an active prompt turn')
    }

    const prompt = this.buildPrompt(message, images)
    const controller = new AbortController()
    this.fatalErrorEmitted = false
    this.turnController = controller
    this.toolCalls.clear()
    this.emitEvent({ event: 'status', type: 'status', phase: 'running' })

    this.promptTask = this.runPrompt(prompt, controller)
    void this.promptTask.finally(() => {
      if (this.turnController === controller) this.turnController = null
      this.promptTask = null
    })
  }

  async stop(): Promise<void> {
    const controller = this.turnController
    const activePrompt = this.promptTask
    if (!controller || !activePrompt || !this.remoteSessionId || !this.connection) return

    controller.abort()
    await this.connection.agent
      .notify(methods.agent.session.cancel, { sessionId: this.remoteSessionId })
      .catch(() => {})
    const completed = await Promise.race([
      activePrompt.then(() => true),
      sleep(positiveTimeout(this.config.shutdownTimeoutMs, DEFAULT_SHUTDOWN_TIMEOUT_MS)).then(() => false),
    ])
    if (!completed) {
      await this.shutdownProcess()
    }
  }

  async destroy(): Promise<void> {
    if (this.destroying) return
    this.destroying = true

    await this.stop().catch(() => {})
    if (this.remoteSessionId && this.connection && this.initializeResponse?.agentCapabilities?.sessionCapabilities?.close) {
      await withTimeout(
        this.connection.agent.request(methods.agent.session.close, { sessionId: this.remoteSessionId }),
        1_000,
        'ACP session/close timed out',
      ).catch(() => {})
    }
    await this.shutdownProcess()
    this.remoteSessionId = null
    this.initializeResponse = null
    this.toolCalls.clear()
  }

  isAlive(): boolean {
    return Boolean(this.initialized && this.process && this.process.exitCode === null && !this.destroying)
  }

  private buildPrompt(
    message: string,
    images?: Array<{ data: string; mimeType: string }>,
  ): ContentBlock[] {
    // Many real agents accept multimodal prompts even when ACP handshake omits
    // promptCapabilities.image. Always forward image blocks; let the agent reject
    // unsupported content rather than blocking client-side.
    const instructions = this.initialInstructionsSent
      ? ''
      : [this.config.customInstructions, this.config.appendSystemPrompt]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .join('\n\n')
    const text = instructions ? `${instructions}\n\n${message}` : message
    const prompt: ContentBlock[] = [{ type: 'text', text }]
    for (const image of images || []) {
      prompt.push({ type: 'image', data: image.data, mimeType: image.mimeType || 'image/png' })
    }
    this.initialInstructionsSent = true
    return prompt
  }

  private async runPrompt(prompt: ContentBlock[], controller: AbortController): Promise<void> {
    if (!this.connection || !this.remoteSessionId) return
    try {
      const response = await this.connection.agent.request(
        methods.agent.session.prompt,
        { sessionId: this.remoteSessionId, prompt },
        { cancellationSignal: controller.signal },
      )
      this.emitEvent({
        event: 'done',
        type: 'status',
        phase: 'idle',
        stopReason: response.stopReason,
        turnActive: false,
        conversationId: this.remoteSessionId,
        usage: response.usage ? {
          input_tokens: response.usage.inputTokens,
          output_tokens: response.usage.outputTokens,
        } : undefined,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        if (this.destroying) return
        this.emitEvent({
          event: 'done',
          type: 'status',
          phase: 'cancelled',
          stopReason: 'cancelled',
          turnActive: false,
          conversationId: this.remoteSessionId,
        })
        return
      }
      if (!this.destroying && !this.fatalErrorEmitted) {
        this.emitFatal(`ACP prompt failed: ${conciseError(error)}`)
      }
    }
  }

  private handleSessionUpdate(notification: SessionNotification): void {
    if (this.remoteSessionId && notification.sessionId !== this.remoteSessionId) return
    const update = notification.update

    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const text = textFromContent(update.content)
        if (text !== undefined) {
          this.emitEvent({
            event: 'delta',
            type: 'text',
            text,
            itemId: update.messageId || undefined,
          })
        }
        break
      }
      case 'agent_thought_chunk': {
        const text = textFromContent(update.content)
        if (text !== undefined) {
          this.emitEvent({
            event: 'thinking',
            type: 'thinking',
            text,
            itemId: update.messageId || undefined,
          })
        }
        break
      }
      case 'tool_call':
        this.handleToolCall(update)
        break
      case 'tool_call_update':
        this.handleToolCallUpdate(update)
        break
      case 'plan':
        this.emitEvent({ event: 'plan', type: 'plan', entries: update.entries })
        break
      case 'plan_update': {
        const plan = update.plan
        this.emitEvent({
          event: 'plan',
          type: 'plan',
          planId: plan.planId,
          entries: plan.type === 'items' ? plan.entries : undefined,
          data: { format: plan.type, plan },
        })
        break
      }
      case 'plan_removed':
        this.emitEvent({
          event: 'plan',
          type: 'plan',
          planId: update.planId,
          data: { operation: 'removed' },
        })
        break
      // Mode / config / usage / commands / session_info updates are accepted from
      // agents but have no product consumer yet (stream normalizer drops them).
      case 'usage_update':
      case 'current_mode_update':
      case 'config_option_update':
      case 'session_info_update':
      case 'available_commands_update':
      case 'user_message_chunk':
        break
    }
  }

  private handleToolCall(update: ToolCall): void {
    const tracked = {
      name: update.title || update.name || update.kind || 'tool',
      input: toRecord(update.rawInput),
      status: update.status,
    }
    this.toolCalls.set(update.toolCallId, tracked)
    this.emitEvent({
      event: 'tool',
      type: 'tool',
      toolCallId: update.toolCallId,
      name: tracked.name,
      input: tracked.input,
      output: update.rawOutput,
      toolKind: update.kind,
      toolStatus: update.status,
      isUpdate: false,
    })
  }

  private handleToolCallUpdate(update: ToolCallUpdate): void {
    const previous = this.toolCalls.get(update.toolCallId)
    const tracked: TrackedToolCall = {
      name: update.title || update.name || previous?.name || update.kind || 'tool',
      input: update.rawInput === undefined ? (previous?.input || {}) : toRecord(update.rawInput),
      status: update.status || previous?.status,
    }
    this.toolCalls.set(update.toolCallId, tracked)
    this.emitEvent({
      event: 'tool',
      type: 'tool',
      toolCallId: update.toolCallId,
      name: tracked.name,
      input: tracked.input,
      output: update.rawOutput,
      toolKind: update.kind || undefined,
      toolStatus: tracked.status,
      isUpdate: true,
    })
  }

  private async handlePermissionRequest(
    request: RequestPermissionRequest,
    signal: AbortSignal,
    requestId: unknown,
  ): Promise<{ outcome: RequestPermissionOutcome }> {
    const permissionRequestId = requestId === undefined || requestId === null
      ? `perm-${Date.now()}`
      : String(requestId)

    this.emitEvent({
      event: 'permission',
      type: 'permission',
      requestId: permissionRequestId,
      toolCallId: request.toolCall.toolCallId,
      name: request.toolCall.title || request.toolCall.name || request.toolCall.kind || 'tool',
      input: toRecord(request.toolCall.rawInput),
      options: request.options,
    })

    let outcome: RequestPermissionOutcome
    if (signal.aborted || this.turnController?.signal.aborted) {
      outcome = { outcome: 'cancelled' }
    } else if (this.config.autoAccept) {
      // Prefer auto-accept over a UI handler so headless/tests stay deterministic.
      const option = this.preferredAllowOption(request.options)
      outcome = option
        ? { outcome: 'selected', optionId: option.optionId }
        : { outcome: 'cancelled' }
    } else if (this.config.permissionHandler) {
      outcome = await Promise.race([
        Promise.resolve(this.config.permissionHandler(request, signal, permissionRequestId)),
        this.permissionCancellation(signal),
      ])
    } else {
      outcome = { outcome: 'cancelled' }
    }

    if (
      outcome.outcome === 'selected'
      && !request.options.some((option) => option.optionId === outcome.optionId)
    ) {
      throw new Error(`Permission handler selected unknown option '${outcome.optionId}'`)
    }

    this.emitEvent({
      event: 'permission',
      type: 'permission',
      requestId: permissionRequestId,
      toolCallId: request.toolCall.toolCallId,
      options: request.options,
      outcome,
    })
    return { outcome }
  }

  private permissionCancellation(signal: AbortSignal): Promise<RequestPermissionOutcome> {
    return new Promise((resolve) => {
      const cancel = () => resolve({ outcome: 'cancelled' })
      if (signal.aborted || this.turnController?.signal.aborted) {
        cancel()
        return
      }
      signal.addEventListener('abort', cancel, { once: true })
      this.turnController?.signal.addEventListener('abort', cancel, { once: true })
    })
  }

  private preferredAllowOption(options: PermissionOption[]): PermissionOption | undefined {
    return options.find((option) => option.kind === 'allow_once')
      || options.find((option) => option.kind === 'allow_always')
  }

  private emitEvent(event: BridgeEvent): void {
    this.emit({ id: this.currentRequestId, ...event })
  }

  private emitFatal(message: string): void {
    if (this.fatalErrorEmitted || this.destroying) return
    this.fatalErrorEmitted = true
    this.emitEvent({ event: 'error', type: 'error', error: message })
  }

  private async shutdownProcess(): Promise<void> {
    const child = this.process
    this.initialized = false
    this.connection?.close()
    this.connection = null
    if (!child || child.exitCode !== null || child.signalCode !== null) return

    child.stdin?.end()
    const timeoutMs = positiveTimeout(this.config.shutdownTimeoutMs, DEFAULT_SHUTDOWN_TIMEOUT_MS)
    await Promise.race([this.processExit || Promise.resolve(), sleep(Math.min(250, timeoutMs))])
    if (child.exitCode !== null || child.signalCode !== null) return

    child.kill('SIGTERM')
    await Promise.race([this.processExit || Promise.resolve(), sleep(timeoutMs)])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await Promise.race([this.processExit || Promise.resolve(), sleep(500)])
    }
  }
}

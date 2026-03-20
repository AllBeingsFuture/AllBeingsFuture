/**
 * Codex CLI App Server Adapter (TypeScript port)
 *
 * Spawns `codex app-server` and communicates via JSON-RPC over NDJSON.
 * Each CodexAdapter owns a dedicated `codex app-server` process.
 */

import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { buildChildProcessEnv, resolveProcessCommand } from '../runtime.js'

type EmitFn = (event: any) => void

function log(...args: any[]) {
  process.stderr.write(`[codex] ${args.join(' ')}\n`)
}

const IMAGE_FILE_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
}

function mimeTypeToExtension(mimeType?: string): string {
  const normalized = String(mimeType || 'image/png').split(';', 1)[0].trim().toLowerCase()
  return IMAGE_FILE_EXTENSIONS[normalized] || '.png'
}

// ===== Dedicated Codex Process Manager (per adapter) =====

interface PendingRpc {
  resolve: (value: any) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class CodexProcessManager {
  private proc: ChildProcess | null = null
  private initialized = false
  private rpcId = 0
  private pendingRpc = new Map<number, PendingRpc>()
  private _initPromise: Promise<void> | null = null
  private destroying = false
  private adapter: CodexAdapter | null

  constructor(adapter: CodexAdapter) {
    this.adapter = adapter
  }

  async ensureProcess(config: Record<string, any>): Promise<void> {
    if (this.proc && this.initialized) return
    if (this._initPromise) return this._initPromise

    this._initPromise = this._start(config)
    try {
      await this._initPromise
    } finally {
      this._initPromise = null
    }
  }

  private async _start(config: Record<string, any>): Promise<void> {
    const resolvedCommand = resolveProcessCommand(config.executablePath || config.command, 'codex')
    const cmd = resolvedCommand.command
    const args = [...resolvedCommand.args, 'app-server']
    this.destroying = false

    return new Promise<void>((resolve, reject) => {
      this.proc = spawn(cmd, args, {
        cwd: config.workDir || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: resolvedCommand.shell,
        env: buildChildProcessEnv(config.envOverrides),
      })

      // Prevent unhandled 'error' events on stdin from crashing the process
      if (this.proc.stdin) {
        this.proc.stdin.on('error', (err) => {
          log('stdin error:', err.message)
        })
      }

      let initStderr = ''

      this.proc.on('error', (err) => {
        if (!this.initialized) {
          reject(new Error(`Failed to start '${cmd}': ${err.message}. Ensure '${cmd}' is installed and in PATH.`))
        } else if (!this.destroying && this.adapter?.currentRequestId) {
          this.adapter.emitEvent({ id: this.adapter.currentRequestId, event: 'error', error: `Codex process error: ${err.message}` })
        }
      })

      if (this.proc.stderr) {
        this.proc.stderr.on('data', (data: Buffer) => {
          const text = data.toString().trim()
          if (text) {
            if (!this.initialized) initStderr += text + '\n'
            log('stderr:', text)
          }
        })
      }

      this.proc.on('exit', (code) => {
        log(`Dedicated process exited (code ${code})`)
        let errMsg: string
        if (!this.initialized) {
          errMsg = `Codex failed to start (exit code ${code}).`
          const stderr = initStderr.trim()
          if (stderr) {
            errMsg += ` Output: ${stderr.slice(0, 500)}`
          } else {
            errMsg += ` Ensure '${cmd}' CLI is installed and supports 'app-server' mode.`
          }
        } else {
          errMsg = `Codex process exited unexpectedly (code ${code})`
        }
        this.rejectPending(new Error(errMsg))
        if (!this.destroying && this.adapter?.currentRequestId) {
          this.adapter.emitEvent({
            id: this.adapter.currentRequestId,
            event: 'error',
            error: errMsg,
          })
        }
        if (this.adapter) {
          this.adapter.onProcessExit()
        }
        this.proc = null
        this.initialized = false
      })

      const rl = createInterface({ input: this.proc.stdout! })
      rl.on('line', (line: string) => this.handleLine(line))

      this.rpcCall('initialize', { clientInfo: { name: 'allbeingsfuture', version: '2.0.0' } })
        .then(() => {
          this.initialized = true
          resolve()
        })
        .catch(reject)
    })
  }

  handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    let data: any
    try {
      data = JSON.parse(trimmed)
    } catch {
      return
    }

    // RPC response
    if (data.id !== undefined && (data.result !== undefined || data.error !== undefined)) {
      const pending = this.pendingRpc.get(data.id)
      if (pending) {
        this.pendingRpc.delete(data.id)
        clearTimeout(pending.timer)
        if (data.error) pending.reject(new Error(data.error.message || JSON.stringify(data.error)))
        else pending.resolve(data.result)
      }
      return
    }

    // JSON-RPC notification
    if (data.method) {
      const params = data.params || {}
      if (this.shouldRoute(params)) {
        this.adapter?.handleNotification(data.method, params)
      }
      return
    }

    // Bare event (legacy)
    if (data.type || data.event) {
      if (this.shouldRoute(data)) {
        this.adapter?.handleBareEvent(data)
      }
    }
  }

  private shouldRoute(params: any): boolean {
    if (!this.adapter || this.destroying) return false
    const threadId = params.threadId || params.item?.threadId
    if (threadId && this.adapter.threadId && threadId !== this.adapter.threadId) {
      return false
    }
    return true
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pendingRpc.entries()) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pendingRpc.delete(id)
    }
  }

  rpcCall(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin?.writable) {
        reject(new Error('Codex process not running'))
        return
      }

      const id = ++this.rpcId
      const timer = setTimeout(() => {
        const pending = this.pendingRpc.get(id)
        if (!pending) return
        this.pendingRpc.delete(id)
        reject(new Error(`RPC timeout: ${method}`))
      }, 30000)
      this.pendingRpc.set(id, { resolve, reject, timer })

      const request = { jsonrpc: '2.0', id, method, params }
      const payload = JSON.stringify(request) + '\n'
      try {
        this.proc!.stdin!.write(payload, (err) => {
          if (err) {
            log('stdin write error:', err.message)
            const pending = this.pendingRpc.get(id)
            if (pending) {
              this.pendingRpc.delete(id)
              clearTimeout(pending.timer)
              pending.reject(new Error(`Write failed: ${err.message}`))
            }
          }
        })
      } catch (writeErr: any) {
        log('stdin write threw:', writeErr.message)
        const pending = this.pendingRpc.get(id)
        if (pending) {
          this.pendingRpc.delete(id)
          clearTimeout(pending.timer)
          pending.reject(new Error(`Write failed: ${writeErr.message}`))
        }
      }
    })
  }

  isAlive(): boolean {
    return this.proc !== null && this.initialized
  }

  async shutdown(): Promise<void> {
    if (!this.proc) return

    this.destroying = true
    const proc = this.proc

    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(forceKillTimer)
        resolve()
      }

      proc.once('exit', finish)

      const forceKillTimer = setTimeout(() => {
        try { proc.kill() } catch {}
      }, 1000)

      try {
        if (proc.stdin?.writable) {
          proc.stdin.end()
        } else {
          proc.kill()
        }
      } catch {
        finish()
      }
    })
  }
}

// ===== CodexAdapter (per-session, uses dedicated process) =====

export class CodexAdapter {
  private config: Record<string, any>
  private emit: EmitFn
  private processManager: CodexProcessManager
  public currentRequestId: string | null = null
  public threadId: string | null = null
  private turnInFlight = false
  private turnCompletionWaiters: Array<() => void> = []
  private currentText = ''
  private itemTextLengths = new Map<string, number>()
  private reasoningBuffers = new Map<string, string>()
  private tempImageDir: string | null = null
  private tempImagePaths = new Set<string>()
  public envOverrides?: Record<string, string>
  public resumeFlag?: string

  constructor(config: Record<string, any>, emit: EmitFn) {
    this.config = config
    this.emit = emit
    this.processManager = new CodexProcessManager(this)
  }

  emitEvent(event: any): void {
    this.emit(event)
  }

  async init(): Promise<void> {
    // Lazy: process starts on first send()
  }

  private async ensureProcess(): Promise<void> {
    await this.processManager.ensureProcess(this.config)
  }

  onProcessExit(): void {
    this.finishTurn()
    this.threadId = null
    this.cleanupTempImages().catch(() => {})
  }

  private resetTurnState(): void {
    this.currentText = ''
    this.itemTextLengths.clear()
    this.reasoningBuffers.clear()
  }

  private beginTurn(): void {
    this.turnInFlight = true
  }

  private finishTurn(): void {
    this.turnInFlight = false
    if (this.turnCompletionWaiters.length > 0) {
      for (const resolve of this.turnCompletionWaiters.splice(0)) {
        resolve()
      }
    }
  }

  private waitForTurnToFinish(timeoutMs = 300): Promise<void> {
    if (!this.turnInFlight) return Promise.resolve()

    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        resolve()
      }

      const timer = setTimeout(() => {
        const index = this.turnCompletionWaiters.indexOf(done)
        if (index >= 0) this.turnCompletionWaiters.splice(index, 1)
        resolve()
      }, timeoutMs)

      this.turnCompletionWaiters.push(done)
    })
  }

  private emitTextChunk(text: string): void {
    if (!text) return
    this.currentText += text
    this.emit({ id: this.currentRequestId, event: 'delta', text })
  }

  private appendReasoningDelta(itemId: string | undefined, text: string): void {
    if (!itemId || !text) return
    const existing = this.reasoningBuffers.get(itemId) || ''
    this.reasoningBuffers.set(itemId, existing + text)
  }

  private emitThinkingFromItem(item: any): void {
    if (!item?.id) return
    const buffered = this.reasoningBuffers.get(item.id) || ''
    const summary = Array.isArray(item.summary) ? item.summary.join('\n') : ''
    const content = Array.isArray(item.content) ? item.content.join('\n') : ''
    const text = [buffered, summary, content].filter(Boolean).join('\n').trim()
    if (!text) return
    this.emit({ id: this.currentRequestId, event: 'thinking', text })
  }

  private buildToolEventFromItem(item: any): { name: string; input: any } | null {
    if (!item || typeof item !== 'object') return null

    switch (item.type) {
      case 'commandExecution':
        return { name: 'run_shell', input: { command: item.command, cwd: item.cwd, processId: item.processId } }
      case 'fileChange':
        return { name: 'apply_patch', input: { changes: item.changes } }
      case 'mcpToolCall':
        return { name: `mcp__${item.server || 'server'}__${item.tool || 'tool'}`, input: item.arguments || {} }
      case 'dynamicToolCall':
        return { name: item.tool || 'dynamic_tool_call', input: item.arguments || {} }
      case 'webSearch':
        return { name: 'web_search', input: { query: item.query, action: item.action } }
      case 'imageView':
        return { name: 'view_image', input: { path: item.path } }
      case 'collabAgentToolCall':
        return { name: item.tool || 'collab_agent', input: { prompt: item.prompt, receiverThreadIds: item.receiverThreadIds, senderThreadId: item.senderThreadId } }
      default:
        return null
    }
  }

  private handleItemStarted(item: any): void {
    const toolEvent = this.buildToolEventFromItem(item)
    if (!toolEvent) return
    this.emit({ id: this.currentRequestId, event: 'tool', name: toolEvent.name, input: toolEvent.input })
  }

  private handleItemCompleted(item: any): void {
    if (!item || typeof item !== 'object') return

    if (item.type === 'agentMessage' && typeof item.text === 'string') {
      const seen = this.itemTextLengths.get(item.id) || 0
      const remaining = item.text.slice(seen)
      if (remaining) this.emitTextChunk(remaining)
      this.itemTextLengths.set(item.id, item.text.length)
      return
    }

    if (item.type === 'reasoning') {
      this.emitThinkingFromItem(item)
    }
  }

  private extractTextFromMessage(message: any): string {
    if (!message) return ''
    if (typeof message === 'string') return message
    if (typeof message.text === 'string') return message.text
    if (typeof message.content === 'string') return message.content
    if (Array.isArray(message.content)) {
      return message.content.map((block: any) => {
        if (!block) return ''
        if (typeof block === 'string') return block
        if (typeof block.text === 'string') return block.text
        if (typeof block.content === 'string') return block.content
        return ''
      }).join('')
    }
    return ''
  }

  private extractTextFromParams(params: any): string {
    if (!params) return ''
    if (typeof params.delta === 'string') return params.delta
    if (typeof params.text === 'string') return params.text
    if (typeof params.content === 'string') return params.content
    if (params.message) return this.extractTextFromMessage(params.message)
    if (params.item) return this.extractTextFromMessage(params.item)
    return ''
  }

  handleNotification(method: string, params: any): void {
    const requestId = this.currentRequestId

    switch (method) {
      case 'item/agentMessage/delta':
      case 'item/assistantMessage/delta':
      case 'item/message/delta': {
        const text = typeof params.delta === 'string' ? params.delta : this.extractTextFromParams(params)
        if (text) {
          if (params.itemId) {
            const seen = this.itemTextLengths.get(params.itemId) || 0
            this.itemTextLengths.set(params.itemId, seen + text.length)
          }
          this.emitTextChunk(text)
        }
        break
      }

      case 'item/assistantMessage/added':
      case 'item/assistantMessage/created':
      case 'item/message/added':
      case 'item/message/created':
      case 'item/agentMessage/added':
      case 'item/agentMessage/created': {
        const text = this.extractTextFromParams(params)
        this.emitTextChunk(text)
        break
      }

      case 'item/reasoning/textDelta':
      case 'item/reasoning/summaryTextDelta':
      case 'item/reasoning/summaryPartAdded':
      case 'item/plan/delta':
        this.appendReasoningDelta(params.itemId, params.delta || params.text || '')
        break

      case 'item/started':
        this.handleItemStarted(params.item)
        break

      case 'item/completed':
      case 'item/finished':
        this.handleItemCompleted(params.item)
        break

      case 'item/commandExecution/outputDelta':
      case 'item/fileChange/outputDelta':
      case 'item/mcpToolCall/progress':
      case 'item/commandExecution/terminalInteraction':
      case 'turn/started':
      case 'thread/started':
      case 'thread/status/changed':
        break

      case 'item/toolCall/started':
      case 'item/tool_call/started':
        if (params.name) {
          this.emit({ id: requestId, event: 'tool', name: params.name })
        } else if (params.tool?.name) {
          this.emit({ id: requestId, event: 'tool', name: params.tool.name })
        }
        break

      case 'turn/completed':
      case 'turn/finished':
      case 'turn/done':
        this.emit({ id: requestId, event: 'done', text: this.currentText, conversationId: this.threadId || '' })
        this.finishTurn()
        this.resetTurnState()
        break

      case 'turn/failed':
      case 'turn/error':
      case 'turn/aborted': {
        const errMsg = params?.error?.message || params?.message || 'Codex turn failed'
        this.emit({ id: requestId, event: 'error', error: errMsg })
        this.finishTurn()
        this.resetTurnState()
        break
      }

      default:
        log(`Unhandled notification: ${method}`)
        break
    }
  }

  handleBareEvent(data: any): void {
    const eventType = data.type || data.event

    if (eventType === 'agent_message_delta' && data.delta) {
      this.emitTextChunk(data.delta)
      return
    }

    if ((eventType === 'reasoning_text_delta' || eventType === 'reasoning_summary_text_delta') && data.delta) {
      this.appendReasoningDelta(data.itemId, data.delta)
      return
    }

    if (eventType === 'message' && data.content) {
      this.emitTextChunk(data.content)
      return
    }

    if (eventType === 'delta' && data.text) {
      this.emitTextChunk(data.text)
      return
    }

    if (eventType === 'done') {
      this.emit({ id: this.currentRequestId, event: 'done', text: this.currentText, conversationId: this.threadId || '' })
      this.finishTurn()
      this.resetTurnState()
    }
  }

  private async ensureTempImageDir(): Promise<string> {
    if (this.tempImageDir) return this.tempImageDir
    this.tempImageDir = await mkdtemp(path.join(tmpdir(), 'allbeingsfuture-codex-'))
    return this.tempImageDir
  }

  private async persistImage(img: any, index: number): Promise<string> {
    if (img?.path && path.isAbsolute(img.path)) return img.path
    if (!img?.data) throw new Error('Codex image attachment missing data')

    const dir = await this.ensureTempImageDir()
    const filePath = path.join(dir, `image-${index + 1}-${randomUUID()}${mimeTypeToExtension(img.mimeType)}`)
    await writeFile(filePath, Buffer.from(img.data, 'base64'))
    this.tempImagePaths.add(filePath)
    return filePath
  }

  private async buildImageInputs(images?: any[]): Promise<any[]> {
    if (!Array.isArray(images) || images.length === 0) return []
    const filePaths = await Promise.all(images.map((img, index) => this.persistImage(img, index)))
    return filePaths.map(filePath => ({ type: 'localImage', path: filePath }))
  }

  private async cleanupTempImages(): Promise<void> {
    const dir = this.tempImageDir
    this.tempImageDir = null
    this.tempImagePaths.clear()
    if (dir) await rm(dir, { recursive: true, force: true })
  }

  private getApprovalPolicy(): 'never' | 'on-request' {
    return this.config.autoAccept ? 'never' : 'on-request'
  }

  private getDeveloperInstructions(): string | undefined {
    const instructions = [this.config.customInstructions, this.config.appendSystemPrompt]
      .filter((part: unknown) => typeof part === 'string' && part.trim().length > 0)
      .join('\n\n')
      .trim()

    return instructions || undefined
  }

  private buildThreadParams(): Record<string, any> {
    const params: Record<string, any> = {
      cwd: this.config.workDir || process.cwd(),
      approvalPolicy: this.getApprovalPolicy(),
      sandbox: 'danger-full-access',
    }

    if (this.config.model) {
      params.model = this.config.model
    }

    const developerInstructions = this.getDeveloperInstructions()
    if (developerInstructions) {
      params.developerInstructions = developerInstructions
    }

    return params
  }

  private async ensureThread(): Promise<void> {
    if (this.threadId) return

    const threadParams = this.buildThreadParams()
    const resumeThreadId = this.config.resumeSessionId
    let threadResult: any

    if (resumeThreadId) {
      try {
        threadResult = await this.processManager.rpcCall('thread/resume', {
          threadId: resumeThreadId,
          ...threadParams,
        })
        this.threadId = threadResult?.thread?.id || threadResult?.id || resumeThreadId
        this.config.resumeSessionId = this.threadId
        log(`Thread resumed: ${this.threadId}`)
        return
      } catch (err: any) {
        log(`Thread resume failed for ${resumeThreadId}: ${err.message}`)
      }
    }

    threadResult = await this.processManager.rpcCall('thread/start', threadParams)
    this.threadId = threadResult?.thread?.id || threadResult?.id
    if (!this.threadId) throw new Error('Codex thread/start did not return thread id')
    this.config.resumeSessionId = this.threadId
    log(`Thread started: ${this.threadId}`)
  }

  async send(message: string, images?: any[]): Promise<void> {
    await this.ensureProcess()
    if (this.turnInFlight) {
      throw new Error('Codex is still processing the previous turn')
    }

    this.resetTurnState()
    await this.ensureThread()

    const input = await this.buildImageInputs(images)
    input.push({ type: 'text', text: message })

    const turnParams: Record<string, any> = { threadId: this.threadId, input }
    if (this.config.model) {
      turnParams.model = this.config.model
    }
    if (this.config.reasoningEffort) {
      turnParams.effort = this.config.reasoningEffort
    }

    this.beginTurn()
    try {
      await this.processManager.rpcCall('turn/start', turnParams)
    } catch (err) {
      this.finishTurn()
      throw err
    }
  }

  async stop(): Promise<void> {
    if (this.threadId && this.turnInFlight) {
      try {
        await this.processManager.rpcCall('turn/interrupt', { threadId: this.threadId })
      } catch {}
    }
  }

  async destroy(): Promise<void> {
    const manager = this.processManager
    try {
      if (this.turnInFlight) {
        await this.stop()
        await this.waitForTurnToFinish()
      }
    } finally {
      this.finishTurn()
      this.threadId = null
      this.resetTurnState()
      await this.cleanupTempImages()
      await manager.shutdown()
    }
  }
}

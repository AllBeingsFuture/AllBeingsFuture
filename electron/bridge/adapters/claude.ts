/**
 * Claude Code Agent SDK Adapter (TypeScript port)
 *
 * Direct port from bridge/adapters/claude.js to TypeScript.
 * Runs in Electron main process instead of a subprocess.
 */

import path from 'node:path'
import {
  buildChildProcessEnv,
  detectGitBashPath,
  resolveProcessCommand,
} from '../runtime.js'
import { appLog } from '../../services/log.js'

type EmitFn = (event: any) => void

class AsyncIterableQueue<T> {
  private queue: T[] = []
  private resolve: ((result: IteratorResult<T>) => void) | null = null
  private done = false

  enqueue(item: T) {
    if (this.done) return
    if (this.resolve) {
      const r = this.resolve
      this.resolve = null
      r({ value: item, done: false })
    } else {
      this.queue.push(item)
    }
  }

  close() {
    this.done = true
    if (this.resolve) {
      const r = this.resolve
      this.resolve = null
      r({ value: undefined as any, done: true })
    }
  }

  [Symbol.asyncIterator]() {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false })
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as any, done: true })
        }
        return new Promise(resolve => { this.resolve = resolve })
      }
    }
  }
}

function wrapUserMessage(text: string, images?: Array<{data: string, mimeType: string}>) {
  const content: any[] = []

  if (images && images.length > 0) {
    for (const img of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType || 'image/png',
          data: img.data,
        },
      })
    }
  }

  content.push({ type: 'text', text })

  return {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
  }
}

export class ClaudeAdapter {
  private config: Record<string, any>
  private emit: EmitFn
  private sdk: any = null
  private sdkQuery: any = null
  private inputStream: AsyncIterableQueue<any> | null = null
  private abortController: AbortController | null = null
  private conversationId: string | null = null
  public currentRequestId: string | null = null
  private consuming = false
  private _resultEmitted = false
  /** Number of sub-agents currently running (tracked to extend watchdog) */
  private activeSubAgents = 0
  public envOverrides?: Record<string, string>
  public resumeFlag?: string

  constructor(config: Record<string, any>, emit: EmitFn) {
    this.config = config
    this.emit = emit
  }

  async init() {
    appLog('info', 'Claude adapter initializing', 'claude')
    try {
      this.sdk = await import('@anthropic-ai/claude-agent-sdk')
      appLog('info', 'Claude SDK loaded', 'claude')
    } catch (err: any) {
      appLog('error', `SDK load failed: ${err.message}`, 'claude')
      throw new Error(
        `Failed to load @anthropic-ai/claude-agent-sdk: ${err.message}\n` +
        `Please run: npm install @anthropic-ai/claude-agent-sdk`
      )
    }
  }

  teardownQuery({ clearConversationId = false } = {}) {
    if (this.inputStream) {
      try { this.inputStream.close() } catch {}
    }
    this.sdkQuery = null
    this.inputStream = null
    this.abortController = null
    this.activeSubAgents = 0
    if (clearConversationId) {
      this.conversationId = null
    }
  }

  async send(message: string, images?: Array<{data: string, mimeType: string}>) {
    if (!this.sdkQuery) {
      this.startQuery(message, images)
      return
    }

    if (this.inputStream) {
      this.inputStream.enqueue(wrapUserMessage(message, images))
      return
    }

    const oneShot = new AsyncIterableQueue<any>()
    oneShot.enqueue(wrapUserMessage(message, images))
    oneShot.close()
    try {
      await this.sdkQuery.streamInput(oneShot)
    } catch (err: any) {
      this.emit({ id: this.currentRequestId, event: 'error', error: err.message })
    }
  }

  private startQuery(message: string, images?: Array<{data: string, mimeType: string}>) {
    appLog('info', 'Starting Claude query', 'claude')
    this.abortController = new AbortController()
    this.inputStream = new AsyncIterableQueue()

    const cleanEnv = buildChildProcessEnv(this.config.envOverrides)
    delete cleanEnv.CLAUDECODE
    delete cleanEnv.CLAUDE_CODE_ENTRYPOINT

    const gitBashPath = detectGitBashPath(this.config.gitBashPath || cleanEnv.CLAUDE_CODE_GIT_BASH_PATH)
    if (gitBashPath) {
      process.env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath
      cleanEnv.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath
    }

    const appendPrompt = [this.config.customInstructions, this.config.appendSystemPrompt]
      .filter((part: unknown) => typeof part === 'string' && part.trim().length > 0)
      .join('\n\n')

    const options: Record<string, any> = {
      cwd: this.config.workDir || process.cwd(),
      env: cleanEnv,
      abortController: this.abortController,
      allowedTools: [
        'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
        'WebSearch', 'WebFetch', 'Task', 'NotebookEdit',
      ],
      includePartialMessages: true,
      stderr: (data: string) => {
        const trimmed = (data || '').trim()
        if (trimmed) appLog('warn', trimmed, 'claude-stderr')
      },
    }

    if (this.config.mcpServers && typeof this.config.mcpServers === 'object') {
      options.mcpServers = this.config.mcpServers
    }

    if (appendPrompt) {
      options.systemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: appendPrompt,
      }
    }

    if (this.config.model) {
      options.model = this.config.model
    }

    if (this.config.reasoningEffort) {
      options.effort = this.config.reasoningEffort
    }

    const resumeSessionId = this.conversationId || this.config.resumeSessionId
    if (resumeSessionId) {
      options.resume = resumeSessionId
    }

    const executablePath = this.resolveExecutablePath()
    if (executablePath) {
      options.pathToClaudeCodeExecutable = executablePath
      if (/\.js$/i.test(executablePath)) {
        options.executable = 'node'
      }
    }

    const autoAccept = this.config.autoAccept || this.config.autoAcceptFlag || this.config.permissionMode === 'bypassPermissions'
    if (autoAccept) {
      options.permissionMode = 'bypassPermissions'
      options.allowDangerouslySkipPermissions = true
    } else if (this.config.permissionMode) {
      options.permissionMode = this.config.permissionMode
    } else {
      // Default to bypass to avoid hanging on permission prompts
      options.permissionMode = 'bypassPermissions'
      options.allowDangerouslySkipPermissions = true
    }

    try {
      this.sdkQuery = this.sdk.query({
        prompt: this.inputStream,
        options,
      })
    } catch (err: any) {
      this.emit({ id: this.currentRequestId, event: 'error', error: `Failed to start Claude query: ${err.message}` })
      this.teardownQuery()
      return
    }

    this.inputStream.enqueue(wrapUserMessage(message, images))
    this.consumeStream()
  }

  private resolveExecutablePath(): string | undefined {
    const input = this.config.executablePath || this.config.command
    const resolved = resolveProcessCommand(input, 'claude')

    if (resolved.shimEntrypoint) {
      return resolved.shimEntrypoint
    }

    if (!resolved.command) return undefined
    if (!/[\\/]/.test(resolved.command) && !path.extname(resolved.command)) {
      return undefined
    }

    return resolved.command
  }

  private async consumeStream() {
    if (this.consuming) return
    this.consuming = true
    let currentText = ''
    this._resultEmitted = false
    let receivedAny = false

    // Rolling watchdog: resets on each SDK event.
    // Uses 30s when idle, 5min when sub-agents are running (they can take a long time).
    let watchdog: ReturnType<typeof setTimeout> | null = null
    const clearWatchdog = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null } }
    const getWatchdogTimeout = () => this.activeSubAgents > 0 ? 300000 : 30000
    const resetWatchdog = () => {
      clearWatchdog()
      watchdog = setTimeout(() => {
        if (!this.consuming) return
        if (!receivedAny) {
          this.emit({ id: this.currentRequestId, event: 'error', error: 'Claude SDK timeout: no response received within 30 seconds. Check that "claude" CLI is installed and authenticated.' })
          this.stop().catch(() => {})
        } else if (!this._resultEmitted && this.activeSubAgents === 0) {
          // Stream stalled mid-turn with no active sub-agents — emit done with accumulated text
          this.emit({ id: this.currentRequestId, event: 'done', text: currentText, conversationId: this.conversationId || '' })
          this._resultEmitted = true
          currentText = ''
        } else {
          // Sub-agents still running, keep waiting
          resetWatchdog()
        }
      }, getWatchdogTimeout())
    }
    resetWatchdog()

    try {
      for await (const msg of this.sdkQuery) {
        receivedAny = true
        resetWatchdog()
        if (msg.type !== 'result' && this._resultEmitted) {
          this._resultEmitted = false
        }
        const requestId = this.currentRequestId

        if (msg.session_id && !this.conversationId) {
          this.conversationId = msg.session_id
        }

        switch (msg.type) {
          case 'assistant': {
            if (msg.message?.content) {
              for (const block of msg.message.content) {
                if (block.type === 'text' && block.text) {
                  if (currentText === '') {
                    this.emit({ id: requestId, event: 'delta', text: block.text })
                    currentText += block.text
                  }
                } else if (block.type === 'tool_use') {
                  this.emit({
                    id: requestId,
                    event: 'tool',
                    name: block.name || 'unknown',
                    input: block.input || {},
                  })
                } else if (block.type === 'thinking' && block.thinking) {
                  this.emit({
                    id: requestId,
                    event: 'thinking',
                    text: block.thinking,
                  })
                }
              }
            }
            break
          }

          case 'stream_event': {
            const event = msg.event
            if (event?.delta?.type === 'text_delta' && event.delta.text) {
              this.emit({ id: requestId, event: 'delta', text: event.delta.text })
              currentText += event.delta.text
            }
            break
          }

          case 'result': {
            const finalText = msg.result || currentText
            appLog('info', `Query complete (${finalText.length} chars)`, 'claude')
            this.emit({
              id: requestId,
              event: 'done',
              text: finalText,
              conversationId: this.conversationId || msg.session_id || '',
            })
            currentText = ''
            this._resultEmitted = true
            break
          }

          case 'system': {
            // Sub-agent task lifecycle events from SDK
            const subType = msg.subtype || msg.event_type || ''
            if (subType === 'task_started' || subType === 'task_progress' || subType === 'task_notification') {
              // Track active sub-agents for watchdog timeout adjustment
              if (subType === 'task_started') {
                this.activeSubAgents++
                appLog('info', `Sub-agent started (active: ${this.activeSubAgents})`, 'claude')
              } else if (subType === 'task_notification') {
                this.activeSubAgents = Math.max(0, this.activeSubAgents - 1)
                appLog('info', `Sub-agent finished (active: ${this.activeSubAgents})`, 'claude')
              }

              // Extract content blocks from the message if it's a structured object
              const msgContent = msg.message || msg.data?.message
              let contentBlocks: any[] | undefined
              let thinkingText: string | undefined

              if (msgContent && typeof msgContent === 'object') {
                // SDK may send { role: 'assistant', content: [...blocks] }
                if (Array.isArray(msgContent.content)) {
                  contentBlocks = msgContent.content
                } else if (Array.isArray(msgContent)) {
                  contentBlocks = msgContent
                }
              }

              // Also check for content/content_blocks directly on msg or data
              if (!contentBlocks) {
                contentBlocks = msg.content || msg.data?.content || msg.content_blocks || msg.data?.content_blocks
                if (contentBlocks && !Array.isArray(contentBlocks)) contentBlocks = undefined
              }

              // Extract thinking from various places
              if (msg.thinking) thinkingText = msg.thinking
              else if (msg.data?.thinking) thinkingText = msg.data.thinking

              this.emit({
                id: requestId,
                event: 'agent_task',
                subtype: subType,
                task_id: msg.task_id || msg.data?.task_id,
                session_id: msg.session_id || msg.data?.session_id,
                description: msg.description || msg.data?.description || msg.data?.prompt,
                prompt: msg.prompt || msg.data?.prompt,
                summary: msg.summary || msg.data?.summary || (typeof msgContent === 'string' ? msgContent : undefined),
                message: msgContent,
                status: msg.status || msg.data?.status,
                result: msg.result || msg.data?.result,
                usage: msg.usage || msg.data?.usage,
                data: msg.data,
                // Pass through structured content for AgentTracker to process
                content: contentBlocks,
                thinking: thinkingText,
              })
            }
            break
          }
        }
      }

      if (!this._resultEmitted) {
        this.emit({
          id: this.currentRequestId,
          event: 'done',
          text: currentText,
          conversationId: this.conversationId || '',
        })
      }
      this._resultEmitted = false
    } catch (err: any) {
      const isAbort =
        /abort/i.test(err.message || '') ||
        /abort/i.test(err.name || '') ||
        err.constructor?.name?.includes?.('Abort')

      if (!isAbort) {
        appLog('error', `Query error: ${err.message}`, 'claude')
        this.emit({ id: this.currentRequestId, event: 'error', error: err.message })
      }
    } finally {
      clearWatchdog()
      this.consuming = false
      this.teardownQuery()
    }
  }

  async stop() {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  async destroy() {
    await this.stop()
    this.teardownQuery({ clearConversationId: true })
  }
}

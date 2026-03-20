/**
 * ProcessService - manages AI chat processes and message streaming
 * Replaces Go internal/services/process.go
 *
 * Instead of communicating with bridge via subprocess NDJSON,
 * directly uses the BridgeManager which integrates adapters in-process.
 */

import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import type { Database } from './database.js'
import type { SessionService } from './session.js'
import type { ProviderService } from './provider.js'
import type { SettingsService } from './settings.js'
import type { BridgeManager } from '../bridge/bridge.js'
import { AgentTracker, type TrackedAgent } from './agent-tracker.js'
import { AgentApi } from './agent-api.js'
import { ConcurrencyGuard } from './concurrency-guard.js'
import { MessageScheduler } from './message-scheduler.js'
import { appLog } from './log.js'
import { injectSupervisorPrompt, cleanupSupervisorPrompt, buildAllRulesContent } from './supervisor-prompt.js'
import { OutputParser } from '../parser/OutputParser.js'
import { StateInference } from '../parser/StateInference.js'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool_use' | 'thinking'
  content: string
  timestamp: string
  toolUse?: any[]
  thinking?: string
  images?: string[]
  /** For role: 'tool_use' — the tool name */
  toolName?: string
  /** For role: 'tool_use' — the tool input parameters */
  toolInput?: Record<string, any>
  /** True when this is a thinking message */
  isThinking?: boolean
  /** Token usage for the completed turn */
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
  }
  /** True when assistant is still streaming (partial) */
  partial?: boolean
}

export interface ChatState {
  messages: ChatMessage[]
  streaming: boolean
  error: string
}

interface SessionState {
  messages: ChatMessage[]
  streaming: boolean
  error: string
  conversationId: string
}

export class ProcessService {
  private sessionStates = new Map<string, SessionState>()
  /** One AgentTracker per parent session that has spawned sub-agents */
  private agentTrackers = new Map<string, AgentTracker>()
  /** Sessions that had supervisor prompt injected — tracks workDir for cleanup */
  private supervisorPromptSessions = new Map<string, string>()
  /** Internal HTTP API for the agent-control MCP server */
  private agentApi: AgentApi | null = null
  private agentApiPort = 0
  /** Waiters for persistent child turns: childSessionId → resolve(result) */
  private childTurnWaiters = new Map<string, (result: string) => void>()
  /**
   * Idle flags for persistent agents: childSessionId → true when turn completed but agent still alive.
   * Solves race condition: if turn_complete fires before waitAgentIdle is called,
   * the flag preserves the idle state so the next call returns immediately.
   * Idle flag pattern for persistent agent turn tracking.
   */
  private agentIdleFlags = new Map<string, boolean>()
  /** Waiters for idle detection: childSessionId → resolve callbacks */
  private agentIdleWaiters = new Map<string, Array<{ resolve: (info: { idle: boolean; output: string }) => void; timer?: ReturnType<typeof setTimeout> }>>()
  /** Concurrency guard — limits max concurrent sessions and monitors resources */
  private concurrencyGuard = new ConcurrencyGuard()
  /** Per-session message schedulers — queues messages when session is busy */
  private schedulers = new Map<string, MessageScheduler>()
  /** Output parser — parses CLI output into structured activity events */
  private outputParser = new OutputParser()
  /** State inference — detects session status from output patterns */
  private stateInference = new StateInference()
  /**
   * Stack of active sub-agent child session IDs per parent session.
   * When Claude SDK spawns a sub-agent, the sub-agent's output (delta/tool/thinking)
   * flows through the parent stream. We use this stack to mirror those events
   * to the child session so it has full conversation records.
   */
  private activeChildStack = new Map<string, string[]>()

  constructor(
    private db: Database,
    private sessionService: SessionService,
    private providerService: ProviderService,
    private settingsService: SettingsService,
    private bridgeManager: BridgeManager,
    private getWindow: () => BrowserWindow | null,
  ) {
    // Start the state inference polling timer
    this.stateInference.start()

    // Forward parser activity events to the renderer
    this.outputParser.on('activity', (sessionId: string, event: any) => {
      const win = this.getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('parser:activity', { sessionId, event })
      }
    })

    this.outputParser.on('intervention-needed', (sessionId: string, kind: string) => {
      const win = this.getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('parser:intervention', { sessionId, kind })
      }
    })

    // Forward state inference status changes to the renderer
    this.stateInference.on('status-change', (sessionId: string, status: string) => {
      const win = this.getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('parser:status-change', { sessionId, status })
      }
    })

    this.stateInference.on('intervention-needed', (sessionId: string, kind: string) => {
      const win = this.getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('parser:intervention', { sessionId, kind })
      }
    })
  }

  private getOrCreateScheduler(sessionId: string): MessageScheduler {
    let scheduler = this.schedulers.get(sessionId)
    if (!scheduler) {
      scheduler = new MessageScheduler()
      this.schedulers.set(sessionId, scheduler)
    }
    return scheduler
  }

  // ─── Agent API & MCP helpers ─────────────────────────────────

  private async ensureAgentApi(): Promise<number> {
    if (this.agentApi && this.agentApiPort > 0) return this.agentApiPort
    this.agentApi = new AgentApi(this, this.providerService)
    this.agentApiPort = await this.agentApi.start()
    return this.agentApiPort
  }

  private getAgentControlMcpPath(): string {
    try {
      if (app.isPackaged) {
        return path.join(process.resourcesPath, 'mcps', 'agent-control', 'server.mjs')
      }
    } catch {}
    return path.join(process.cwd(), 'mcps', 'agent-control', 'server.mjs')
  }

  private getOrCreateState(sessionId: string): SessionState {
    let state = this.sessionStates.get(sessionId)
    if (!state) {
      // Try to load messages from DB
      const session = this.sessionService.getById(sessionId)
      let messages: ChatMessage[] = []
      if (session?.messagesJson) {
        try {
          messages = JSON.parse(session.messagesJson)
        } catch {}
      }

      state = {
        messages,
        streaming: false,
        error: '',
        conversationId: session?.conversationId || '',
      }
      this.sessionStates.set(sessionId, state)
    }
    return state
  }

  private emitChatUpdate(sessionId: string) {
    const state = this.getOrCreateState(sessionId)
    const window = this.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('chat:update', {
        sessionId,
        messages: state.messages,
        streaming: state.streaming,
        error: state.error,
      })
    }
  }

  private persistMessages(sessionId: string) {
    const state = this.sessionStates.get(sessionId)
    if (state) {
      this.sessionService.updateMessages(sessionId, JSON.stringify(state.messages))
    }
  }

  async initSession(sessionId: string): Promise<void> {
    // Skip if session is already active — prevents destroying a running query
    if (this.bridgeManager.isSessionActive(sessionId)) {
      appLog('debug', `initSession skipped (already active): ${sessionId}`, 'process')
      return
    }

    // Check concurrency guard before creating session.
    // Skip the check if this session is already registered (re-initialization after stream ended).
    if (!this.concurrencyGuard.isSessionRegistered(sessionId)) {
      const canCreate = this.concurrencyGuard.checkCanCreateSession()
      if (!canCreate.allowed) {
        throw new Error(canCreate.reason || 'Cannot create session: resource limit reached')
      }
    }

    const session = this.sessionService.getById(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    // Child agent sessions: use parent's provider for initialization
    // (they can be interacted with independently when the user clicks into them)

    const provider = this.providerService.getById(session.providerId)
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`)

    // Initialize bridge adapter for this session
    const config: Record<string, any> = {
      workDir: session.workingDirectory || process.cwd(),
      command: provider.command || undefined,
      autoAccept: session.autoAccept,
      autoAcceptFlag: provider.autoAcceptFlag || undefined,
      permissionMode: session.permissionMode,
      customInstructions: session.customInstructions,
      appendSystemPrompt: session.appendSystemPrompt,
      executablePath: provider.executablePath,
      gitBashPath: provider.gitBashPath || undefined,
      model: session.model || provider.defaultModel || undefined,
      reasoningEffort: provider.reasoningEffort || undefined,
      envOverrides: provider.envOverrides ? this.parseEnvOverrides(provider.envOverrides) : undefined,
    }

    if (session.conversationId) {
      config.resumeSessionId = session.conversationId
    }
    if (provider.resumeFlag) {
      config.resumeFlag = provider.resumeFlag
    }

    // Inject ABF rules content into system prompt for ALL non-child sessions
    // This ensures every AI provider (Claude, Codex, Gemini, etc.) receives project context
    if (!session.parentSessionId) {
      try {
        const isClaudeBased = this.isClaudeAdapter(provider.adapterType)
        const providerNames = this.providerService.getAll().map((p: any) => p.name)

        // Build rules content and append to system prompt
        // Include supervisor instructions only for Claude (which supports MCP-based agent control)
        const rulesContent = buildAllRulesContent(providerNames, isClaudeBased)
        const existingPrompt = (config.appendSystemPrompt || '').trim()
        config.appendSystemPrompt = existingPrompt
          ? `${existingPrompt}\n\n${rulesContent}`
          : rulesContent

        // Inject agent-control MCP server for Claude sessions
        if (isClaudeBased) {
          try {
            const apiPort = await this.ensureAgentApi()
            config.mcpServers = {
              'agent-control': {
                command: 'node',
                args: [this.getAgentControlMcpPath()],
                env: {
                  ABF_AGENT_API_PORT: String(apiPort),
                  ABF_PARENT_SESSION_ID: sessionId,
                },
              },
            }
          } catch (err: any) {
            appLog('warn', `Failed to set up agent-control MCP: ${err.message}`, 'process')
          }

          // Also write rules files to .claude/rules/ as backup (Claude Code CLI auto-discovery)
          try {
            const workDir = config.workDir as string
            injectSupervisorPrompt(workDir, providerNames)
            this.supervisorPromptSessions.set(sessionId, workDir)
          } catch (err: any) {
            appLog('warn', `Failed to inject supervisor prompt files: ${err.message}`, 'process')
          }
        }
      } catch (err: any) {
        appLog('warn', `Failed to inject ABF rules: ${err.message}`, 'process')
      }
    }

    // Register session with parser and state inference engines
    this.outputParser.registerSessionProvider(sessionId, { id: provider.id, name: provider.name })
    this.stateInference.registerSessionConfig(sessionId)

    try {
      await this.bridgeManager.initSession(
        sessionId,
        provider.adapterType,
        config,
        (event) => this.handleBridgeEvent(sessionId, event)
      )
      this.concurrencyGuard.registerSession(sessionId)
      this.sessionService.updateStatus(sessionId, 'idle')
    } catch (err: any) {
      this.sessionService.updateStatus(sessionId, 'error')
      throw err
    }
  }

  private parseEnvOverrides(envStr: string): Record<string, string> {
    const result: Record<string, string> = {}
    try {
      const parsed = JSON.parse(envStr)
      if (typeof parsed === 'object') return parsed
    } catch {}
    // Try key=value format
    for (const line of envStr.split('\n')) {
      const idx = line.indexOf('=')
      if (idx > 0) {
        result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
    }
    return result
  }

  /**
   * Get the active child session ID for a parent session (top of stack).
   * Returns undefined if no sub-agent is currently active.
   */
  private getActiveChild(parentSessionId: string): string | undefined {
    const stack = this.activeChildStack.get(parentSessionId)
    return stack && stack.length > 0 ? stack[stack.length - 1] : undefined
  }

  /**
   * Mirror a message to the active child session's in-memory state and persist to DB.
   * This ensures child agent sessions have the same detailed conversation records
   * as the parent session while the sub-agent is running.
   */
  private mirrorToChildSession(childSessionId: string, msg: ChatMessage) {
    const childState = this.getOrCreateState(childSessionId)
    // For delta events, merge into the last assistant message or create new one
    if (msg.role === 'assistant' && !msg.toolUse && !msg.thinking) {
      const lastMsg = childState.messages[childState.messages.length - 1]
      if (lastMsg?.role === 'assistant' && !lastMsg.toolName && !lastMsg.toolUse) {
        lastMsg.content += msg.content
        // Don't persist every delta — will be persisted on done/notification
        this.emitChatUpdate(childSessionId)
        return
      }
    }
    childState.messages.push(msg)
    childState.streaming = true
    this.emitChatUpdate(childSessionId)
    // Persist tool/thinking events immediately so they survive if child doesn't end cleanly
    if (msg.toolUse || msg.thinking || msg.role === 'thinking') {
      this.persistMessages(childSessionId)
    }
  }

  private handleBridgeEvent(sessionId: string, event: any) {
    const state = this.getOrCreateState(sessionId)

    switch (event.event) {
      case 'delta': {
        state.streaming = true
        // Append to last assistant message or create new one
        const lastMsg = state.messages[state.messages.length - 1]
        if (lastMsg?.role === 'assistant') {
          lastMsg.content += event.text || ''
        } else {
          state.messages.push({
            role: 'assistant',
            content: event.text || '',
            timestamp: new Date().toISOString(),
          })
        }
        // Feed text to output parser for activity detection
        if (event.text) {
          this.outputParser.feed(sessionId, event.text)
          this.stateInference.onOutput(sessionId, event.text)
          this.stateInference.onOutputData(sessionId, event.text)
        }
        this.emitChatUpdate(sessionId)

        // Mirror delta to active child session
        const activeChild = this.getActiveChild(sessionId)
        if (activeChild && event.text) {
          this.mirrorToChildSession(activeChild, {
            role: 'assistant',
            content: event.text,
            timestamp: new Date().toISOString(),
          })
        }
        break
      }

      case 'done': {
        state.streaming = false
        // Finalize the last assistant message
        const lastMsg = state.messages[state.messages.length - 1]
        if (lastMsg?.role === 'assistant' && event.text) {
          lastMsg.content = event.text
          lastMsg.partial = false
        }
        // Store usage/cache data on the last assistant message
        if (event.usage && lastMsg?.role === 'assistant') {
          lastMsg.usage = {
            inputTokens: event.usage.input_tokens || 0,
            outputTokens: event.usage.output_tokens || 0,
            cacheReadTokens: event.usage.cache_read_input_tokens || event.usage.cache_read_tokens || 0,
            cacheCreationTokens: event.usage.cache_creation_input_tokens || event.usage.cache_creation_tokens || 0,
          }
        }
        if (event.conversationId) {
          state.conversationId = event.conversationId
          this.sessionService.updateConversationId(sessionId, event.conversationId)
        }
        this.sessionService.updateStatus(sessionId, 'idle')
        this.persistMessages(sessionId)
        this.emitChatUpdate(sessionId)
        // Notify parser that session turn is done
        this.outputParser.markSessionEnded(sessionId)
        this.stateInference.markAwaitingUserInput(sessionId)

        // Persist mirrored messages for any remaining active children
        const remainingStack = this.activeChildStack.get(sessionId)
        if (remainingStack) {
          for (const childId of remainingStack) {
            const cs = this.sessionStates.get(childId)
            if (cs) {
              cs.streaming = false
              this.persistMessages(childId)
              this.emitChatUpdate(childId)
            }
          }
          this.activeChildStack.delete(sessionId)
        }

        // If this is a child session, inject result back to parent
        const doneSession = this.sessionService.getById(sessionId)
        if (doneSession?.parentSessionId) {
          if (this.isPersistentChild(doneSession.parentSessionId, sessionId)) {
            // Persistent child: resolve waiter, set status to 'idle', keep alive
            const lastAssistant = [...state.messages].reverse().find(m => m.role === 'assistant')
            const resultText = lastAssistant?.content || '(no output)'
            this.resolveChildTurnWaiter(sessionId, resultText)
            this.updatePersistentAgentStatus(doneSession.parentSessionId, sessionId, 'idle')
            // Set idle flag (for waitAgentIdle race condition handling)
            this.agentIdleFlags.set(sessionId, true)
            this.resolveAgentIdleWaiters(sessionId)
          } else {
            this.injectChildResult(doneSession.parentSessionId, sessionId)
          }
        }

        // Finalize any sub-agents that are still running
        // Skip persistent children on normal turn completion
        this.finalizeChildAgents(sessionId, 'completed', true)

        // Flush pending messages from the scheduler
        this.flushSchedulerPending(sessionId)
        break
      }

      case 'error': {
        state.streaming = false
        state.error = event.error || 'Unknown error'
        this.sessionService.updateStatus(sessionId, 'error')
        this.emitChatUpdate(sessionId)
        // Free concurrency slot so the session can be re-initialized later
        this.concurrencyGuard.unregisterSession(sessionId)
        // Persist mirrored messages for active children before cleanup
        const errorStack = this.activeChildStack.get(sessionId)
        if (errorStack) {
          for (const childId of errorStack) {
            const cs = this.sessionStates.get(childId)
            if (cs) {
              cs.streaming = false
              this.persistMessages(childId)
              this.emitChatUpdate(childId)
            }
          }
          this.activeChildStack.delete(sessionId)
        }
        // Mark sub-agents as failed when parent errors (including persistent)
        this.finalizeChildAgents(sessionId, 'failed', false)
        // Clean up supervisor prompt on terminal error
        this.cleanupSupervisorPromptForSession(sessionId)
        break
      }

      case 'tool': {
        state.streaming = true
        // Create a separate tool_use message for each tool invocation
        const toolMsg: ChatMessage = {
          role: 'tool_use',
          content: '',
          timestamp: new Date().toISOString(),
          toolName: event.name || 'unknown',
          toolInput: event.input || {},
        }
        state.messages.push(toolMsg)

        // Also maintain toolUse array on last assistant message for StreamingIndicator compat
        const prevMsg = state.messages.slice().reverse().find(m => m.role === 'assistant')
        if (prevMsg) {
          if (!prevMsg.toolUse) prevMsg.toolUse = []
          prevMsg.toolUse.push({ name: event.name, input: event.input })
        }

        this.emitChatUpdate(sessionId)

        // Mirror tool event to active child session
        const activeChildTool = this.getActiveChild(sessionId)
        if (activeChildTool) {
          this.mirrorToChildSession(activeChildTool, { ...toolMsg })
        }
        break
      }

      case 'thinking': {
        state.streaming = true
        const chunk = event.text || ''

        // Merge into the last thinking message if it exists, otherwise create new
        const lastMsg = state.messages[state.messages.length - 1]
        if (lastMsg?.role === 'thinking') {
          lastMsg.content += chunk
        } else {
          state.messages.push({
            role: 'thinking',
            content: chunk,
            timestamp: new Date().toISOString(),
            isThinking: true,
          })
        }
        this.emitChatUpdate(sessionId)

        // Mirror thinking event to active child session
        const activeChildThink = this.getActiveChild(sessionId)
        if (activeChildThink) {
          const childState = this.getOrCreateState(activeChildThink)
          const childLast = childState.messages[childState.messages.length - 1]
          if (childLast?.role === 'thinking') {
            childLast.content += chunk
            this.emitChatUpdate(activeChildThink)
          } else {
            this.mirrorToChildSession(activeChildThink, {
              role: 'thinking',
              content: chunk,
              timestamp: new Date().toISOString(),
              isThinking: true,
            })
          }
        }
        break
      }

      case 'agent_task': {
        this.handleAgentTaskEvent(sessionId, event)
        break
      }
    }
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    const state = this.getOrCreateState(sessionId)
    const scheduler = this.getOrCreateScheduler(sessionId)

    // Use scheduler to decide dispatch strategy
    const dispatch = scheduler.enqueue(message, state.streaming)
    if (!dispatch.dispatched) {
      // Message was queued — notify frontend
      const window = this.getWindow()
      if (window && !window.isDestroyed()) {
        window.webContents.send('chat:message-queued', {
          sessionId,
          queueLength: dispatch.queueLength,
          strategy: dispatch.strategy,
        })
      }
      return
    }

    state.streaming = true
    state.error = ''

    // Add user message
    state.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    })

    this.sessionService.updateStatus(sessionId, 'running')
    this.emitChatUpdate(sessionId)
    // Notify parser engines that user initiated a new turn
    this.stateInference.markWorkStarted(sessionId)
    this.outputParser.clearInterventionDedupe(sessionId)

    try {
      // Auto-initialize session if bridge adapter is not active (e.g. after app restart)
      const isActive = this.bridgeManager.isSessionActive(sessionId)
      if (!isActive) {
        appLog('info', `Auto-initializing session ${sessionId}`, 'process')
        await this.initSession(sessionId)
      }
      appLog('info', `Sending message to AI (${message.length} chars)`, 'process')
      await this.bridgeManager.sendMessage(sessionId, message)
    } catch (err: any) {
      appLog('error', `sendMessage failed: ${err.message}`, 'process')
      state.streaming = false
      state.error = err.message || 'Failed to send message'
      this.sessionService.updateStatus(sessionId, 'error')
      this.emitChatUpdate(sessionId)
    }
  }

  async sendMessageWithImages(sessionId: string, message: string, images: Array<{data: string, mimeType: string}>): Promise<void> {
    const state = this.getOrCreateState(sessionId)
    state.streaming = true
    state.error = ''

    state.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      images: images.map(img => `data:${img.mimeType};base64,${img.data}`),
    })

    this.sessionService.updateStatus(sessionId, 'running')
    this.emitChatUpdate(sessionId)
    // Notify parser engines that user initiated a new turn
    this.stateInference.markWorkStarted(sessionId)
    this.outputParser.clearInterventionDedupe(sessionId)

    try {
      if (!this.bridgeManager.isSessionActive(sessionId)) {
        await this.initSession(sessionId)
      }
      await this.bridgeManager.sendMessage(sessionId, message, images)
    } catch (err: any) {
      state.streaming = false
      state.error = err.message || 'Failed to send message'
      this.sessionService.updateStatus(sessionId, 'error')
      this.emitChatUpdate(sessionId)
    }
  }

  getChatState(sessionId: string): ChatState | null {
    const state = this.sessionStates.get(sessionId)
    if (!state) {
      // Load from DB (covers child sessions and sessions not yet in memory)
      const session = this.sessionService.getById(sessionId)
      if (!session) return null
      let messages: ChatMessage[] = []
      try {
        messages = JSON.parse(session.messagesJson || '[]')
      } catch {}
      // For child sessions, also populate the in-memory state so future calls are consistent
      if (session.parentSessionId) {
        this.sessionStates.set(sessionId, {
          messages,
          streaming: false,
          error: '',
          conversationId: session.conversationId || '',
        })
      }
      return { messages, streaming: false, error: '' }
    }
    return {
      messages: state.messages,
      streaming: state.streaming,
      error: state.error,
    }
  }

  isStreaming(sessionId: string): boolean {
    return this.sessionStates.get(sessionId)?.streaming || false
  }

  /** Get the output parser instance */
  getOutputParser(): OutputParser {
    return this.outputParser
  }

  /** Get the state inference instance */
  getStateInference(): StateInference {
    return this.stateInference
  }

  async stopProcess(sessionId: string): Promise<void> {
    const state = this.sessionStates.get(sessionId)
    if (state) {
      state.streaming = false
    }
    // Clear pending messages for this session
    const scheduler = this.schedulers.get(sessionId)
    if (scheduler) scheduler.clear()
    await this.bridgeManager.stopSession(sessionId)
    this.concurrencyGuard.unregisterSession(sessionId)
    this.sessionService.updateStatus(sessionId, 'idle')
    this.emitChatUpdate(sessionId)
    // Clean up parser state
    this.outputParser.clearSession(sessionId)
    this.stateInference.removeSession(sessionId)
    // Cancel all sub-agents when parent is stopped (including persistent)
    this.finalizeChildAgents(sessionId, 'cancelled', false)
    // Clean up supervisor prompt rules file
    this.cleanupSupervisorPromptForSession(sessionId)
  }

  async resumeSession(oldSessionId: string): Promise<{success: boolean; sessionId?: string; error?: string}> {
    try {
      const oldSession = this.sessionService.getById(oldSessionId)
      if (!oldSession) return { success: false, error: 'Session not found' }

      // Create new session based on old one
      const newSession = this.sessionService.create({
        name: oldSession.name + ' (resumed)',
        providerId: oldSession.providerId,
        workingDirectory: oldSession.workingDirectory,
        autoAccept: oldSession.autoAccept,
        permissionMode: oldSession.permissionMode,
        customInstructions: oldSession.customInstructions,
        appendSystemPrompt: oldSession.appendSystemPrompt,
      })

      // Copy conversation ID for resume
      if (oldSession.conversationId) {
        this.sessionService.updateConversationId(newSession.id, oldSession.conversationId)
      }

      // Copy messages
      const oldState = this.sessionStates.get(oldSessionId)
      if (oldState) {
        this.sessionStates.set(newSession.id, {
          messages: [...oldState.messages],
          streaming: false,
          error: '',
          conversationId: oldSession.conversationId,
        })
      }

      return { success: true, sessionId: newSession.id }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  // ─── Persistent Sub-Agent API ─────────────────────────────────────

  /**
   * Spawn a persistent child session with its own live adapter.
   * Unlike SDK sub-agents, these stay alive and accept follow-up messages.
   */
  async spawnChildSession(
    parentSessionId: string,
    options: { name: string; prompt: string; providerId?: string },
  ): Promise<{ childSessionId: string }> {
    const parent = this.sessionService.getById(parentSessionId)
    if (!parent) throw new Error(`Parent session not found: ${parentSessionId}`)

    // Create child session in DB (optionally with a different provider)
    const child = this.sessionService.create({
      name: options.name,
      providerId: options.providerId || parent.providerId,
      workingDirectory: parent.workingDirectory,
      parentSessionId,
      autoAccept: parent.autoAccept,
      permissionMode: parent.permissionMode,
    })

    // Register in AgentTracker
    const tracker = this.getOrCreateTracker(parentSessionId)
    const agent = tracker.registerPersistentChild(
      parentSessionId,
      child.id,
      options.name,
      options.prompt,
    )
    this.emitAgentUpdate(parentSessionId, agent)

    // Init live adapter and send initial prompt
    await this.initSession(child.id)
    await this.sendMessage(child.id, options.prompt)

    appLog('info', `Persistent child spawned: ${child.id} for parent ${parentSessionId}`, 'process')
    return { childSessionId: child.id }
  }

  /**
   * Spawn a persistent child and wait for its initial response.
   * Used by the agent-control MCP server via HTTP API.
   */
  async spawnChildSessionAndWait(
    parentSessionId: string,
    options: { name: string; prompt: string; providerId?: string },
    timeoutMs = 300_000,
  ): Promise<{ childSessionId: string; result: string }> {
    const parent = this.sessionService.getById(parentSessionId)
    if (!parent) throw new Error(`Parent session not found: ${parentSessionId}`)

    const child = this.sessionService.create({
      name: options.name,
      providerId: options.providerId || parent.providerId,
      workingDirectory: parent.workingDirectory,
      parentSessionId,
      autoAccept: parent.autoAccept,
      permissionMode: parent.permissionMode,
    })

    const tracker = this.getOrCreateTracker(parentSessionId)
    const agent = tracker.registerPersistentChild(
      parentSessionId,
      child.id,
      options.name,
      options.prompt,
    )
    this.emitAgentUpdate(parentSessionId, agent)

    // Set up completion waiter BEFORE sending (avoids race condition)
    const resultPromise = this.createChildTurnWaiter(child.id, timeoutMs)

    await this.initSession(child.id)
    await this.sendMessage(child.id, options.prompt)

    appLog('info', `Persistent child spawned (with wait): ${child.id}`, 'process')
    const result = await resultPromise
    return { childSessionId: child.id, result }
  }

  /**
   * Send a message to a child session from its parent.
   */
  async sendToChild(
    parentSessionId: string,
    childSessionId: string,
    message: string,
  ): Promise<void> {
    const child = this.sessionService.getById(childSessionId)
    if (!child) throw new Error(`Child session not found: ${childSessionId}`)
    if (child.parentSessionId !== parentSessionId) {
      throw new Error(`Session ${childSessionId} is not a child of ${parentSessionId}`)
    }
    // Clear idle flag — agent entering new turn
    this.agentIdleFlags.delete(childSessionId)
    // Mark agent as 'running' while processing
    this.updatePersistentAgentStatus(parentSessionId, childSessionId, 'running')
    await this.sendMessage(childSessionId, message)
  }

  /**
   * Send a message to a child and wait for its response.
   * Used by the agent-control MCP server via HTTP API.
   */
  async sendToChildAndWait(
    parentSessionId: string,
    childSessionId: string,
    message: string,
    timeoutMs = 300_000,
  ): Promise<string> {
    // Set up waiter BEFORE sending to avoid race
    const resultPromise = this.createChildTurnWaiter(childSessionId, timeoutMs)
    await this.sendToChild(parentSessionId, childSessionId, message)
    return resultPromise
  }

  /**
   * Explicitly close a persistent child agent.
   */
  async closeChildSession(parentSessionId: string, childSessionId: string): Promise<void> {
    const child = this.sessionService.getById(childSessionId)
    if (!child) throw new Error(`Child session not found: ${childSessionId}`)
    if (child.parentSessionId !== parentSessionId) {
      throw new Error(`Session ${childSessionId} is not a child of ${parentSessionId}`)
    }

    // Stop the child's bridge adapter and free concurrency slot
    await this.bridgeManager.destroySession(childSessionId).catch(() => {})
    this.concurrencyGuard.unregisterSession(childSessionId)

    // Get last result from child
    const childState = this.getOrCreateState(childSessionId)
    const lastAssistant = [...childState.messages].reverse().find(m => m.role === 'assistant')
    const result = lastAssistant?.content || '(no output)'

    // Update tracker and session status
    this.updatePersistentAgentStatus(parentSessionId, childSessionId, 'completed')
    this.sessionService.updateStatus(childSessionId, 'completed')

    // Inject final result into parent
    const parentState = this.sessionStates.get(parentSessionId)
    if (parentState) {
      parentState.messages.push({
        role: 'system',
        content: `[子Agent "${child.name}" 已关闭]\n\n最终输出: ${result.slice(0, 2000)}`,
        timestamp: new Date().toISOString(),
      })
      this.persistMessages(parentSessionId)
      this.emitChatUpdate(parentSessionId)
    }

    // Resolve any pending waiter
    this.resolveChildTurnWaiter(childSessionId, result)

    childState.streaming = false
    this.emitChatUpdate(childSessionId)
    appLog('info', `Persistent child closed: ${childSessionId}`, 'process')
  }

  /**
   * Get all child sessions for a parent.
   */
  getChildSessions(parentSessionId: string): any[] {
    const allSessions = this.sessionService.getAll()
    return allSessions.filter((s: any) => s.parentSessionId === parentSessionId)
  }

  /**
   * When a child session completes, inject its result into the parent's context.
   */
  private injectChildResult(parentSessionId: string, childSessionId: string) {
    const parentState = this.sessionStates.get(parentSessionId)
    if (!parentState) return

    const child = this.sessionService.getById(childSessionId)
    if (!child) return

    // Get the last assistant message from child as result
    const childState = this.getOrCreateState(childSessionId)
    const lastAssistant = [...childState.messages].reverse().find(m => m.role === 'assistant')
    const result = lastAssistant?.content || '(no output)'

    parentState.messages.push({
      role: 'system',
      content: `[子Agent "${child.name}" 完成]\n\n${result.slice(0, 2000)}`,
      timestamp: new Date().toISOString(),
    })
    this.persistMessages(parentSessionId)
    this.emitChatUpdate(parentSessionId)

    // Update tracker
    const tracker = this.agentTrackers.get(parentSessionId)
    if (tracker) {
      for (const agent of tracker.getAll()) {
        if (agent.childSessionId === childSessionId && agent.status === 'running') {
          agent.status = 'completed'
          agent.completedAt = new Date().toISOString()
          agent.streaming = false
          agent.summary = result.slice(0, 200)
          this.emitAgentUpdate(parentSessionId, agent)
          break
        }
      }
    }
  }

  listAllAgents(): any[] {
    const result: any[] = []
    for (const tracker of this.agentTrackers.values()) {
      for (const agent of tracker.getAll()) {
        result.push(this.trackedAgentToInfo(agent))
      }
    }
    return result
  }

  getAgentsBySession(sessionId: string): any[] {
    const tracker = this.agentTrackers.get(sessionId)
    if (!tracker) return []
    return tracker.getAgentsByParent(sessionId).map(a => this.trackedAgentToInfo(a))
  }

  /**
   * When a parent session finishes (done/error/stop), finalize all its
   * still-running child agents so they don't stay stuck in 'running'.
   */
  private finalizeChildAgents(
    parentSessionId: string,
    status: 'completed' | 'cancelled' | 'failed',
    skipPersistent = false,
  ) {
    const tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) return

    const finalized = tracker.finalizeRunningAgents(status, skipPersistent)
    for (const agent of finalized) {
      // Destroy live adapter for persistent children and free concurrency slot
      this.bridgeManager.destroySession(agent.childSessionId).catch(() => {})
      this.concurrencyGuard.unregisterSession(agent.childSessionId)

      this.syncChildStateFromDB(agent.childSessionId)
      const childState = this.sessionStates.get(agent.childSessionId)
      if (childState) {
        childState.streaming = false
      }
      this.emitAgentUpdate(parentSessionId, agent)
      this.emitChatUpdate(agent.childSessionId)
    }
  }

  private getOrCreateTracker(parentSessionId: string): AgentTracker {
    let tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) {
      const session = this.sessionService.getById(parentSessionId)
      tracker = new AgentTracker(
        this.sessionService,
        session?.providerId || '',
        session?.workingDirectory || process.cwd(),
      )
      this.agentTrackers.set(parentSessionId, tracker)
    }
    return tracker
  }

  private handleAgentTaskEvent(parentSessionId: string, event: any) {
    const tracker = this.getOrCreateTracker(parentSessionId)
    let agent: TrackedAgent | null = null

    switch (event.subtype) {
      case 'task_started':
        agent = tracker.onTaskStarted(parentSessionId, event)
        // Push child session onto active stack so delta/tool/thinking events
        // are mirrored to this child session
        if (agent) {
          let stack = this.activeChildStack.get(parentSessionId)
          if (!stack) {
            stack = []
            this.activeChildStack.set(parentSessionId, stack)
          }
          stack.push(agent.childSessionId)
          appLog('info', `Active child pushed: ${agent.childSessionId} (stack depth: ${stack.length})`, 'process')
        }
        break
      case 'task_progress':
        agent = tracker.onTaskProgress(event)
        break
      case 'task_notification': {
        agent = tracker.onTaskNotification(event)
        // Pop child session from active stack and persist its messages
        if (agent) {
          const stack = this.activeChildStack.get(parentSessionId)
          if (stack) {
            const idx = stack.indexOf(agent.childSessionId)
            if (idx !== -1) {
              stack.splice(idx, 1)
            }
            if (stack.length === 0) {
              this.activeChildStack.delete(parentSessionId)
            }
          }
          // Persist the mirrored messages to DB
          const childState = this.sessionStates.get(agent.childSessionId)
          if (childState) {
            childState.streaming = false
            this.persistMessages(agent.childSessionId)
          }
          appLog('info', `Active child popped: ${agent.childSessionId}`, 'process')
        }
        break
      }
    }

    if (agent) {
      // For task_started, always sync from DB to pick up the initial user message
      // that AgentTracker wrote. Mirroring hasn't started yet at this point.
      if (event.subtype === 'task_started') {
        this.syncChildStateFromDB(agent.childSessionId)
      }
      // For task_progress, sync from DB only if NOT actively mirroring events
      // from the parent stream. When mirroring is active, in-memory state has
      // richer content than the AgentTracker's summary-based DB writes.
      const isMirroring = this.activeChildStack.get(parentSessionId)?.includes(agent.childSessionId)
      if (event.subtype === 'task_progress' && !isMirroring) {
        this.syncChildStateFromDB(agent.childSessionId)
      }

      // Mirror the agent's streaming flag into the child session's in-memory state
      // so the frontend shows the "正在思考..." animation for sub-agents too.
      const childState = this.sessionStates.get(agent.childSessionId)
      if (childState) {
        childState.streaming = agent.streaming
      }

      this.emitAgentUpdate(parentSessionId, agent)
      // Also emit a chat:update for the child session so ConversationView picks it up
      this.emitChatUpdate(agent.childSessionId)
    }
  }

  /**
   * Reload a child session's messages from DB into the in-memory sessionStates map.
   * This bridges the gap between AgentTracker (writes to DB) and emitChatUpdate (reads from memory).
   */
  private syncChildStateFromDB(childSessionId: string) {
    const session = this.sessionService.getById(childSessionId)
    if (!session) return

    let messages: ChatMessage[] = []
    try {
      messages = JSON.parse(session.messagesJson || '[]')
    } catch {}

    const existing = this.sessionStates.get(childSessionId)
    if (existing) {
      existing.messages = messages
    } else {
      this.sessionStates.set(childSessionId, {
        messages,
        streaming: false,
        error: '',
        conversationId: session.conversationId || '',
      })
    }
  }

  private emitAgentUpdate(parentSessionId: string, agent: TrackedAgent) {
    const window = this.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('agent:update', {
        parentSessionId,
        agent: this.trackedAgentToInfo(agent),
      })
    }
  }

  private trackedAgentToInfo(agent: TrackedAgent) {
    return {
      agentId: agent.agentId,
      name: agent.name,
      parentSessionId: agent.parentSessionId,
      childSessionId: agent.childSessionId,
      status: agent.status,
      summary: agent.summary,
      workDir: '',
      createdAt: agent.createdAt,
      completedAt: agent.completedAt,
      usage: agent.usage,
      streaming: agent.streaming,
    }
  }

  // ─── Persistent child helpers ──────────────────────────────────

  /** Check if a child session is a persistent (user-spawned) agent */
  private isPersistentChild(parentSessionId: string, childSessionId: string): boolean {
    const tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) return false
    return tracker.getAll().some(
      a => a.childSessionId === childSessionId && a.agentId.startsWith('persistent-'),
    )
  }

  /** Update the tracker status for a persistent child agent */
  private updatePersistentAgentStatus(
    parentSessionId: string,
    childSessionId: string,
    status: TrackedAgent['status'],
  ) {
    const tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) return
    for (const agent of tracker.getAll()) {
      if (agent.childSessionId === childSessionId && agent.agentId.startsWith('persistent-')) {
        agent.status = status
        agent.streaming = status === 'running'
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          agent.completedAt = agent.completedAt || new Date().toISOString()
        }
        this.emitAgentUpdate(parentSessionId, agent)
        break
      }
    }
  }

  /** Create a Promise that resolves when a persistent child finishes its current turn */
  private createChildTurnWaiter(childSessionId: string, timeoutMs = 300_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.childTurnWaiters.delete(childSessionId)
        reject(new Error(`Timeout waiting for child agent ${childSessionId} (${timeoutMs}ms)`))
      }, timeoutMs)

      this.childTurnWaiters.set(childSessionId, (result: string) => {
        clearTimeout(timer)
        resolve(result)
      })
    })
  }

  /** Resolve a pending child turn waiter (called from done event handler) */
  private resolveChildTurnWaiter(childSessionId: string, result: string) {
    const waiter = this.childTurnWaiters.get(childSessionId)
    if (waiter) {
      this.childTurnWaiters.delete(childSessionId)
      waiter(result)
    }
  }

  // ─── Agent idle detection ───

  /**
   * Wait until a persistent child agent finishes its current turn (idle).
   * Returns immediately if the agent already completed its turn.
   */
  async waitAgentIdle(
    parentSessionId: string,
    childSessionId: string,
    timeoutMs = 300_000,
  ): Promise<{ idle: boolean; output: string }> {
    const child = this.sessionService.getById(childSessionId)
    if (!child) return { idle: false, output: '' }
    if (child.parentSessionId !== parentSessionId) {
      return { idle: false, output: `Session ${childSessionId} is not a child of ${parentSessionId}` }
    }

    // Already completed/failed/cancelled — return immediately
    const tracker = this.agentTrackers.get(parentSessionId)
    if (tracker) {
      for (const agent of tracker.getAll()) {
        if (agent.childSessionId === childSessionId) {
          if (agent.status === 'completed' || agent.status === 'failed' || agent.status === 'cancelled') {
            return { idle: true, output: this.getAgentOutputText(childSessionId) }
          }
          break
        }
      }
    }

    // Fast path: idle flag already set (turn_complete fired before this call)
    if (this.agentIdleFlags.get(childSessionId)) {
      this.agentIdleFlags.delete(childSessionId)
      return { idle: true, output: this.getAgentOutputText(childSessionId) }
    }

    // Slow path: register waiter
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const waiters = this.agentIdleWaiters.get(childSessionId) || []
        const idx = waiters.findIndex(w => w.resolve === resolve)
        if (idx >= 0) waiters.splice(idx, 1)
        resolve({ idle: false, output: this.getAgentOutputText(childSessionId) })
      }, timeoutMs)

      const waiters = this.agentIdleWaiters.get(childSessionId) || []
      waiters.push({ resolve, timer })
      this.agentIdleWaiters.set(childSessionId, waiters)
    })
  }

  /**
   * Get agent output text (last N lines of assistant messages).
   */
  getAgentOutput(
    childSessionId: string,
    lines?: number,
  ): { output: string; error?: string } {
    const state = this.sessionStates.get(childSessionId)
    if (!state) {
      // Try loading from DB
      const session = this.sessionService.getById(childSessionId)
      if (!session) return { output: '', error: 'Session not found' }
      let messages: ChatMessage[] = []
      try { messages = JSON.parse(session.messagesJson || '[]') } catch {}
      const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.content)
      let output = assistantMsgs.map(m => m.content).join('\n')
      if (lines && lines > 0) {
        const allLines = output.split('\n')
        if (allLines.length > lines) output = allLines.slice(-lines).join('\n')
      }
      return { output }
    }

    const assistantMsgs = state.messages.filter(m => m.role === 'assistant' && m.content)
    let output = assistantMsgs.map(m => m.content).join('\n')
    if (lines && lines > 0) {
      const allLines = output.split('\n')
      if (allLines.length > lines) output = allLines.slice(-lines).join('\n')
    }
    return { output }
  }

  /**
   * Get agent status info.
   */
  getAgentStatus(
    parentSessionId: string,
    childSessionId: string,
  ): { status: string; name: string; agentId: string } | null {
    const tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) return null
    for (const agent of tracker.getAll()) {
      if (agent.childSessionId === childSessionId) {
        return { status: agent.status, name: agent.name, agentId: agent.agentId }
      }
    }
    return null
  }

  /** Helper: get last assistant text for a child session */
  private getAgentOutputText(childSessionId: string): string {
    const state = this.sessionStates.get(childSessionId)
    if (!state) return ''
    const last = [...state.messages].reverse().find(m => m.role === 'assistant')
    return last?.content || ''
  }

  /** Resolve all pending idle waiters for a child session */
  private resolveAgentIdleWaiters(childSessionId: string) {
    const waiters = this.agentIdleWaiters.get(childSessionId)
    if (!waiters || waiters.length === 0) return
    const output = this.getAgentOutputText(childSessionId)
    for (const w of waiters) {
      if (w.timer) clearTimeout(w.timer)
      w.resolve({ idle: true, output })
    }
    this.agentIdleWaiters.delete(childSessionId)
  }

  // ─── Supervisor prompt cleanup ─────────────────────────────────

  /**
   * Clean up the supervisor prompt rules file for a session.
   * Called when a parent session is stopped or encounters a terminal error.
   */
  private cleanupSupervisorPromptForSession(sessionId: string): void {
    const workDir = this.supervisorPromptSessions.get(sessionId)
    if (workDir) {
      cleanupSupervisorPrompt(workDir)
      this.supervisorPromptSessions.delete(sessionId)
    }
  }

  // ─── Cross-Session Awareness API ─────────────────────────────

  /**
   * List all sessions (active and recent) for cross-session awareness.
   * Excludes child session internal details to keep the response concise.
   */
  listSessionsForAwareness(
    options: { status?: string; limit?: number } = {},
  ): Array<{
    id: string
    name: string
    status: string
    workDir: string
    createdAt: string
    providerId: string
    parentSessionId: string
  }> {
    const { status = 'all', limit = 20 } = options

    let sessions = this.sessionService.getAll()

    // Filter by status if specified
    if (status && status !== 'all') {
      sessions = sessions.filter((s) => s.status === status)
    }

    // Map to a simplified structure
    const result = sessions.slice(0, limit).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      workDir: s.workingDirectory,
      createdAt: s.startedAt,
      providerId: s.providerId,
      parentSessionId: s.parentSessionId,
    }))

    return result
  }

  /**
   * Get a summary of a specific session's conversation.
   * Includes last N assistant messages, tool calls used, and files modified.
   */
  getSessionSummary(
    sessionId: string,
    maxMessages = 10,
  ): {
    sessionId: string
    name: string
    status: string
    providerId: string
    workDir: string
    createdAt: string
    assistantMessages: Array<{ content: string; timestamp: string }>
    toolsUsed: string[]
    filesModified: string[]
  } | null {
    const session = this.sessionService.getById(sessionId)
    if (!session) return null

    // Get messages from in-memory state or DB
    let messages: ChatMessage[] = []
    const state = this.sessionStates.get(sessionId)
    if (state) {
      messages = state.messages
    } else {
      try {
        messages = JSON.parse(session.messagesJson || '[]')
      } catch {}
    }

    // Extract last N assistant messages
    const assistantMsgs = messages
      .filter((m) => m.role === 'assistant' && m.content)
      .slice(-maxMessages)
      .map((m) => ({
        content: m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content,
        timestamp: m.timestamp,
      }))

    // Collect unique tool names used across all messages
    const toolsSet = new Set<string>()
    for (const m of messages) {
      if (m.toolUse && Array.isArray(m.toolUse)) {
        for (const t of m.toolUse) {
          if (t.name) toolsSet.add(t.name)
        }
      }
    }

    // Extract file paths from tool uses (common patterns: file_path, path, filePath)
    const filesSet = new Set<string>()
    for (const m of messages) {
      if (m.toolUse && Array.isArray(m.toolUse)) {
        for (const t of m.toolUse) {
          const input = t.input || {}
          const filePath = input.file_path || input.path || input.filePath
          if (filePath && typeof filePath === 'string') {
            filesSet.add(filePath)
          }
        }
      }
    }

    return {
      sessionId: session.id,
      name: session.name,
      status: session.status,
      providerId: session.providerId,
      workDir: session.workingDirectory,
      createdAt: session.startedAt,
      assistantMessages: assistantMsgs,
      toolsUsed: Array.from(toolsSet),
      filesModified: Array.from(filesSet),
    }
  }

  /**
   * Search across all session messages for a query string.
   * Returns matching sessions with relevant snippets.
   */
  searchSessions(
    query: string,
    limit = 20,
  ): Array<{
    sessionId: string
    name: string
    status: string
    matches: Array<{ role: string; snippet: string; timestamp: string }>
  }> {
    if (!query || query.trim().length === 0) return []

    const lowerQuery = query.toLowerCase()
    const allSessions = this.sessionService.getAll()
    const results: Array<{
      sessionId: string
      name: string
      status: string
      matches: Array<{ role: string; snippet: string; timestamp: string }>
    }> = []

    for (const session of allSessions) {
      if (results.length >= limit) break

      // Get messages from in-memory state or DB
      let messages: ChatMessage[] = []
      const state = this.sessionStates.get(session.id)
      if (state) {
        messages = state.messages
      } else {
        try {
          messages = JSON.parse(session.messagesJson || '[]')
        } catch {
          continue
        }
      }

      const matches: Array<{ role: string; snippet: string; timestamp: string }> = []

      for (const msg of messages) {
        if (!msg.content) continue
        const lowerContent = msg.content.toLowerCase()
        const idx = lowerContent.indexOf(lowerQuery)
        if (idx === -1) continue

        // Extract a snippet around the match (100 chars before, 200 chars after)
        const start = Math.max(0, idx - 100)
        const end = Math.min(msg.content.length, idx + query.length + 200)
        let snippet = msg.content.slice(start, end)
        if (start > 0) snippet = '...' + snippet
        if (end < msg.content.length) snippet = snippet + '...'

        matches.push({
          role: msg.role,
          snippet,
          timestamp: msg.timestamp,
        })

        // Limit matches per session to avoid huge payloads
        if (matches.length >= 5) break
      }

      if (matches.length > 0) {
        results.push({
          sessionId: session.id,
          name: session.name,
          status: session.status,
          matches,
        })
      }
    }

    return results
  }

  // ─── Resource status & Scheduler helpers ──────────────────────

  /** Get current resource status (session count, memory usage). */
  getResourceStatus() {
    return this.concurrencyGuard.getResourceStatus()
  }

  /** Flush the next pending message from the scheduler for a session. */
  private flushSchedulerPending(sessionId: string) {
    const scheduler = this.schedulers.get(sessionId)
    if (!scheduler || !scheduler.hasPending()) return
    const next = scheduler.flushPending()
    if (!next) return
    setImmediate(() => {
      this.sendMessage(sessionId, next.text).catch((err) => {
        appLog('error', `Failed to dispatch queued message for ${sessionId}: ${err.message}`, 'process')
      })
    })
  }

  /** Check if a provider adapter type is Claude-based */
  private isClaudeAdapter(adapterType: string): boolean {
    const t = (adapterType || '').toLowerCase()
    return t.includes('claude') || t === '' // default to Claude
  }

  /**
   * Clean up parser and state inference resources.
   * Should be called on app quit / before-quit.
   */
  cleanup(): void {
    this.stateInference.stop()
    this.outputParser.stopWatching()
    this.outputParser.cleanupUsage()
  }
}

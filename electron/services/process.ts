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
import { AgentApi } from './agent-api.js'
import { ConcurrencyGuard } from './concurrency-guard.js'
import { MessageScheduler } from './message-scheduler.js'
import { appLog } from './log.js'
import { injectSupervisorPrompt, injectCodexAgentsMd, cleanupSupervisorPrompt, buildAllRulesContent } from './supervisor-prompt.js'
import { OutputParser } from '../parser/OutputParser.js'
import { StateInference } from '../parser/StateInference.js'
import type { NotificationManager } from './notification-manager.js'
import type { ChatMessage, ChatState, ChatPatchEvent, SessionState, BridgeEvent, AgentInfo } from './process-types.js'
import { AgentLifecycleManager } from './agent-lifecycle.js'
import { SessionSearchService } from './session-search.js'

// Re-export types so existing consumers don't break
export type { ChatMessage, ChatState, ChatPatchEvent } from './process-types.js'

const STREAM_PATCH_INTERVAL_MS = 120

export class ProcessService {
  private sessionStates = new Map<string, SessionState>()
  /** Last workDir used to initialize each provider session. */
  private initializedSessionWorkDirs = new Map<string, string>()
  /** Coalesces hot streaming updates so the renderer does not process every token event. */
  private chatPatchTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Sessions that had supervisor prompt injected — tracks workDir for cleanup */
  private supervisorPromptSessions = new Map<string, string>()
  /** Internal HTTP API for the agent-control MCP server */
  private agentApi: AgentApi | null = null
  private agentApiPort = 0
  /** Concurrency guard — limits max concurrent sessions and monitors resources */
  private concurrencyGuard = new ConcurrencyGuard()
  /** Per-session message schedulers — queues messages when session is busy */
  private schedulers = new Map<string, MessageScheduler>()
  /** Output parser — parses CLI output into structured activity events */
  private outputParser = new OutputParser()
  /** State inference — detects session status from output patterns */
  private stateInference = new StateInference()
  /** Optional notification manager — sends system + bot notifications on turn complete/error */
  private notificationManager: NotificationManager | null = null
  /** Agent lifecycle manager — handles child/sub-agent sessions */
  private agentLifecycle: AgentLifecycleManager
  /** Session search service — cross-session awareness and search */
  private sessionSearch: SessionSearchService

  constructor(
    private db: Database,
    private sessionService: SessionService,
    private providerService: ProviderService,
    private settingsService: SettingsService,
    private bridgeManager: BridgeManager,
    private getWindow: () => BrowserWindow | null,
  ) {
    // Initialize agent lifecycle manager
    this.agentLifecycle = new AgentLifecycleManager(
      sessionService,
      bridgeManager,
      this.concurrencyGuard,
      getWindow,
      {
        getOrCreateState: (id) => this.getOrCreateState(id),
        emitChatUpdate: (id) => this.emitChatUpdate(id),
        persistMessages: (id) => this.persistMessages(id),
        initSession: (id) => this.initSession(id),
        sendMessage: (id, msg) => this.sendMessage(id, msg),
      },
      this.sessionStates,
    )

    // Initialize session search service
    this.sessionSearch = new SessionSearchService(sessionService, this.sessionStates)

    // Start the state inference polling timer
    this.stateInference.start()

    // Forward parser activity events to the renderer
    this.outputParser.on('activity', (sessionId: string, event: unknown) => {
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

  /** Attach a NotificationManager so turn-complete / error events trigger notifications */
  setNotificationManager(manager: NotificationManager): void {
    this.notificationManager = manager
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
    this.clearPendingChatPatch(sessionId)
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

  private emitChatPatch(sessionId: string, patch: Omit<ChatPatchEvent, 'sessionId'>) {
    const window = this.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('chat:patch', {
        sessionId,
        ...patch,
      } satisfies ChatPatchEvent)
    }
  }

  private clearPendingChatPatch(sessionId: string) {
    const timer = this.chatPatchTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.chatPatchTimers.delete(sessionId)
    }
  }

  private scheduleLastMessagePatch(sessionId: string) {
    if (this.chatPatchTimers.has(sessionId)) return

    const timer = setTimeout(() => {
      this.chatPatchTimers.delete(sessionId)
      const state = this.sessionStates.get(sessionId)
      if (!state) return

      const message = state.messages[state.messages.length - 1]
      if (!message) {
        this.emitChatPatch(sessionId, {
          type: 'meta',
          streaming: state.streaming,
          error: state.error,
        })
        return
      }

      this.emitChatPatch(sessionId, {
        type: 'upsert_last',
        message,
        streaming: state.streaming,
        error: state.error,
      })
    }, STREAM_PATCH_INTERVAL_MS)

    this.chatPatchTimers.set(sessionId, timer)
  }

  private persistMessages(sessionId: string) {
    const state = this.sessionStates.get(sessionId)
    if (state) {
      this.sessionService.updateMessages(sessionId, JSON.stringify(state.messages))
    }
  }

  private resolveEffectiveWorkDir(session: { worktreePath?: string; workingDirectory?: string }): string {
    return session.worktreePath || session.workingDirectory || process.cwd()
  }

  private normalizeWorkDir(workDir: string): string {
    const value = (workDir || '').trim()
    if (!value) {
      const fallback = path.resolve(process.cwd())
      return process.platform === 'win32' ? fallback.toLowerCase() : fallback
    }
    try {
      const normalized = path.resolve(value)
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized
    } catch {
      return process.platform === 'win32' ? value.toLowerCase() : value
    }
  }

  async initSession(sessionId: string): Promise<void> {
    const session = this.sessionService.getById(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const effectiveWorkDir = this.resolveEffectiveWorkDir(session)
    const desiredWorkDir = this.normalizeWorkDir(effectiveWorkDir)

    const isActive = this.bridgeManager.isSessionActive(sessionId)
    if (isActive) {
      const currentWorkDir = this.normalizeWorkDir(this.initializedSessionWorkDirs.get(sessionId) || '')
      if (currentWorkDir === desiredWorkDir) {
        appLog('debug', `initSession skipped (already active): ${sessionId}`, 'process')
        return
      }

      if (this.sessionStates.get(sessionId)?.streaming) {
        appLog('info', `Deferring session reinit until current turn completes: ${sessionId} (${currentWorkDir} -> ${desiredWorkDir})`, 'process')
        return
      }

      appLog('info', `Reinitializing session due to workDir change: ${sessionId} (${currentWorkDir} -> ${desiredWorkDir})`, 'process')
      await this.bridgeManager.destroySession(sessionId)
      this.concurrencyGuard.unregisterSession(sessionId)
      this.cleanupSupervisorPromptForSession(sessionId)
    }

    // Check concurrency guard before creating session.
    // Skip the check if this session is already registered (re-initialization after stream ended).
    if (!this.concurrencyGuard.isSessionRegistered(sessionId)) {
      const canCreate = this.concurrencyGuard.checkCanCreateSession()
      if (!canCreate.allowed) {
        throw new Error(canCreate.reason || 'Cannot create session: resource limit reached')
      }
    }

    // Child agent sessions: use parent's provider for initialization
    // (they can be interacted with independently when the user clicks into them)

    const provider = this.providerService.getById(session.providerId)
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`)

    // Initialize bridge adapter for this session
    const config: Record<string, unknown> = {
      workDir: effectiveWorkDir,
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
      maxOutputTokens: provider.maxOutputTokens || undefined,
      preferResponsesApi: provider.preferResponsesApi || undefined,
      envOverrides: provider.envOverrides ? this.parseEnvOverrides(provider.envOverrides) : undefined,
    }

    if (session.conversationId) {
      config.resumeSessionId = session.conversationId
    }
    if (provider.resumeFlag) {
      config.resumeFlag = provider.resumeFlag
    }

    // Inject ABF rules for non-child sessions.
    // Strategy: use file-based discovery per provider to avoid double injection.
    //   - Claude:  .claude/rules/abf-*.md (auto-discovered, NO appendSystemPrompt)
    //   - Codex:   AGENTS.md in repo root / workDir (auto-discovered, NO appendSystemPrompt)
    //   - Others:  appendSystemPrompt only (no file discovery mechanism)
    if (!session.parentSessionId) {
      try {
        const isClaudeBased = this.isClaudeAdapter(provider.adapterType)
        const isCodex = this.isCodexAdapter(provider.adapterType)
        const providerNames = this.providerService.getAll().map(p => p.name)
        const workDir = config.workDir as string

        if (isClaudeBased) {
          // Claude: write .claude/rules/ files only (Claude auto-discovers them)
          // Do NOT inject via appendSystemPrompt to avoid reading rules twice
          try {
            injectSupervisorPrompt(workDir, providerNames)
            this.supervisorPromptSessions.set(sessionId, workDir)
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err)
            appLog('warn', `Failed to inject Claude rules files: ${errMsg}`, 'process')
          }

          // Inject agent-control MCP server for Claude sessions
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
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err)
            appLog('warn', `Failed to set up agent-control MCP: ${errMsg}`, 'process')
          }
        } else if (isCodex) {
          // Codex: inject ABF rules into AGENTS.md so Codex's file discovery
          // sees them. Prefer repo root when we already know it.
          try {
            const promptWorkDir = session.worktreeSourceRepo || workDir
            injectCodexAgentsMd(promptWorkDir)
            this.supervisorPromptSessions.set(sessionId, promptWorkDir)
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err)
            appLog('warn', `Failed to inject Codex AGENTS.md: ${errMsg}`, 'process')
          }
        } else {
          // Other providers (Gemini, OpenCode, etc.): use appendSystemPrompt
          // These don't have file-based rule discovery
          const rulesContent = buildAllRulesContent(providerNames, false)
          const existingPrompt = (String(config.appendSystemPrompt || '')).trim()
          config.appendSystemPrompt = existingPrompt
            ? `${existingPrompt}\n\n${rulesContent}`
            : rulesContent
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        appLog('warn', `Failed to inject ABF rules: ${errMsg}`, 'process')
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
      this.initializedSessionWorkDirs.set(sessionId, effectiveWorkDir)
      this.concurrencyGuard.registerSession(sessionId)
      this.sessionService.updateStatus(sessionId, 'idle')
    } catch (err: unknown) {
      this.initializedSessionWorkDirs.delete(sessionId)
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

  private resolveAssistantPresentation(event: Pick<BridgeEvent, 'messageKind'>): ChatMessage['presentation'] {
    return event.messageKind === 'agent' ? 'commentary' : 'message'
  }

  private appendAssistantChunk(
    messages: ChatMessage[],
    text: string,
    options: {
      presentation?: ChatMessage['presentation']
      childSessionId?: string
      childAgentName?: string
    } = {},
  ): ChatMessage {
    const presentation = options.presentation || 'message'
    const lastMsg = messages[messages.length - 1]

    if (
      lastMsg?.role === 'assistant'
      && !lastMsg.toolName
      && !lastMsg.toolUse
      && lastMsg.childSessionId === options.childSessionId
      && (lastMsg.presentation || 'message') === presentation
    ) {
      lastMsg.content += text
      if (!lastMsg.presentation) {
        lastMsg.presentation = presentation
      }
      return lastMsg
    }

    const msg: ChatMessage = {
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
      presentation,
    }
    if (options.childSessionId) {
      msg.childSessionId = options.childSessionId
      msg.childAgentName = options.childAgentName
    }
    messages.push(msg)
    return msg
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
      this.appendAssistantChunk(childState.messages, msg.content, {
        presentation: msg.presentation,
      })
      childState.streaming = true
      this.scheduleLastMessagePatch(childSessionId)
      return
    }
    childState.messages.push(msg)
    childState.streaming = true
    if (msg.role === 'assistant' || msg.role === 'thinking') {
      this.scheduleLastMessagePatch(childSessionId)
    } else {
      this.emitChatPatch(childSessionId, {
        type: 'append',
        message: msg,
        streaming: childState.streaming,
        error: childState.error,
      })
    }
    // Persist tool/thinking events immediately so they survive if child doesn't end cleanly
    if (msg.toolUse || msg.thinking || msg.role === 'thinking') {
      this.persistMessages(childSessionId)
    }
  }

  private handleBridgeEvent(sessionId: string, event: BridgeEvent) {
    const state = this.getOrCreateState(sessionId)

    // When new work arrives after a 'done' event (multi-turn SDK streams),
    // transition status back to 'running' so the UI reflects the actual state.
    const wasStreaming = state.streaming

    switch (event.event) {
      case 'delta': {
        state.streaming = true
        if (!wasStreaming) {
          this.sessionService.updateStatus(sessionId, 'running')
          this.stateInference.markWorkStarted(sessionId)
        }
        const childInfo = this.agentLifecycle.getActiveChildInfo(sessionId)
        const presentation = this.resolveAssistantPresentation(event)
        // Append to last assistant message or create new one
        this.appendAssistantChunk(state.messages, event.text || '', {
          presentation,
          childSessionId: childInfo?.id,
          childAgentName: childInfo?.name,
        })
        // Feed text to output parser for activity detection
        if (event.text) {
          this.outputParser.feed(sessionId, event.text)
          this.stateInference.onOutput(sessionId, event.text)
          this.stateInference.onOutputData(sessionId, event.text)
        }
        this.scheduleLastMessagePatch(sessionId)

        // Mirror delta to active child session
        if (childInfo && event.text) {
          this.mirrorToChildSession(childInfo.id, {
            role: 'assistant',
            content: event.text,
            timestamp: new Date().toISOString(),
            presentation,
          })
        }
        break
      }

      case 'done': {
        // The 'done' event means the current turn is complete — always clear streaming.
        state.streaming = false

        // Check if the adapter stream is still alive for notification/idle decisions.
        const adapterStillAlive = this.bridgeManager.isSessionActive(sessionId)

        // Send notification only when the stream truly ends (adapter no longer alive)
        if (!adapterStillAlive) {
          try {
            const doneSession = this.sessionService.getById(sessionId)
            if (!doneSession?.parentSessionId && this.notificationManager) {
              const sessionName = doneSession?.name || sessionId
              const lastAssistantMsg = [...state.messages].reverse().find(
                m => m.role === 'assistant' && m.content && !m.toolName && !m.toolUse
              )
              const summary = lastAssistantMsg?.content || undefined
              appLog('info', `Sending turn-complete notification for "${sessionName}" (${sessionId})`, 'process')
              this.notificationManager.notify('taskComplete', sessionId, sessionName, summary)
            }
          } catch (notifErr: unknown) {
            const msg = notifErr instanceof Error ? notifErr.message : String(notifErr)
            appLog('error', `Failed to send turn-complete notification: ${msg}`, 'process')
          }
        }

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
        // Only mark idle when the adapter stream has truly ended.
        if (!adapterStillAlive) {
          this.sessionService.updateStatus(sessionId, 'idle')
          this.outputParser.markSessionEnded(sessionId)
          this.stateInference.markAwaitingUserInput(sessionId)
        }
        this.persistMessages(sessionId)
        this.emitChatUpdate(sessionId)

        // Persist mirrored messages for any remaining active children
        const remainingStack = this.agentLifecycle.getActiveChildStack(sessionId)
        if (remainingStack) {
          for (const childId of remainingStack) {
            const cs = this.sessionStates.get(childId)
            if (cs) {
              cs.streaming = false
              this.persistMessages(childId)
              this.emitChatUpdate(childId)
            }
          }
          this.agentLifecycle.deleteActiveChildStack(sessionId)
        }

        // If this is a child session, inject result back to parent
        const doneSessionForChild = this.sessionService.getById(sessionId)
        if (doneSessionForChild?.parentSessionId) {
          if (this.agentLifecycle.isPersistentChild(doneSessionForChild.parentSessionId, sessionId)) {
            // Persistent child: resolve waiter, set status to 'idle', keep alive
            const lastAssistant = [...state.messages].reverse().find(m => m.role === 'assistant')
            const resultText = lastAssistant?.content || '(no output)'
            this.agentLifecycle.resolveChildTurnWaiter(sessionId, resultText)
            this.agentLifecycle.updatePersistentAgentStatus(doneSessionForChild.parentSessionId, sessionId, 'idle')
            // Set idle flag (for waitAgentIdle race condition handling)
            this.agentLifecycle.setAgentIdleFlag(sessionId, true)
            this.agentLifecycle.resolveAgentIdleWaiters(sessionId)
          } else {
            this.agentLifecycle.injectChildResult(doneSessionForChild.parentSessionId, sessionId)
          }
        }

        // Finalize any sub-agents that are still running
        // Skip persistent children on normal turn completion
        this.agentLifecycle.finalizeChildAgents(sessionId, 'completed', true)

        // Flush pending messages from the scheduler
        this.flushSchedulerPending(sessionId)
        break
      }

      case 'error': {
        state.streaming = false
        state.error = event.error || 'Unknown error'
        this.initializedSessionWorkDirs.delete(sessionId)
        this.sessionService.updateStatus(sessionId, 'error')
        this.emitChatUpdate(sessionId)
        // Free concurrency slot so the session can be re-initialized later
        this.concurrencyGuard.unregisterSession(sessionId)
        // Persist mirrored messages for active children before cleanup
        const errorStack = this.agentLifecycle.getActiveChildStack(sessionId)
        if (errorStack) {
          for (const childId of errorStack) {
            const cs = this.sessionStates.get(childId)
            if (cs) {
              cs.streaming = false
              this.persistMessages(childId)
              this.emitChatUpdate(childId)
            }
          }
          this.agentLifecycle.deleteActiveChildStack(sessionId)
        }
        // Mark sub-agents as failed when parent errors (including persistent)
        this.agentLifecycle.finalizeChildAgents(sessionId, 'failed', false)
        // Clean up supervisor prompt on terminal error
        this.cleanupSupervisorPromptForSession(sessionId)

        // Send error notification for top-level sessions
        try {
          if (this.notificationManager) {
            const errSession = this.sessionService.getById(sessionId)
            if (!errSession?.parentSessionId) {
              const sessionName = errSession?.name || sessionId
              appLog('info', `Sending error notification for "${sessionName}" (${sessionId})`, 'process')
              this.notificationManager.notify('error', sessionId, sessionName, state.error)
            }
          }
        } catch (notifErr: unknown) {
          const msg = notifErr instanceof Error ? notifErr.message : String(notifErr)
          appLog('error', `Failed to send error notification: ${msg}`, 'process')
        }
        break
      }

      case 'tool': {
        state.streaming = true
        if (!wasStreaming) {
          this.sessionService.updateStatus(sessionId, 'running')
          this.stateInference.markWorkStarted(sessionId)
        }
        const childInfoTool = this.agentLifecycle.getActiveChildInfo(sessionId)
        // Create a separate tool_use message for each tool invocation
        const toolMsg: ChatMessage = {
          role: 'tool_use',
          content: '',
          timestamp: new Date().toISOString(),
          toolName: event.name || 'unknown',
          toolInput: event.input || {},
        }
        if (childInfoTool) {
          toolMsg.childSessionId = childInfoTool.id
          toolMsg.childAgentName = childInfoTool.name
        }
        state.messages.push(toolMsg)

        // Also maintain toolUse array on last assistant message for StreamingIndicator compat
        const prevMsg = state.messages.slice().reverse().find(m => m.role === 'assistant')
        if (prevMsg) {
          if (!prevMsg.toolUse) prevMsg.toolUse = []
          prevMsg.toolUse.push({ name: event.name || 'unknown', input: event.input || {} })
        }

        this.emitChatPatch(sessionId, {
          type: 'append',
          message: toolMsg,
          streaming: state.streaming,
          error: state.error,
        })

        // Mirror tool event to active child session
        if (childInfoTool) {
          this.mirrorToChildSession(childInfoTool.id, { ...toolMsg, childSessionId: undefined, childAgentName: undefined })
        }
        break
      }

      case 'thinking': {
        state.streaming = true
        if (!wasStreaming) {
          this.sessionService.updateStatus(sessionId, 'running')
          this.stateInference.markWorkStarted(sessionId)
        }
        const chunk = event.text || ''
        const childInfoThink = this.agentLifecycle.getActiveChildInfo(sessionId)

        // Merge into the last thinking message if it exists and belongs to the same child
        const lastMsg = state.messages[state.messages.length - 1]
        if (lastMsg?.role === 'thinking' && lastMsg.childSessionId === childInfoThink?.id) {
          lastMsg.content += chunk
        } else {
          const thinkMsg: ChatMessage = {
            role: 'thinking',
            content: chunk,
            timestamp: new Date().toISOString(),
            isThinking: true,
          }
          if (childInfoThink) {
            thinkMsg.childSessionId = childInfoThink.id
            thinkMsg.childAgentName = childInfoThink.name
          }
          state.messages.push(thinkMsg)
        }
        this.scheduleLastMessagePatch(sessionId)

        // Mirror thinking event to active child session
        if (childInfoThink) {
          const childState = this.getOrCreateState(childInfoThink.id)
          const childLast = childState.messages[childState.messages.length - 1]
          if (childLast?.role === 'thinking') {
            childLast.content += chunk
            this.scheduleLastMessagePatch(childInfoThink.id)
          } else {
            this.mirrorToChildSession(childInfoThink.id, {
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
        if (!wasStreaming) {
          state.streaming = true
          this.sessionService.updateStatus(sessionId, 'running')
          this.stateInference.markWorkStarted(sessionId)
        }
        this.agentLifecycle.handleAgentTaskEvent(sessionId, event)
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
    this.emitChatPatch(sessionId, {
      type: 'append',
      message: state.messages[state.messages.length - 1],
      streaming: state.streaming,
      error: state.error,
    })
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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      appLog('error', `sendMessage failed: ${errMsg}`, 'process')
      state.streaming = false
      state.error = errMsg || 'Failed to send message'
      this.sessionService.updateStatus(sessionId, 'error')
      this.emitChatUpdate(sessionId)
    }
  }

  async sendMessageWithImages(sessionId: string, message: string, images: Array<{data: string, mimeType: string}>): Promise<void> {
    const state = this.getOrCreateState(sessionId)
    const scheduler = this.getOrCreateScheduler(sessionId)

    // Use scheduler to decide dispatch strategy (same as sendMessage)
    const dispatch = scheduler.enqueue(message, state.streaming, images)
    if (!dispatch.dispatched) {
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

    state.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      images: images.map(img => `data:${img.mimeType};base64,${img.data}`),
    })

    this.sessionService.updateStatus(sessionId, 'running')
    this.emitChatPatch(sessionId, {
      type: 'append',
      message: state.messages[state.messages.length - 1],
      streaming: state.streaming,
      error: state.error,
    })
    // Notify parser engines that user initiated a new turn
    this.stateInference.markWorkStarted(sessionId)
    this.outputParser.clearInterventionDedupe(sessionId)

    try {
      if (!this.bridgeManager.isSessionActive(sessionId)) {
        await this.initSession(sessionId)
      }
      await this.bridgeManager.sendMessage(sessionId, message, images)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      state.streaming = false
      state.error = errMsg || 'Failed to send message'
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
    this.initializedSessionWorkDirs.delete(sessionId)
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
    this.agentLifecycle.finalizeChildAgents(sessionId, 'cancelled', false)
    // Clean up supervisor prompt rules file
    this.cleanupSupervisorPromptForSession(sessionId)
  }

  async resumeSession(oldSessionId: string): Promise<{success: boolean; sessionId?: string; error?: string}> {
    try {
      const session = this.sessionService.getById(oldSessionId)
      if (!session) return { success: false, error: 'Session not found' }

      // Reopen the original session instead of creating a new one
      this.sessionService.reopen(oldSessionId)

      // Ensure in-memory state exists (may have been cleared after completion)
      if (!this.sessionStates.has(oldSessionId)) {
        this.sessionStates.set(oldSessionId, {
          messages: [],
          streaming: false,
          error: '',
          conversationId: session.conversationId,
        })
      }

      return { success: true, sessionId: oldSessionId }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ─── Delegated Agent Lifecycle Methods ─────────────────────────

  async spawnChildSession(
    parentSessionId: string,
    options: { name: string; prompt: string; providerId?: string },
  ): Promise<{ childSessionId: string }> {
    return this.agentLifecycle.spawnChildSession(parentSessionId, options)
  }

  async spawnChildSessionAndWait(
    parentSessionId: string,
    options: { name: string; prompt: string; providerId?: string },
    timeoutMs = 300_000,
  ): Promise<{ childSessionId: string; result: string }> {
    return this.agentLifecycle.spawnChildSessionAndWait(parentSessionId, options, timeoutMs)
  }

  async sendToChild(
    parentSessionId: string,
    childSessionId: string,
    message: string,
  ): Promise<void> {
    return this.agentLifecycle.sendToChild(parentSessionId, childSessionId, message)
  }

  async sendToChildAndWait(
    parentSessionId: string,
    childSessionId: string,
    message: string,
    timeoutMs = 300_000,
  ): Promise<string> {
    return this.agentLifecycle.sendToChildAndWait(parentSessionId, childSessionId, message, timeoutMs)
  }

  async closeChildSession(parentSessionId: string, childSessionId: string): Promise<void> {
    return this.agentLifecycle.closeChildSession(parentSessionId, childSessionId)
  }

  getChildSessions(parentSessionId: string): ReturnType<AgentLifecycleManager['getChildSessions']> {
    return this.agentLifecycle.getChildSessions(parentSessionId)
  }

  listAllAgents(): AgentInfo[] {
    return this.agentLifecycle.listAllAgents()
  }

  getAgentsBySession(sessionId: string): AgentInfo[] {
    return this.agentLifecycle.getAgentsBySession(sessionId)
  }

  async waitAgentIdle(
    parentSessionId: string,
    childSessionId: string,
    timeoutMs = 300_000,
  ): Promise<{ idle: boolean; output: string }> {
    return this.agentLifecycle.waitAgentIdle(parentSessionId, childSessionId, timeoutMs)
  }

  getAgentOutput(
    childSessionId: string,
    lines?: number,
  ): { output: string; error?: string } {
    return this.agentLifecycle.getAgentOutput(childSessionId, lines)
  }

  getAgentStatus(
    parentSessionId: string,
    childSessionId: string,
  ): { status: string; name: string; agentId: string } | null {
    return this.agentLifecycle.getAgentStatus(parentSessionId, childSessionId)
  }

  // ─── Delegated Session Search Methods ──────────────────────────

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
    return this.sessionSearch.listSessionsForAwareness(options)
  }

  getSessionSummary(
    sessionId: string,
    maxMessages = 10,
  ) {
    return this.sessionSearch.getSessionSummary(sessionId, maxMessages)
  }

  searchSessions(
    query: string,
    limit = 20,
  ) {
    return this.sessionSearch.searchSessions(query, limit)
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
      const send = next.images && next.images.length > 0
        ? this.sendMessageWithImages(sessionId, next.text, next.images)
        : this.sendMessage(sessionId, next.text)
      send.catch((err) => {
        appLog('error', `Failed to dispatch queued message for ${sessionId}: ${err.message}`, 'process')
      })
    })
  }

  /** Check if a provider adapter type is Claude-based */
  private isClaudeAdapter(adapterType: string): boolean {
    const t = (adapterType || '').toLowerCase()
    return t.includes('claude') || t === '' // default to Claude
  }

  /** Check if a provider adapter type is Codex-based */
  private isCodexAdapter(adapterType: string): boolean {
    const t = (adapterType || '').toLowerCase()
    return t.includes('codex')
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

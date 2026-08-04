/**
 * ProcessService - manages AI chat processes and message streaming
 * Replaces Go internal/services/process.go
 *
 * Instead of communicating with bridge via subprocess NDJSON,
 * directly uses the BridgeManager which integrates adapters in-process.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import type { Database } from './database.js'
import type { MCPService } from './mcp.js'
import type { SessionService } from './session.js'
import type { SkillService } from './skill.js'
import type { ProviderService } from './provider.js'
import type { SettingsService } from './settings.js'
import type { BridgeManager } from '../bridge/bridge.js'
import { ProviderCapabilityRegistry } from '../bridge/ProviderCapabilityRegistry.js'
import {
  hasOptionalClaudeNativePackage,
  hasOptionalCodexNativePackage,
  missingHostCliError,
  resolveClaudeCodeExecutable,
  resolveCodexCliPath,
  resolveGrokCliPath,
} from './cli-path-resolve.js'
import { AgentApi } from './agent-api.js'
import { ConcurrencyGuard } from './concurrency-guard.js'
import { MessageScheduler } from './message-scheduler.js'
import { appLog } from './log.js'
import {
  injectSupervisorPrompt,
  injectProviderRules,
  injectWorkerPromptFiles,
  cleanupSupervisorPrompt,
  stripInheritedSoftwarePromptFiles,
  buildAllRulesContent,
  buildWorkerRulesContent,
  hasSupervisorPromptFiles,
  hasWorkerPromptFiles,
  enabledMcpsIncludeMempalace,
  NESTED_CHILD_MEMPALACE_MEMORY_PROMPT,
} from './supervisor-prompt.js'
import { isMempalaceSafeWrapped, isMempalaceServer } from './mempalace-safe.js'
import { OutputParser } from '../parser/OutputParser.js'
import { StateInference } from '../parser/StateInference.js'
import type { NotificationManager } from './notification-manager.js'
import {
  findLastMessage,
  type ChatMessage,
  type ChatState,
  type ChatPatchEvent,
  type SessionState,
  type BridgeEvent,
  type AgentInfo,
} from './process-types.js'
import { AgentLifecycleManager } from './agent-lifecycle.js'
import { SessionSearchService } from './session-search.js'
import { AgentStreamNormalizer } from './agent-stream-normalizer.js'
import { GitService } from './git.js'
import type { AgentPermissionResponse, AgentStreamSource } from './agent-stream-types.js'
import type { RequestPermissionOutcome } from '@agentclientprotocol/sdk'
import {
  AGENT_CONTROL_MCP_ID,
  resolveAbfSessionRole,
  resolveSessionMcpServers,
  shouldInjectAgentControl,
  type McpServerConfig,
} from './session-mcp-policy.js'

// Re-export types so existing consumers don't break
export type { ChatMessage, ChatState, ChatPatchEvent } from './process-types.js'

const STREAM_PATCH_INTERVAL_MS = 120

interface PendingPermission {
  resolve: (outcome: RequestPermissionOutcome) => void
  requestId: string
  optionIds: Set<string>
  abortListener?: () => void
  signal?: AbortSignal
}

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
  /** Provider-neutral agent:stream normalizer (sequence + contract mapping) */
  private agentStreamNormalizer = new AgentStreamNormalizer()
  /** Pending UI permission responses keyed by sessionId:requestId */
  private pendingPermissions = new Map<string, PendingPermission>()

  constructor(
    private db: Database,
    private sessionService: SessionService,
    private providerService: ProviderService,
    private settingsService: SettingsService,
    private mcpService: MCPService,
    private skillService: SkillService,
    private bridgeManager: BridgeManager,
    private getWindow: () => BrowserWindow | null,
  ) {
    // Initialize agent lifecycle manager (owns child worktree isolation + close cleanup)
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
        sendMessage: (id, msg, opts) => this.sendMessage(id, msg, opts),
        interruptTurn: (id) => this.interruptCurrentTurn(id),
      },
      this.sessionStates,
      new GitService(),
      settingsService,
    )

    // Initialize session search service
    this.sessionSearch = new SessionSearchService(sessionService, this.sessionStates)

    // Cold start: sessions left as running/starting/waiting_input in SQLite have
    // no live agent process. Mark them interrupted without launching anything so
    // restore is history-only (no auto re-prompt of prior turns).
    try {
      const rewritten = this.sessionService.reconcileOrphanedLiveSessions('interrupted')
      if (rewritten > 0) {
        appLog('info', `Reconciled ${rewritten} orphaned live session(s) to interrupted after restart`, 'process')
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      appLog('warn', `Failed to reconcile orphaned live sessions: ${errMsg}`, 'process')
    }

    // Cold start: drop orphan child rows (parent missing).
    try {
      const purged = this.sessionService.purgeOrphanChildSessions()
      if (purged > 0) {
        appLog('info', `Purged ${purged} orphan child session(s) after restart`, 'process')
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      appLog('warn', `Failed to purge orphan child sessions: ${errMsg}`, 'process')
    }

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
    return path.join(app.getAppPath(), 'electron', 'embedded-assets', 'mcps', 'agent-control', 'server.mjs')
  }

  /**
   * Build agent-control MCP config for a session that may spawn children.
   * ABF_PARENT_SESSION_ID is this session's id (spawned agents become its children).
   * Three-gen: top-level (爷爷) + direct child (父亲) only — not nested sons.
   * Returns null when provider cannot host MCP or API setup fails.
   */
  private async buildAgentControlMcpConfig(
    sessionId: string,
    provider: { id: string; adapterType: string },
    isAcp: boolean,
  ): Promise<McpServerConfig | null> {
    const isClaudeProvider = provider.id === 'claude-code'
    if (!isAcp && !isClaudeProvider) return null
    try {
      const apiPort = await this.ensureAgentApi()
      return {
        command: 'node',
        args: [this.getAgentControlMcpPath()],
        env: {
          ABF_AGENT_API_PORT: String(apiPort),
          ABF_PARENT_SESSION_ID: sessionId,
        },
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      appLog('warn', `Failed to set up agent-control MCP: ${errMsg}`, 'process')
      return null
    }
  }

  /**
   * Cancel the active turn without destroying the session adapter.
   * Used by parent→child send_to_agent only when interrupt=true (opt-in).
   * Does NOT unregister concurrency, destroy adapter, or clean supervisor prompts.
   */
  /** If session is a persistent child, push tracker status=running to the parent UI. */
  private markPersistentChildRunningIfNeeded(sessionId: string): void {
    const session = this.sessionService.getById(sessionId)
    const parentId = session?.parentSessionId
    if (!parentId) return
    if (!this.agentLifecycle.isPersistentChild(parentId, sessionId)) return
    this.agentLifecycle.setAgentIdleFlag(sessionId, false)
    this.agentLifecycle.updatePersistentAgentStatus(parentId, sessionId, 'running')
  }

  async interruptCurrentTurn(sessionId: string): Promise<void> {
    const state = this.sessionStates.get(sessionId)
    if (!state?.streaming && !this.bridgeManager.isSessionActive(sessionId)) {
      // Nothing to cancel; still clear any queued post-turn messages.
      const idleScheduler = this.schedulers.get(sessionId)
      if (idleScheduler) idleScheduler.clear()
      return
    }
    if (!state?.streaming) {
      // Adapter may be active but not streaming — clear queue only.
      const idleScheduler = this.schedulers.get(sessionId)
      if (idleScheduler) idleScheduler.clear()
      return
    }

    appLog('info', `Interrupting current turn for session ${sessionId}`, 'process')
    state.streaming = false
    // Mark before stopSession so a synchronous/async `done` from cancel does not
    // finalize persistent agent → idle while parent is about to resend.
    state.doneIsFromInterrupt = true
    const scheduler = this.schedulers.get(sessionId)
    if (scheduler) scheduler.clear()
    this.cancelPendingPermissions(sessionId)
    // Cancel active turn only — keep adapter + concurrency slot alive
    await this.bridgeManager.stopSession(sessionId).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err)
      appLog('warn', `interruptCurrentTurn stopSession failed for ${sessionId}: ${errMsg}`, 'process')
    })
    // Force session idle so the next sendMessage does not queue_after_turn.
    // Tracker agent status is re-set to running by sendToChild after this returns.
    state.streaming = false
    this.sessionService.updateStatus(sessionId, 'idle')
    this.emitChatUpdate(sessionId)
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

  private emitAgentStream(sessionId: string, event: BridgeEvent): void {
    const streamEvent = this.agentStreamNormalizer.normalize(sessionId, event)
    if (!streamEvent) return
    const window = this.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('agent:stream', streamEvent)
    }
  }

  private permissionKey(sessionId: string, requestId: string): string {
    return `${sessionId}:${requestId}`
  }

  private cancelPendingPermissions(sessionId: string): void {
    for (const [key, pending] of this.pendingPermissions) {
      if (!key.startsWith(`${sessionId}:`)) continue
      this.pendingPermissions.delete(key)
      if (pending.signal && pending.abortListener) {
        pending.signal.removeEventListener('abort', pending.abortListener)
      }
      pending.resolve({ outcome: 'cancelled' })
    }
  }

  private awaitPermissionResponse(
    sessionId: string,
    requestId: string,
    optionIds: string[],
    signal: AbortSignal,
  ): Promise<RequestPermissionOutcome> {
    return new Promise((resolve) => {
      const key = this.permissionKey(sessionId, requestId)
      const previous = this.pendingPermissions.get(key)
      if (previous) {
        previous.resolve({ outcome: 'cancelled' })
        if (previous.signal && previous.abortListener) {
          previous.signal.removeEventListener('abort', previous.abortListener)
        }
      }

      const abortListener = () => {
        const current = this.pendingPermissions.get(key)
        if (!current) return
        this.pendingPermissions.delete(key)
        current.resolve({ outcome: 'cancelled' })
      }

      this.pendingPermissions.set(key, {
        resolve,
        requestId,
        optionIds: new Set(optionIds),
        signal,
        abortListener,
      })

      if (signal.aborted) {
        abortListener()
        return
      }
      signal.addEventListener('abort', abortListener, { once: true })
    })
  }

  /**
   * Resolve a pending ACP/UI permission prompt from the renderer.
   * Channel: agent:permission:respond
   */
  respondToPermission(
    payload: AgentPermissionResponse,
  ): { accepted: true } | { accepted: false; error: string } {
    const sessionId = payload?.sessionId
    const requestId = payload?.requestId
    const optionId = payload?.optionId
    if (!sessionId || !requestId || !optionId) {
      return { accepted: false, error: 'sessionId, requestId, and optionId are required' }
    }

    const key = this.permissionKey(sessionId, requestId)
    const pending = this.pendingPermissions.get(key)
    if (!pending) {
      return { accepted: false, error: 'No pending permission request for this session' }
    }
    if (!pending.optionIds.has(optionId)) {
      return { accepted: false, error: `Unknown permission option '${optionId}'` }
    }

    this.pendingPermissions.delete(key)
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener)
    }
    pending.resolve({ outcome: 'selected', optionId })
    return { accepted: true }
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

  private buildRuntimeCapabilitiesPrompt(providerId: string, adapterType = ''): string {
    const sections: string[] = []
    const enabledSkills = this.skillService.getEnabledSkillSummaries()
    const enabledMcps = this.mcpService.getEnabledServerSummaries()

    if (enabledSkills.length > 0) {
      sections.push([
        '## Local skills',
        'The app has loaded local skills from the skills/ directory.',
        'When the user types a command starting with /, the host expands the matching skill prompt before send.',
        'Currently enabled skills:',
        ...enabledSkills.map(skill => `- /${skill.slashCommand || skill.name}: ${skill.description || skill.name}`),
      ].join('\n'))
    }

    if (enabledMcps.length > 0) {
      const supportsNativeMcp = ProviderCapabilityRegistry.supportsNativeMcp(providerId)
        || this.isAcpAdapter(adapterType)
      sections.push([
        '## MCP services',
        supportsNativeMcp
          ? 'This session has the following enabled MCP services injected. Call them when useful; do not assume unlisted MCPs are available.'
          : 'The app has these MCP services installed, but the current Provider does not support native MCP calls. Treat this as background only — do not treat them as directly callable tools.',
        ...enabledMcps.map(server => `- ${server.serverIdentifier}: ${server.description || server.name}`),
      ].join('\n'))
    }

    return sections.join('\n\n').trim()
  }

  private expandSkillCommand(message: string): string {
    const match = this.skillService.matchCommand(message)
    if (!match?.matched || !match.skill) {
      return message
    }

    const result = this.skillService.execute(match.skill.id, match.remainingInput || '')
    if (!result?.success) {
      throw new Error(result?.error || `Failed to execute skill: ${match.skill.name}`)
    }

    return typeof result.prompt === 'string' && result.prompt.trim()
      ? result.prompt
      : message
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
        // Adapter still live — still re-ensure AGENTS.md / worker files if missing.
        this.ensureSoftwarePromptFiles(sessionId)
        appLog('debug', `initSession skipped (already active, prompts ensured): ${sessionId}`, 'process')
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
    if (!this.providerService.isRunnable(provider)) {
      throw new Error(`Provider is not runnable: ${provider.name}. Check that the CLI is installed or disable this provider.`)
    }

    const isAcp = this.isAcpAdapter(provider.adapterType)
    const streamSource: AgentStreamSource = isAcp
      ? { kind: 'native-acp-v1', provider: provider.id }
      : { kind: 'legacy-adapter', provider: provider.id }
    this.agentStreamNormalizer.configureSession(sessionId, streamSource)

    // Initialize bridge adapter for this session
    const config: Record<string, unknown> = {
      workDir: effectiveWorkDir,
      command: provider.command || undefined,
      defaultArgs: provider.defaultArgs || undefined,
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

    // Wire UI permission prompts for interactive ACP sessions (auto-accept bypasses this).
    if (isAcp && !session.autoAccept) {
      config.permissionHandler = (
        request: { options?: Array<{ optionId: string }> },
        signal: AbortSignal,
        requestId: string,
      ) => this.awaitPermissionResponse(
        sessionId,
        requestId,
        (request.options || []).map((option) => option.optionId).filter(Boolean),
        signal,
      )
    }

    // Three-generation role (MCP + prompts share this classification):
    // - Top-level (爷爷): enabled user MCPs + agent-control
    // - Direct child (父亲): same user MCPs + agent-control + worker prompt
    // - Nested child (儿子): same user MCPs, never agent-control / worker software prompt
    const parentId = (session.parentSessionId || '').trim()
    const isChild = Boolean(parentId)
    let parentSession: ReturnType<SessionService['getById']> | undefined
    if (isChild) {
      parentSession = this.sessionService.getById(parentId)
    }
    const sessionRole = resolveAbfSessionRole(session.parentSessionId, parentSession?.parentSessionId)
    const isDirectChild = sessionRole === 'direct-child'
    const supportsMcpInjection =
      ProviderCapabilityRegistry.supportsNativeMcp(provider.id) || this.isAcpAdapter(provider.adapterType)

    // Global enabled MCPs (settings) → every session init; not bound to grandpa only.
    const enabledUserMcps = this.mcpService.getEnabledServerConfigs() as Record<string, McpServerConfig>
    const mempalaceEnabled = enabledMcpsIncludeMempalace(enabledUserMcps)
    if (supportsMcpInjection) {
      let agentControl: McpServerConfig | null = null
      if (shouldInjectAgentControl(sessionRole)) {
        agentControl = await this.buildAgentControlMcpConfig(sessionId, provider, isAcp)
      }
      const mcpServers = resolveSessionMcpServers({
        role: sessionRole,
        enabledUserMcps,
        agentControl,
      })
      if (Object.keys(mcpServers).length > 0) {
        config.mcpServers = mcpServers
      }
      // Diagnostic: each session spawns its own MCP stdio process; mempalace
      // concurrent writes rely on safe-proxy wrap + shared abf_write.lock.
      if (mempalaceEnabled) {
        for (const [mcpKey, mcpCfg] of Object.entries(mcpServers)) {
          if (!isMempalaceServer(mcpKey, mcpCfg.command, mcpCfg.args || [])) continue
          const wrapped = isMempalaceSafeWrapped(mcpCfg.command, mcpCfg.args || [])
          appLog(
            wrapped ? 'info' : 'warn',
            wrapped
              ? `Session ${sessionId}: mempalace MCP "${mcpKey}" behind safe proxy (per-session process; shared write lock)`
              : `Session ${sessionId}: mempalace MCP "${mcpKey}" NOT behind safe proxy — multi-agent peer lock / 未写入 likely`,
            'process',
          )
        }
      }
      if (sessionRole === 'nested-child') {
        appLog(
          'info',
          `Nested child ${sessionId}: user MCPs injected, skipped ${AGENT_CONTROL_MCP_ID}`,
          'process',
        )
      }
    }

    const runtimeCapabilitiesPrompt = this.buildRuntimeCapabilitiesPrompt(provider.id, provider.adapterType)
    if (runtimeCapabilitiesPrompt) {
      const existingPrompt = (String(config.appendSystemPrompt || '')).trim()
      config.appendSystemPrompt = existingPrompt
        ? `${existingPrompt}\n\n${runtimeCapabilitiesPrompt}`
        : runtimeCapabilitiesPrompt
    }

    // Resume only when the provider speaks ACP and the stored conversation id
    // was produced by an ACP session. Migration clears legacy ids; refuse
    // re-attaching opaque non-ACP ids that would fail session/load silently.
    if (session.conversationId) {
      if (isAcp) {
        config.resumeSessionId = session.conversationId
      } else {
        appLog(
          'warn',
          `Skipping conversation resume for ${sessionId}: provider adapter '${provider.adapterType}' is not ACP`,
          'process',
        )
      }
    }
    if (provider.resumeFlag) {
      config.resumeFlag = provider.resumeFlag
    }

    // Wire host CLIs for built-in ACP agents.
    // Production packages never embed platform natives; resolve host binaries like Grok.
    // Grok is spawned directly — pin executablePath to an absolute path so GUI-launched
    // Electron (stripped PATH) never hits spawn ENOENT for bare `grok`.
    if (isAcp) {
      const bareCommand = String(provider.command || '').trim().toLowerCase()
      const isGrok =
        provider.id === 'grok-build'
        || bareCommand === 'grok'
        || bareCommand.endsWith('/grok')
        || bareCommand.endsWith('\\grok')

      if (isGrok) {
        const grokPath = resolveGrokCliPath(provider.executablePath)
        if (!grokPath) {
          throw missingHostCliError('grok', `Provider: ${provider.name}.`)
        }
        config.executablePath = grokPath
        appLog('info', `Resolved Grok CLI: ${grokPath}`, 'process')
      }

      if (provider.id === 'codex' || provider.id === 'claude-code') {
        const envOverrides = {
          ...((config.envOverrides as Record<string, string> | undefined) || {}),
        }
        if (provider.id === 'codex') {
          if (!envOverrides.CODEX_PATH) {
            const codexPath = resolveCodexCliPath(provider.executablePath)
            if (codexPath) envOverrides.CODEX_PATH = codexPath
          }
          if (!envOverrides.CODEX_PATH && !hasOptionalCodexNativePackage()) {
            throw missingHostCliError('codex', `Provider: ${provider.name}.`)
          }
        }
        if (provider.id === 'claude-code') {
          if (!envOverrides.CLAUDE_CODE_EXECUTABLE) {
            const claudePath = resolveClaudeCodeExecutable(provider.executablePath)
            if (claudePath) envOverrides.CLAUDE_CODE_EXECUTABLE = claudePath
          }
          if (!envOverrides.CLAUDE_CODE_EXECUTABLE && !hasOptionalClaudeNativePackage()) {
            throw missingHostCliError('claude', `Provider: ${provider.name}.`)
          }
        }
        if (Object.keys(envOverrides).length > 0) {
          config.envOverrides = envOverrides
        }
      }
    }

    // Inject ABF software prompts by role (MCP already resolved above).
    if (isDirectChild) {
      // Father: worker software prompt (agent-control already in mcpServers when allowed)
      try {
        const workerRules = buildWorkerRulesContent()
        const existingPrompt = (String(config.appendSystemPrompt || '')).trim()
        config.appendSystemPrompt = existingPrompt
          ? `${workerRules}\n\n${existingPrompt}`
          : workerRules
        appLog('info', `Injected worker role prompt for direct child session ${sessionId}`, 'process')
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        appLog('warn', `Failed to inject worker rules for child session: ${errMsg}`, 'process')
      }

      // Isolated worktree: write worker software-prompt files for CLI/Claude discovery.
      // Shared cwd with parent: only appendSystemPrompt (do not clobber supervisor files).
      try {
        const workDir = String(config.workDir || '')
        const parentWorkDir = parentSession
          ? (parentSession.worktreePath || parentSession.workingDirectory || '')
          : ''
        const sameCwd = workDir
          && parentWorkDir
          && path.resolve(workDir) === path.resolve(parentWorkDir)
        if (workDir && !sameCwd) {
          injectWorkerPromptFiles(workDir, provider.id)
          this.supervisorPromptSessions.set(sessionId, workDir)
          appLog(
            'info',
            `Injected worker prompt files for direct child ${sessionId} in ${workDir}`,
            'process',
          )
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        appLog('warn', `Failed to inject worker prompt files for child: ${errMsg}`, 'process')
      }
    } else if (isChild) {
      // Son: strip inherited ABF software prompts from isolated worktree only.
      // git worktree add checks out committed AGENTS.md (Supervisor/Worker blocks);
      // inject skips nested-child, so we must strip here. Never strip when sharing
      // parent cwd — that would wipe the father's live AGENTS.md.
      try {
        const workDir = String(config.workDir || '')
        const parentWorkDir = parentSession
          ? (parentSession.worktreePath || parentSession.workingDirectory || '')
          : ''
        const sameCwd = workDir
          && parentWorkDir
          && path.resolve(workDir) === path.resolve(parentWorkDir)
        if (workDir && !sameCwd) {
          stripInheritedSoftwarePromptFiles(workDir)
          appLog(
            'info',
            `Stripped inherited software prompt files for nested child ${sessionId} in ${workDir}`,
            'process',
          )
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        appLog('warn', `Failed to strip inherited software prompts for nested child: ${errMsg}`, 'process')
      }

      // Son: skip full worker software prompt + agent-control; still inject short Memory when mempalace is on.
      if (mempalaceEnabled) {
        try {
          const memoryPrompt = NESTED_CHILD_MEMPALACE_MEMORY_PROMPT.trim()
          const existingPrompt = (String(config.appendSystemPrompt || '')).trim()
          config.appendSystemPrompt = existingPrompt
            ? `${memoryPrompt}\n\n${existingPrompt}`
            : memoryPrompt
          appLog(
            'info',
            `Injected short mempalace Memory prompt for nested child ${sessionId}`,
            'process',
          )
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err)
          appLog('warn', `Failed to inject nested-child Memory prompt: ${errMsg}`, 'process')
        }
      }
      appLog(
        'info',
        `Skipped worker prompt + agent-control for nested child session ${sessionId}`,
        'process',
      )
    } else {
      try {
        const providerNames = this.providerService.getRunnable().map(p => p.name)
        const workDir = config.workDir as string
        const isClaudeProvider = provider.id === 'claude-code'
        const isHttpApiProvider = provider.adapterType === 'openai-api' || !isAcp

        if (isClaudeProvider) {
          try {
            injectSupervisorPrompt(workDir, providerNames)
            this.supervisorPromptSessions.set(sessionId, workDir)
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err)
            appLog('warn', `Failed to inject Claude rules files: ${errMsg}`, 'process')
          }
        } else if (isHttpApiProvider) {
          // Pure HTTP chat APIs do not auto-load AGENTS.md / GEMINI.md.
          try {
            const rulesContent = buildAllRulesContent(providerNames, true)
            const existingPrompt = (String(config.appendSystemPrompt || '')).trim()
            config.appendSystemPrompt = existingPrompt
              ? `${existingPrompt}\n\n${rulesContent}`
              : rulesContent
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err)
            appLog('warn', `Failed to append ABF rules to system prompt: ${errMsg}`, 'process')
          }
        } else {
          // File-only path for CLI agents (Codex / Gemini / OpenCode / Grok / …).
          // Always inject into the agent runtime cwd (config.workDir / session worktree).
          // Do NOT prefer worktreeSourceRepo — isolated sessions run in the worktree, so
          // rules must live there or the agent never discovers them.
          try {
            injectProviderRules(workDir, provider.id, providerNames)
            this.supervisorPromptSessions.set(sessionId, workDir)
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err)
            appLog('warn', `Failed to inject provider rule files: ${errMsg}`, 'process')
          }
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
      sourceItemId?: string
      childSessionId?: string
      childAgentName?: string
    } = {},
  ): ChatMessage {
    const presentation = options.presentation || 'message'
    const lastMsg = messages[messages.length - 1]
    const canMergeBySourceItem = lastMsg?.sourceItemId
      ? lastMsg.sourceItemId === options.sourceItemId
      : !options.sourceItemId

    // Only merge into an *open* streaming assistant bubble.
    // After a turn `done` finalizes messages (partial=false), later multi-turn
    // deltas must open a new box instead of reopening the previous reply.
    if (
      lastMsg?.role === 'assistant'
      && lastMsg.partial === true
      && !lastMsg.toolName
      && !lastMsg.toolUse
      && lastMsg.childSessionId === options.childSessionId
      && (lastMsg.presentation || 'message') === presentation
      && canMergeBySourceItem
    ) {
      lastMsg.content += text
      if (!lastMsg.presentation) {
        lastMsg.presentation = presentation
      }
      if (!lastMsg.sourceItemId && options.sourceItemId) {
        lastMsg.sourceItemId = options.sourceItemId
      }
      lastMsg.partial = true
      return lastMsg
    }

    const msg: ChatMessage = {
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
      presentation,
      sourceItemId: options.sourceItemId,
      partial: true,
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
        sourceItemId: msg.sourceItemId,
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
          sourceItemId: event.itemId,
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
            sourceItemId: event.itemId,
          })
        }
        break
      }

      case 'done': {
        // The 'done' event means the current turn is complete — always clear streaming.
        // Interrupt-then-resend: stopSession may emit done for the cancelled turn; that
        // must not mark the persistent child tracker idle (or inject a false "turn done").
        const fromInterrupt = !!state.doneIsFromInterrupt
        state.doneIsFromInterrupt = false
        state.streaming = false

        // Check if the adapter stream is still alive for notification/idle decisions.
        const adapterStillAlive = event.turnActive === false
          ? false
          : this.bridgeManager.isSessionActive(sessionId)

        // Send notification only when the stream truly ends (adapter no longer alive)
        if (!adapterStillAlive) {
          try {
            const doneSession = this.sessionService.getById(sessionId)
            if (!doneSession?.parentSessionId && this.notificationManager) {
              const sessionName = doneSession?.name || sessionId
              const lastAssistantMsg = findLastMessage(
                state.messages,
                m => m.role === 'assistant' && Boolean(m.content) && !m.toolName && !m.toolUse,
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

        // Finalize assistant + tool messages emitted during this turn without
        // overwriting segmented commentary / final-answer boundaries.
        let lastAssistantMsg: ChatMessage | undefined
        for (let index = state.messages.length - 1; index >= 0; index -= 1) {
          const candidate = state.messages[index]
          if (candidate.role === 'user') break
          if (candidate.role === 'tool_use' && candidate.partial) {
            candidate.partial = false
            // Keep toolStatus in sync so UI open-ops / "已发起" summaries settle with the turn.
            if (candidate.toolStatus !== 'failed') {
              candidate.toolStatus = 'completed'
            }
            continue
          }
          if (candidate.role !== 'assistant') continue
          candidate.partial = false
          if (!lastAssistantMsg) lastAssistantMsg = candidate
        }
        if (!lastAssistantMsg && event.text) {
          state.messages.push({
            role: 'assistant',
            content: event.text,
            timestamp: new Date().toISOString(),
            partial: false,
          })
          lastAssistantMsg = state.messages[state.messages.length - 1]
        }
        // Store usage/cache data on the last assistant message
        if (event.usage && lastAssistantMsg?.role === 'assistant') {
          lastAssistantMsg.usage = {
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
          if (fromInterrupt) {
            // Cancelled turn: do not inject/idle-finalize — a resend will mark running.
            appLog(
              'info',
              `Skipping persistent-child idle finalize after interrupt for ${sessionId}`,
              'process',
            )
          } else if (this.agentLifecycle.isPersistentChild(doneSessionForChild.parentSessionId, sessionId)) {
            // Persistent child: resolve waiter, inject turn result, set idle, keep alive
            const lastAssistant = findLastMessage(state.messages, m => m.role === 'assistant')
            const resultText = lastAssistant?.content || '(no output)'
            this.agentLifecycle.resolveChildTurnWaiter(sessionId, resultText)
            this.agentLifecycle.injectChildResult(doneSessionForChild.parentSessionId, sessionId)
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
        // Mark sub-agents as failed when parent errors (including persistent).
        // finalizeChildAgents also resolves child turn/idle waiters.
        this.agentLifecycle.finalizeChildAgents(sessionId, 'failed', false)

        // Persistent child that itself errored: unblock wait=true / wait_agent_idle
        // (mirror done path, but status=failed — agent stays tracked until close).
        const errSessionForChild = this.sessionService.getById(sessionId)
        if (
          errSessionForChild?.parentSessionId
          && this.agentLifecycle.isPersistentChild(errSessionForChild.parentSessionId, sessionId)
        ) {
          const lastAssistant = findLastMessage(state.messages, m => m.role === 'assistant')
          const resultText =
            state.error
              ? `(error: ${state.error})`
              : (lastAssistant?.content || '(error)')
          this.agentLifecycle.resolveChildTurnWaiter(sessionId, resultText)
          this.agentLifecycle.updatePersistentAgentStatus(
            errSessionForChild.parentSessionId,
            sessionId,
            'failed',
          )
          this.agentLifecycle.setAgentIdleFlag(sessionId, true)
          this.agentLifecycle.resolveAgentIdleWaiters(sessionId)
        }

        // Keep software-prompt files on error — session may be re-initialized.
        // Files are cleaned only on disposeSession (delete/end) or workDir reinit.

        // Send error notification for top-level sessions
        try {
          if (this.notificationManager) {
            const errSession = errSessionForChild || this.sessionService.getById(sessionId)
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
        if (event.isUpdate && event.toolCallId) {
          const existingTool = findLastMessage(
            state.messages,
            message => message.role === 'tool_use' && message.toolCallId === event.toolCallId,
          )
          if (existingTool) {
            existingTool.toolStatus = event.toolStatus
            existingTool.toolOutput = event.output
            if (event.name) existingTool.toolName = event.name
            if (event.input) existingTool.toolInput = event.input
            // Keep partial in sync so silence fail-open snapshots do not look settled.
            const terminal = event.toolStatus === 'completed' || event.toolStatus === 'failed'
            existingTool.partial = !terminal
            this.emitChatUpdate(sessionId)

            // Mirror tool status/output increments to the active child session.
            // New tools already call mirrorToChildSession; updates must too or
            // the child UI freezes on "running" without output.
            if (childInfoTool) {
              const childState = this.getOrCreateState(childInfoTool.id)
              const childTool = findLastMessage(
                childState.messages,
                message => message.role === 'tool_use' && message.toolCallId === event.toolCallId,
              )
              if (childTool) {
                childTool.toolStatus = event.toolStatus
                childTool.toolOutput = event.output
                if (event.name) childTool.toolName = event.name
                if (event.input) childTool.toolInput = event.input
                childTool.partial = !terminal
                this.emitChatUpdate(childInfoTool.id)
              }
            }
            break
          }
        }

        // Seal open assistant bubbles before the tool boundary so post-tool
        // text opens a new reply box instead of growing the previous one.
        for (let index = state.messages.length - 1; index >= 0; index -= 1) {
          const candidate = state.messages[index]
          if (candidate.role === 'user') break
          if (candidate.role === 'assistant' && candidate.partial) {
            candidate.partial = false
          }
        }

        // Create a separate tool_use message for each tool invocation
        const toolTerminal = event.toolStatus === 'completed' || event.toolStatus === 'failed'
        const toolMsg: ChatMessage = {
          role: 'tool_use',
          content: '',
          timestamp: new Date().toISOString(),
          toolName: event.name || 'unknown',
          toolInput: event.input || {},
          toolCallId: event.toolCallId,
          toolStatus: event.toolStatus,
          toolOutput: event.output,
          // Live flag for renderer groupIsLive / tool summary when stream is silent.
          partial: !toolTerminal,
        }
        if (childInfoTool) {
          toolMsg.childSessionId = childInfoTool.id
          toolMsg.childAgentName = childInfoTool.name
        }
        state.messages.push(toolMsg)

        // Also maintain toolUse array on last assistant message for StreamingIndicator compat
        const prevMsg = findLastMessage(state.messages, m => m.role === 'assistant')
        if (prevMsg) {
          if (!prevMsg.toolUse) prevMsg.toolUse = []
          prevMsg.toolUse.push({
            name: event.name || 'unknown',
            input: event.input || {},
            toolCallId: event.toolCallId,
            status: event.toolStatus,
            output: event.output,
          })
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

      case 'plan':
      case 'permission':
      case 'status':
        // Normalized agent:stream carries these; legacy chat state is unchanged.
        break
    }

    // Always emit the provider-neutral stream contract when mappable.
    this.emitAgentStream(sessionId, event)
  }

  /**
   * @param opts.interrupt When true: cancel the current turn first, then send
   *   immediately (no queue_after_turn). Default false: idle → send now;
   *   streaming → MessageScheduler queue_after_turn. Used by send_to_agent only
   *   when callers pass interrupt=true (emergency correction).
   */
  async sendMessage(
    sessionId: string,
    message: string,
    opts?: { interrupt?: boolean },
  ): Promise<void> {
    const state = this.getOrCreateState(sessionId)
    const scheduler = this.getOrCreateScheduler(sessionId)

    // Optional interrupt-then-send (explicit only)
    if (opts?.interrupt) {
      await this.interruptCurrentTurn(sessionId)
    }

    // Use scheduler to decide dispatch strategy (idle after interrupt → immediate)
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
    // Any prior interrupt's done flag is obsolete once a new turn starts.
    state.doneIsFromInterrupt = false

    // Add user message
    state.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    })

    this.sessionService.updateStatus(sessionId, 'running')
    // Dual insurance: persistent child tracker must show running when a turn starts
    // (covers resend after interrupt and any path that only updated session status).
    this.markPersistentChildRunningIfNeeded(sessionId)
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
      } else {
        this.ensureSoftwarePromptFiles(sessionId)
      }
      const outboundMessage = this.expandSkillCommand(message)
      appLog('info', `Sending message to AI (${message.length} chars)`, 'process')
      await this.bridgeManager.sendMessage(sessionId, outboundMessage)
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
      } else {
        this.ensureSoftwarePromptFiles(sessionId)
      }
      const outboundMessage = this.expandSkillCommand(message)
      await this.bridgeManager.sendMessage(sessionId, outboundMessage, images)
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

  /**
   * Cancel the current turn / stop streaming. Does NOT remove software-prompt
   * files (AGENTS.md / .claude/rules) — those must remain while the session
   * may continue. Use disposeSession for true teardown.
   */
  async stopProcess(sessionId: string): Promise<void> {
    const state = this.sessionStates.get(sessionId)
    if (state) {
      state.streaming = false
    }
    this.initializedSessionWorkDirs.delete(sessionId)
    // Clear pending messages for this session
    const scheduler = this.schedulers.get(sessionId)
    if (scheduler) scheduler.clear()
    // Cancel any waiting UI permission prompts before/while the adapter cancels.
    this.cancelPendingPermissions(sessionId)
    await this.bridgeManager.stopSession(sessionId)
    this.concurrencyGuard.unregisterSession(sessionId)
    this.sessionService.updateStatus(sessionId, 'idle')
    this.emitChatUpdate(sessionId)
    // Clean up parser state
    this.outputParser.clearSession(sessionId)
    this.stateInference.removeSession(sessionId)
    // Keep stream sequence counters for the session lifetime so the renderer
    // continues to accept later turns (sequences must stay strictly increasing).
    // Do NOT cascade-cancel sub-agents on ordinary stop / user interrupt.
    // Children keep running; parent can list_agents / send_to_agent after idle.
    // True teardown (disposeSession / session delete) still finalizes children.
    // Do not remove software-prompt files here — stop only cancels the turn;
    // adapter/session may be reused and CLI agents re-read AGENTS.md from disk.
  }

  /**
   * True session teardown: destroy adapter and remove software-prompt files
   * when no other session still tracks the same workDir. Call on session
   * delete / end (not on ordinary stop / turn complete).
   *
   * Also: clean managed ABF child worktrees, drop session-keyed maps, and
   * resolve lifecycle waiters so dispose never leaks hangers.
   * stopProcess must NOT call this full teardown (session may be reused).
   */
  async disposeSession(sessionId: string): Promise<void> {
    const state = this.sessionStates.get(sessionId)
    if (state) {
      state.streaming = false
    }
    this.initializedSessionWorkDirs.delete(sessionId)
    const scheduler = this.schedulers.get(sessionId)
    if (scheduler) scheduler.clear()
    this.schedulers.delete(sessionId)
    this.clearPendingChatPatch(sessionId)
    this.cancelPendingPermissions(sessionId)
    await this.bridgeManager.destroySession(sessionId).catch(() => {})
    this.concurrencyGuard.unregisterSession(sessionId)
    this.outputParser.clearSession(sessionId)
    this.stateInference.removeSession(sessionId)
    // Stream sequence counters only cleared on true dispose (not stop)
    this.agentStreamNormalizer.clearSession(sessionId)
    this.agentLifecycle.finalizeChildAgents(sessionId, 'cancelled', false)
    // Managed child worktree (same gates as closeChildSession)
    await this.agentLifecycle.cleanupDisposedSessionWorktree(sessionId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      appLog('warn', `Disposed-session worktree cleanup failed for ${sessionId}: ${msg}`, 'process')
    })
    this.agentLifecycle.cleanupDisposedSessionMaps(sessionId)
    this.sessionStates.delete(sessionId)
    this.cleanupSupervisorPromptForSession(sessionId)
    appLog('info', `Disposed session resources (prompts cleaned): ${sessionId}`, 'process')
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
    opts?: { interrupt?: boolean },
  ): Promise<void> {
    return this.agentLifecycle.sendToChild(parentSessionId, childSessionId, message, opts)
  }

  async sendToChildAndWait(
    parentSessionId: string,
    childSessionId: string,
    message: string,
    timeoutMs = 300_000,
    opts?: { interrupt?: boolean },
  ): Promise<string> {
    return this.agentLifecycle.sendToChildAndWait(
      parentSessionId,
      childSessionId,
      message,
      timeoutMs,
      opts,
    )
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

  // ─── Software prompt ensure / cleanup ──────────────────────────

  /**
   * Idempotent: if software-prompt files for this session role are missing
   * under the effective workDir, re-inject them. Safe to call on every send
   * / active initSession skip so CLI agents always see AGENTS.md.
   */
  private ensureSoftwarePromptFiles(sessionId: string): void {
    const session = this.sessionService.getById(sessionId)
    if (!session) return
    const provider = this.providerService.getById(session.providerId)
    if (!provider) return
    const workDir = this.resolveEffectiveWorkDir(session)
    if (!workDir) return

    try {
      if (session.parentSessionId) {
        const parentSession = this.sessionService.getById(session.parentSessionId)
        const isDirectChild = !!parentSession && !parentSession.parentSessionId
        if (!isDirectChild || !parentSession) return
        const parentWorkDir = parentSession.worktreePath || parentSession.workingDirectory || ''
        const sameCwd = !!parentWorkDir
          && path.resolve(workDir) === path.resolve(parentWorkDir)
        if (sameCwd) return
        if (!hasWorkerPromptFiles(workDir, provider.id)) {
          injectWorkerPromptFiles(workDir, provider.id)
          this.supervisorPromptSessions.set(sessionId, workDir)
          appLog('info', `Re-ensured worker prompt files for child ${sessionId} in ${workDir}`, 'process')
        }
        return
      }

      const isClaudeProvider = provider.id === 'claude-code'
      const isAcp = this.isAcpAdapter(provider.adapterType)
      const isHttpApiProvider = provider.adapterType === 'openai-api' || !isAcp
      // HTTP chat APIs use appendSystemPrompt only — nothing on disk to ensure.
      if (isHttpApiProvider && !isClaudeProvider) return

      if (hasSupervisorPromptFiles(workDir, provider.id)) {
        if (!this.supervisorPromptSessions.has(sessionId)) {
          this.supervisorPromptSessions.set(sessionId, workDir)
        }
        return
      }

      const providerNames = this.providerService.getRunnable().map(p => p.name)
      if (isClaudeProvider) {
        injectSupervisorPrompt(workDir, providerNames)
      } else {
        injectProviderRules(workDir, provider.id, providerNames)
      }
      this.supervisorPromptSessions.set(sessionId, workDir)
      appLog('info', `Re-ensured supervisor prompt files for ${sessionId} in ${workDir}`, 'process')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      appLog('warn', `Failed to ensure software prompt files for ${sessionId}: ${errMsg}`, 'process')
    }
  }

  /**
   * Clean up software-prompt rule files for a session.
   * Only for true teardown (disposeSession / workDir change), never ordinary stop.
   * Parent and child may share the same workDir — only remove files when no
   * other live session still tracks that directory (ref-count by workDir).
   */
  private cleanupSupervisorPromptForSession(sessionId: string): void {
    const workDir = this.supervisorPromptSessions.get(sessionId)
    if (!workDir) return
    this.supervisorPromptSessions.delete(sessionId)
    const stillInUse = [...this.supervisorPromptSessions.values()].some(
      tracked => tracked === workDir,
    )
    if (!stillInUse) {
      cleanupSupervisorPrompt(workDir)
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

  private isAcpAdapter(adapterType: string): boolean {
    const t = (adapterType || '').toLowerCase()
    return t === 'acp' || t === 'acp-stdio'
  }

  /**
   * Clean up parser and state inference resources.
   * Should be called on app quit / before-quit.
   */
  cleanup(): void {
    this.stateInference.stop()
    this.outputParser.stopWatching()
    this.outputParser.cleanupUsage()
    for (const [key, pending] of this.pendingPermissions) {
      this.pendingPermissions.delete(key)
      if (pending.signal && pending.abortListener) {
        pending.signal.removeEventListener('abort', pending.abortListener)
      }
      pending.resolve({ outcome: 'cancelled' })
    }
  }
}

/**
 * AgentLifecycleManager - manages child/sub-agent sessions lifecycle.
 * Extracted from ProcessService.
 */

import type { SessionService } from './session.js'
import type { BridgeManager } from '../bridge/bridge.js'
import type { ConcurrencyGuard } from './concurrency-guard.js'
import { AgentTracker, type TrackedAgent } from './agent-tracker.js'
import { appLog } from './log.js'
import type { ChatMessage, SessionState, BridgeEvent, AgentInfo } from './process-types.js'
import type { BrowserWindow } from 'electron'

/**
 * Callbacks into the parent ProcessService that AgentLifecycleManager needs.
 */
export interface ProcessServiceCallbacks {
  getOrCreateState(sessionId: string): SessionState
  emitChatUpdate(sessionId: string): void
  persistMessages(sessionId: string): void
  initSession(sessionId: string): Promise<void>
  sendMessage(sessionId: string, message: string): Promise<void>
}

export class AgentLifecycleManager {
  /** One AgentTracker per parent session that has spawned sub-agents */
  private agentTrackers = new Map<string, AgentTracker>()
  /** Stack of active sub-agent child session IDs per parent session */
  private activeChildStack = new Map<string, string[]>()
  /** Reverse lookup: childSessionId → agent display name */
  private childSessionNames = new Map<string, string>()
  /** Waiters for persistent child turns: childSessionId → resolve(result) */
  private childTurnWaiters = new Map<string, (result: string) => void>()
  /** Idle flags for persistent agents: childSessionId → true when turn completed but agent still alive */
  private agentIdleFlags = new Map<string, boolean>()
  /** Waiters for idle detection: childSessionId → resolve callbacks */
  private agentIdleWaiters = new Map<string, Array<{ resolve: (info: { idle: boolean; output: string }) => void; timer?: ReturnType<typeof setTimeout> }>>()

  constructor(
    private sessionService: SessionService,
    private bridgeManager: BridgeManager,
    private concurrencyGuard: ConcurrencyGuard,
    private getWindow: () => BrowserWindow | null,
    private callbacks: ProcessServiceCallbacks,
    private sessionStates: Map<string, SessionState>,
  ) {}

  // ─── Active child stack helpers ────────────────────────────────

  /**
   * Get the active child session ID for a parent session (top of stack).
   */
  getActiveChild(parentSessionId: string): string | undefined {
    const stack = this.activeChildStack.get(parentSessionId)
    return stack && stack.length > 0 ? stack[stack.length - 1] : undefined
  }

  /** Get active child info (id + name) for tagging parent messages */
  getActiveChildInfo(parentSessionId: string): { id: string; name: string } | undefined {
    const id = this.getActiveChild(parentSessionId)
    if (!id) return undefined
    return { id, name: this.childSessionNames.get(id) || '' }
  }

  // ─── Persistent Sub-Agent API ─────────────────────────────────

  /**
   * Spawn a persistent child session with its own live adapter.
   */
  async spawnChildSession(
    parentSessionId: string,
    options: { name: string; prompt: string; providerId?: string },
  ): Promise<{ childSessionId: string }> {
    const parent = this.sessionService.getById(parentSessionId)
    if (!parent) throw new Error(`Parent session not found: ${parentSessionId}`)
    const parentWorkDir = parent.worktreePath || parent.workingDirectory

    const child = this.sessionService.create({
      name: options.name,
      providerId: options.providerId || parent.providerId,
      workingDirectory: parentWorkDir,
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

    await this.callbacks.initSession(child.id)
    await this.callbacks.sendMessage(child.id, options.prompt)

    appLog('info', `Persistent child spawned: ${child.id} for parent ${parentSessionId}`, 'process')
    return { childSessionId: child.id }
  }

  /**
   * Spawn a persistent child and wait for its initial response.
   */
  async spawnChildSessionAndWait(
    parentSessionId: string,
    options: { name: string; prompt: string; providerId?: string },
    timeoutMs = 300_000,
  ): Promise<{ childSessionId: string; result: string }> {
    const parent = this.sessionService.getById(parentSessionId)
    if (!parent) throw new Error(`Parent session not found: ${parentSessionId}`)
    const parentWorkDir = parent.worktreePath || parent.workingDirectory

    const child = this.sessionService.create({
      name: options.name,
      providerId: options.providerId || parent.providerId,
      workingDirectory: parentWorkDir,
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

    await this.callbacks.initSession(child.id)
    await this.callbacks.sendMessage(child.id, options.prompt)

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
    await this.callbacks.sendMessage(childSessionId, message)
  }

  /**
   * Send a message to a child and wait for its response.
   */
  async sendToChildAndWait(
    parentSessionId: string,
    childSessionId: string,
    message: string,
    timeoutMs = 300_000,
  ): Promise<string> {
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
    const childState = this.callbacks.getOrCreateState(childSessionId)
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
      this.callbacks.persistMessages(parentSessionId)
      this.callbacks.emitChatUpdate(parentSessionId)
    }

    // Resolve any pending waiter
    this.resolveChildTurnWaiter(childSessionId, result)

    childState.streaming = false
    this.callbacks.emitChatUpdate(childSessionId)
    appLog('info', `Persistent child closed: ${childSessionId}`, 'process')
  }

  /**
   * Get all child sessions for a parent.
   */
  getChildSessions(parentSessionId: string): ReturnType<SessionService['getAll']> {
    const allSessions = this.sessionService.getAll()
    return allSessions.filter(s => s.parentSessionId === parentSessionId)
  }

  /**
   * When a child session completes, inject its result into the parent's context.
   */
  injectChildResult(parentSessionId: string, childSessionId: string): void {
    const parentState = this.sessionStates.get(parentSessionId)
    if (!parentState) return

    const child = this.sessionService.getById(childSessionId)
    if (!child) return

    const childState = this.callbacks.getOrCreateState(childSessionId)
    const lastAssistant = [...childState.messages].reverse().find(m => m.role === 'assistant')
    const result = lastAssistant?.content || '(no output)'

    parentState.messages.push({
      role: 'system',
      content: `[子Agent "${child.name}" 完成]\n\n${result.slice(0, 2000)}`,
      timestamp: new Date().toISOString(),
    })
    this.callbacks.persistMessages(parentSessionId)
    this.callbacks.emitChatUpdate(parentSessionId)

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

  /**
   * When a parent session finishes, finalize all its still-running child agents.
   */
  finalizeChildAgents(
    parentSessionId: string,
    status: 'completed' | 'cancelled' | 'failed',
    skipPersistent = false,
  ): void {
    const tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) return

    const finalized = tracker.finalizeRunningAgents(status, skipPersistent)
    for (const agent of finalized) {
      this.bridgeManager.destroySession(agent.childSessionId).catch(() => {})
      this.concurrencyGuard.unregisterSession(agent.childSessionId)

      this.syncChildStateFromDB(agent.childSessionId)
      const childState = this.sessionStates.get(agent.childSessionId)
      if (childState) {
        childState.streaming = false
      }
      this.emitAgentUpdate(parentSessionId, agent)
      this.callbacks.emitChatUpdate(agent.childSessionId)
    }
  }

  getOrCreateTracker(parentSessionId: string): AgentTracker {
    let tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) {
      const session = this.sessionService.getById(parentSessionId)
      tracker = new AgentTracker(
        this.sessionService,
        session?.providerId || '',
        session?.worktreePath || session?.workingDirectory || process.cwd(),
      )
      this.agentTrackers.set(parentSessionId, tracker)
    }
    return tracker
  }

  handleAgentTaskEvent(parentSessionId: string, event: BridgeEvent): void {
    const tracker = this.getOrCreateTracker(parentSessionId)
    let agent: TrackedAgent | null = null

    switch (event.subtype) {
      case 'task_started':
        agent = tracker.onTaskStarted(parentSessionId, event)
        if (agent) {
          this.childSessionNames.set(agent.childSessionId, agent.name)
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
          const childState = this.sessionStates.get(agent.childSessionId)
          if (childState) {
            childState.streaming = false
            this.callbacks.persistMessages(agent.childSessionId)
          }
          appLog('info', `Active child popped: ${agent.childSessionId}`, 'process')
        }
        break
      }
    }

    if (agent) {
      if (event.subtype === 'task_started') {
        this.syncChildStateFromDB(agent.childSessionId)
      }
      const isMirroring = this.activeChildStack.get(parentSessionId)?.includes(agent.childSessionId)
      if (event.subtype === 'task_progress' && !isMirroring) {
        this.syncChildStateFromDB(agent.childSessionId)
      }

      const childState = this.sessionStates.get(agent.childSessionId)
      if (childState) {
        childState.streaming = agent.streaming
      }

      this.emitAgentUpdate(parentSessionId, agent)
      this.callbacks.emitChatUpdate(agent.childSessionId)
    }
  }

  syncChildStateFromDB(childSessionId: string): void {
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

  emitAgentUpdate(parentSessionId: string, agent: TrackedAgent): void {
    const window = this.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('agent:update', {
        parentSessionId,
        agent: this.trackedAgentToInfo(agent),
      })
    }
  }

  trackedAgentToInfo(agent: TrackedAgent): AgentInfo {
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

  isPersistentChild(parentSessionId: string, childSessionId: string): boolean {
    const tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) return false
    return tracker.getAll().some(
      a => a.childSessionId === childSessionId && a.agentId.startsWith('persistent-'),
    )
  }

  updatePersistentAgentStatus(
    parentSessionId: string,
    childSessionId: string,
    status: TrackedAgent['status'],
  ): void {
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

  createChildTurnWaiter(childSessionId: string, timeoutMs = 300_000): Promise<string> {
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

  resolveChildTurnWaiter(childSessionId: string, result: string): void {
    const waiter = this.childTurnWaiters.get(childSessionId)
    if (waiter) {
      this.childTurnWaiters.delete(childSessionId)
      waiter(result)
    }
  }

  // ─── Agent idle detection ───

  setAgentIdleFlag(childSessionId: string, value: boolean): void {
    this.agentIdleFlags.set(childSessionId, value)
  }

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

    // Fast path: idle flag already set
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

  getAgentOutput(
    childSessionId: string,
    lines?: number,
  ): { output: string; error?: string } {
    const state = this.sessionStates.get(childSessionId)
    if (!state) {
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

  getAgentOutputText(childSessionId: string): string {
    const state = this.sessionStates.get(childSessionId)
    if (!state) return ''
    const last = [...state.messages].reverse().find(m => m.role === 'assistant')
    return last?.content || ''
  }

  resolveAgentIdleWaiters(childSessionId: string): void {
    const waiters = this.agentIdleWaiters.get(childSessionId)
    if (!waiters || waiters.length === 0) return
    const output = this.getAgentOutputText(childSessionId)
    for (const w of waiters) {
      if (w.timer) clearTimeout(w.timer)
      w.resolve({ idle: true, output })
    }
    this.agentIdleWaiters.delete(childSessionId)
  }

  // ─── Query helpers used by ProcessService ──────────────────────

  listAllAgents(): AgentInfo[] {
    const result: AgentInfo[] = []
    for (const tracker of this.agentTrackers.values()) {
      for (const agent of tracker.getAll()) {
        result.push(this.trackedAgentToInfo(agent))
      }
    }
    return result
  }

  getAgentsBySession(sessionId: string): AgentInfo[] {
    const tracker = this.agentTrackers.get(sessionId)
    if (!tracker) return []
    return tracker.getAgentsByParent(sessionId).map(a => this.trackedAgentToInfo(a))
  }

  /** Get the active child stack for a parent session (used by handleBridgeEvent in ProcessService) */
  getActiveChildStack(parentSessionId: string): string[] | undefined {
    return this.activeChildStack.get(parentSessionId)
  }

  /** Delete the active child stack for a parent session */
  deleteActiveChildStack(parentSessionId: string): void {
    this.activeChildStack.delete(parentSessionId)
  }
}

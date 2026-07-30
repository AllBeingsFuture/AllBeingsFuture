/**
 * AgentLifecycleManager - manages child/sub-agent sessions lifecycle.
 * Extracted from ProcessService.
 */

import path from 'node:path'
import type { SessionService, Session } from './session.js'
import type { BridgeManager } from '../bridge/bridge.js'
import type { ConcurrencyGuard } from './concurrency-guard.js'
import { isManagedAbfWorktreePath, type GitService } from './git.js'
import type { SettingsService } from './settings.js'
import { AgentTracker, type TrackedAgent } from './agent-tracker.js'
import {
  installChildTurnWaiter,
  resolveChildTurnWaiterEntry,
  type ChildTurnWaiterHandle,
} from './child-turn-waiter.js'
import { appLog } from './log.js'
import { wrapWorkerTaskPrompt } from './supervisor-prompt.js'
import type { ChatMessage, SessionState, BridgeEvent, AgentInfo } from './process-types.js'
import type { BrowserWindow } from 'electron'

/** Normalize for path equality (posix-ish, no trailing slash). */
function normalizeSessionPath(target: string): string {
  if (!target) return ''
  return path.resolve(target).replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * Callbacks into the parent ProcessService that AgentLifecycleManager needs.
 */
export interface ProcessServiceCallbacks {
  getOrCreateState(sessionId: string): SessionState
  emitChatUpdate(sessionId: string): void
  persistMessages(sessionId: string): void
  initSession(sessionId: string): Promise<void>
  /** @param opts.interrupt when true: cancel active turn then send immediately */
  sendMessage(
    sessionId: string,
    message: string,
    opts?: { interrupt?: boolean },
  ): Promise<void>
  /** Cancel active turn without destroying the session (opt-in interrupt path). */
  interruptTurn(sessionId: string): Promise<void>
}

export class AgentLifecycleManager {
  /** One AgentTracker per parent session that has spawned sub-agents */
  private agentTrackers = new Map<string, AgentTracker>()
  /** Stack of active sub-agent child session IDs per parent session */
  private activeChildStack = new Map<string, string[]>()
  /** Reverse lookup: childSessionId → agent display name */
  private childSessionNames = new Map<string, string>()
  /** Waiters for persistent child turns: childSessionId → { resolve, reject, timer } */
  private childTurnWaiters = new Map<string, ChildTurnWaiterHandle>()
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
    private gitService: GitService,
    private settingsService: SettingsService,
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
   * Fire-and-forget: dispatches the initial prompt and returns without waiting
   * for the child's first turn (AO-style — parent can go idle immediately).
   */
  async spawnChildSession(
    parentSessionId: string,
    options: { name: string; prompt: string; providerId?: string },
  ): Promise<{ childSessionId: string }> {
    const { childSessionId } = await this.bootstrapPersistentChild(parentSessionId, options)
    appLog('info', `Persistent child spawned (async): ${childSessionId} for parent ${parentSessionId}`, 'process')
    return { childSessionId }
  }

  /**
   * Spawn a persistent child and wait for its initial response.
   */
  async spawnChildSessionAndWait(
    parentSessionId: string,
    options: { name: string; prompt: string; providerId?: string },
    timeoutMs = 300_000,
  ): Promise<{ childSessionId: string; result: string }> {
    const { childSessionId, resultPromise } = await this.bootstrapPersistentChild(
      parentSessionId,
      options,
      { waitForTurn: true, timeoutMs },
    )
    appLog('info', `Persistent child spawned (with wait): ${childSessionId}`, 'process')
    const result = await resultPromise!
    return { childSessionId, result }
  }

  /**
   * Create child session, optional isolated worktree, register tracker,
   * init adapter, dispatch initial prompt. Optionally install a turn waiter
   * before send so wait paths do not race.
   */
  private async bootstrapPersistentChild(
    parentSessionId: string,
    options: { name: string; prompt: string; providerId?: string },
    waitOpts?: { waitForTurn: boolean; timeoutMs: number },
  ): Promise<{ childSessionId: string; resultPromise?: Promise<string> }> {
    const parent = this.sessionService.getById(parentSessionId)
    if (!parent) throw new Error(`Parent session not found: ${parentSessionId}`)
    const parentWorkDir = parent.worktreePath || parent.workingDirectory
    const workerPrompt = wrapWorkerTaskPrompt(options.prompt)
    const displayName = this.normalizeWorkerName(options.name)

    const child = this.sessionService.create({
      name: displayName,
      providerId: options.providerId || parent.providerId,
      workingDirectory: parentWorkDir,
      parentSessionId,
      autoAccept: parent.autoAccept,
      permissionMode: parent.permissionMode,
      gitRepoPath: parent.worktreeSourceRepo || '',
    })

    // AO-style: each child gets its own worktree when autoWorktree is on.
    await this.tryIsolateChildWorktree(parent, child, displayName)

    const tracker = this.getOrCreateTracker(parentSessionId)
    const agent = tracker.registerPersistentChild(
      parentSessionId,
      child.id,
      displayName,
      workerPrompt,
    )
    this.emitAgentUpdate(parentSessionId, agent)

    // Waiter must be registered before sendMessage to avoid missing a fast turn.
    let resultPromise: Promise<string> | undefined
    if (waitOpts?.waitForTurn) {
      resultPromise = this.createChildTurnWaiter(child.id, waitOpts.timeoutMs)
    }

    await this.callbacks.initSession(child.id)
    await this.callbacks.sendMessage(child.id, workerPrompt)

    return { childSessionId: child.id, resultPromise }
  }

  /**
   * When autoWorktree is enabled and the parent is in a git repo, create an
   * isolated worktree for the child and update session worktree fields.
   * Applies to every child with a parent (父亲 + 儿子). Prefer basing the new
   * worktree on the parent's current branch/workDir so nested sons inherit the
   * father's committed state and merge-back is coherent.
   * Failures fall back to the parent directory (spawn still succeeds).
   */
  private async tryIsolateChildWorktree(
    parent: Session,
    child: Session,
    displayName: string,
  ): Promise<void> {
    if (!this.settingsService.getAutoWorktree()) {
      appLog('info', `Child worktree isolation skipped (autoWorktree off): ${child.id}`, 'process')
      return
    }

    const parentDir = parent.worktreePath || parent.workingDirectory
    try {
      let sourceRepo = (parent.worktreeSourceRepo || '').trim()
      if (!sourceRepo) {
        const isRepo = await this.gitService.isGitRepo(parentDir)
        if (!isRepo) {
          appLog('info', `Child worktree isolation skipped (not a git repo): ${parentDir}`, 'process')
          return
        }
        sourceRepo = await this.gitService.getRepoRoot(parentDir)
      }

      // Prefer parent's live branch so nested children start from father HEAD
      let startPoint = (parent.worktreeBranch || '').trim()
      if (!startPoint) {
        startPoint = await this.gitService.getCurrentBranch(parentDir).catch(() => '')
      }
      if (!startPoint || startPoint === 'HEAD') {
        startPoint = await this.gitService.revParse(parentDir, 'HEAD').catch(() => '')
      }

      const safeLabel = displayName
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'worker'
      const branchName = `child-${safeLabel}-${child.id.slice(0, 8)}`
      const wt = await this.gitService.createWorktree(
        sourceRepo,
        branchName,
        child.id,
        startPoint || undefined,
      )
      this.sessionService.setWorktreeInfo(
        child.id,
        wt.worktreePath,
        wt.branch,
        wt.baseCommit,
        wt.baseBranch,
        sourceRepo,
      )
      appLog(
        'info',
        `Child worktree isolated: ${child.id} → ${wt.worktreePath} (branch ${wt.branch}, from ${startPoint || 'HEAD'})`,
        'process',
      )
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      // Fail-open: spawn still succeeds with shared parent cwd. Leave worktreePath
      // unset so cleanup will never try to delete the parent directory.
      appLog(
        'warn',
        `Child worktree isolation failed (shared cwd fallback): child=${child.id} parentDir=${parentDir} error=${errMsg}`,
        'process',
      )
    }
  }

  /**
   * Remove only this child's dedicated worktree on close (best-effort).
   * Never touches the parent session worktree / working directory / source repo.
   *
   * Safety gates (all must pass):
   * 1. Child has a non-empty worktreePath and it is not already merged
   * 2. Path is under ABF managed isolation root (.allbeingsfuture-worktrees)
   * 3. Path is not equal to parent worktreePath / workingDirectory / source repo
   * 4. Isolation actually created a distinct path from the parent (shared cwd → skip)
   */
  private async cleanupChildWorktree(parent: Session, child: Session): Promise<void> {
    const worktreePath = (child.worktreePath || '').trim()
    if (!worktreePath || child.worktreeMerged) {
      appLog('info', `Child worktree cleanup skipped (no dedicated worktree): ${child.id}`, 'process')
      return
    }

    const childWt = normalizeSessionPath(worktreePath)
    const parentWt = normalizeSessionPath(parent.worktreePath || '')
    const parentCwd = normalizeSessionPath(parent.workingDirectory || '')
    const parentSource = normalizeSessionPath(parent.worktreeSourceRepo || '')
    const childSource = normalizeSessionPath(child.worktreeSourceRepo || '')
    const sourceRepo = childSource || parentSource || childWt

    // Hard stop: never remove parent paths or the main repo root.
    const protectedPaths = [parentWt, parentCwd, parentSource, childSource].filter(Boolean)
    if (protectedPaths.includes(childWt)) {
      appLog(
        'warn',
        `Child worktree cleanup refused: path equals parent/source (${childWt}) for child ${child.id}`,
        'process',
      )
      return
    }

    // Only managed isolation dirs — never arbitrary cwd shared with parent.
    if (!isManagedAbfWorktreePath(sourceRepo, childWt)
      && !isManagedAbfWorktreePath(parentSource || sourceRepo, childWt)) {
      appLog(
        'warn',
        `Child worktree cleanup refused: not an ABF managed worktree path (${childWt})`,
        'process',
      )
      return
    }

    // If isolation failed, child may still list parent dir as workingDirectory;
    // only delete when worktreePath is a distinct child-owned path.
    if (childWt === parentWt || childWt === parentCwd) {
      appLog(
        'warn',
        `Child worktree cleanup refused: would remove parent workdir (${childWt})`,
        'process',
      )
      return
    }

    try {
      await this.gitService.removeWorktree(
        sourceRepo,
        worktreePath,
        true,
        child.worktreeBranch || undefined,
      )
      appLog('info', `Removed child-only worktree: ${worktreePath} (child ${child.id})`, 'process')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      appLog('warn', `Failed to remove child worktree ${worktreePath}: ${errMsg}`, 'process')
    }
  }

  /** Sidebar-friendly short label (aligned with AO's ≤20 char guidance). */
  private normalizeWorkerName(name: string): string {
    const trimmed = (name || '').trim() || 'Worker'
    // Count UTF-16 code units is fine for UI labels; cap at 20 visible-ish chars
    return trimmed.length > 20 ? trimmed.slice(0, 20) : trimmed
  }

  /**
   * Send a message to a child session from its parent.
   * Default: queue_after_turn — do not cancel the child's current turn; idle
   * sends immediately, streaming queues via MessageScheduler.
   * Pass `interrupt: true` only for emergency correction (cancel then send).
   */
  async sendToChild(
    parentSessionId: string,
    childSessionId: string,
    message: string,
    opts?: { interrupt?: boolean },
  ): Promise<void> {
    const child = this.sessionService.getById(childSessionId)
    if (!child) throw new Error(`Child session not found: ${childSessionId}`)
    if (child.parentSessionId !== parentSessionId) {
      throw new Error(`Session ${childSessionId} is not a child of ${parentSessionId}`)
    }
    const interrupt = opts?.interrupt === true
    // interrupt=true only: cancel current turn so the next send is immediate.
    // Default: leave the child running; sendMessage queues if streaming.
    if (interrupt) {
      await this.callbacks.interruptTurn(childSessionId)
    }
    this.agentIdleFlags.delete(childSessionId)
    this.updatePersistentAgentStatus(parentSessionId, childSessionId, 'running')
    // No interrupt flag on sendMessage — already interrupted above when requested.
    // Default path relies on scheduler queue_after_turn while child is streaming.
    await this.callbacks.sendMessage(childSessionId, message)
  }

  /**
   * Send a message to a child and wait for its response.
   * Default: do not interrupt. If the child is still streaming, wait until
   * idle first so the turn waiter attaches to the NEW turn (not the current one).
   * Pass `interrupt: true` to cancel-then-send (emergency).
   */
  async sendToChildAndWait(
    parentSessionId: string,
    childSessionId: string,
    message: string,
    timeoutMs = 300_000,
    opts?: { interrupt?: boolean },
  ): Promise<string> {
    const child = this.sessionService.getById(childSessionId)
    if (!child) throw new Error(`Child session not found: ${childSessionId}`)
    if (child.parentSessionId !== parentSessionId) {
      throw new Error(`Session ${childSessionId} is not a child of ${parentSessionId}`)
    }
    const interrupt = opts?.interrupt === true
    if (interrupt) {
      await this.callbacks.interruptTurn(childSessionId)
    } else {
      // Ensure waiter is for the queued message's turn, not the in-flight one.
      const childState = this.sessionStates.get(childSessionId)
      if (childState?.streaming) {
        await this.waitAgentIdle(parentSessionId, childSessionId, timeoutMs)
      }
    }
    const resultPromise = this.createChildTurnWaiter(childSessionId, timeoutMs)
    this.agentIdleFlags.delete(childSessionId)
    this.updatePersistentAgentStatus(parentSessionId, childSessionId, 'running')
    await this.callbacks.sendMessage(childSessionId, message)
    return resultPromise
  }

  /**
   * Explicitly close a persistent child agent.
   * Removes from tracker and notifies UI to drop the sub-task from the sidebar.
   */
  async closeChildSession(parentSessionId: string, childSessionId: string): Promise<void> {
    const child = this.sessionService.getById(childSessionId)
    if (!child) throw new Error(`Child session not found: ${childSessionId}`)
    if (child.parentSessionId !== parentSessionId) {
      throw new Error(`Session ${childSessionId} is not a child of ${parentSessionId}`)
    }

    // Recursively close nested children (grandchildren…) before this child.
    const nested = this.getChildSessions(childSessionId)
    for (const gc of nested) {
      await this.closeChildSession(childSessionId, gc.id).catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err)
        appLog('warn', `Failed to close nested child ${gc.id}: ${errMsg}`, 'process')
      })
    }

    // Stop the child's bridge adapter and free concurrency slot
    await this.bridgeManager.destroySession(childSessionId).catch(() => {})
    this.concurrencyGuard.unregisterSession(childSessionId)

    // Best-effort: remove only this child's dedicated worktree — never the parent.
    const parent = this.sessionService.getById(parentSessionId)
    if (parent) {
      await this.cleanupChildWorktree(parent, child)
    } else {
      appLog('warn', `Child worktree cleanup skipped: parent ${parentSessionId} not found`, 'process')
    }

    // Get last result from child
    const childState = this.callbacks.getOrCreateState(childSessionId)
    const lastAssistant = [...childState.messages].reverse().find(m => m.role === 'assistant')
    const result = lastAssistant?.content || '(no output)'

    // Mark session terminated (not completed) so fetchAllAgents will not rehydrate it
    this.sessionService.updateStatus(childSessionId, 'terminated')

    // Remove from tracker and emit removed so UI drops the sub-task immediately.
    // Always emit removed even if tracker entry is missing (stale UI state).
    const removed = this.removePersistentAgent(parentSessionId, childSessionId)
    if (!removed) {
      this.emitAgentRemoved(parentSessionId, {
        agentId: `persistent-${childSessionId}`,
        name: child.name,
        parentSessionId,
        childSessionId,
        status: 'cancelled',
        summary: '',
        sdkSessionId: '',
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        streaming: false,
      })
    }

    // Clean active child stack / names / idle flags
    const stack = this.activeChildStack.get(parentSessionId)
    if (stack) {
      const idx = stack.indexOf(childSessionId)
      if (idx !== -1) stack.splice(idx, 1)
      if (stack.length === 0) this.activeChildStack.delete(parentSessionId)
    }
    this.childSessionNames.delete(childSessionId)
    this.agentIdleFlags.delete(childSessionId)
    const idleWaiters = this.agentIdleWaiters.get(childSessionId)
    if (idleWaiters) {
      for (const w of idleWaiters) {
        if (w.timer) clearTimeout(w.timer)
        w.resolve({ idle: true, output: result })
      }
      this.agentIdleWaiters.delete(childSessionId)
    }

    // Inject final result into parent
    const parentState = this.sessionStates.get(parentSessionId)
    if (parentState) {
      parentState.messages.push({
        role: 'system',
        content: [
          `[子Agent "${child.name}" 已关闭]`,
          '',
          `最终输出: ${result.slice(0, 2000)}`,
          '',
          '注意: close 已删除子 worktree；若关闭前未将变更 merge/cherry-pick 进父 workDir，未合入改动可能已丢失。',
        ].join('\n'),
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
   * Remove a persistent agent from the tracker and notify the frontend.
   */
  removePersistentAgent(parentSessionId: string, childSessionId: string): TrackedAgent | null {
    const tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) return null
    const removed = tracker.removeByChildSessionId(childSessionId)
    if (removed) {
      removed.status = 'cancelled'
      removed.streaming = false
      removed.completedAt = removed.completedAt || new Date().toISOString()
      this.emitAgentUpdate(parentSessionId, removed, true)
    }
    return removed
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

    const childWorkDir = child.worktreePath || child.workingDirectory || ''
    parentState.messages.push({
      role: 'system',
      content: [
        `[子Agent "${child.name}" 完成]`,
        '',
        result.slice(0, 2000),
        '',
        `提示: 请将子 workDir${childWorkDir ? ` (${childWorkDir})` : ''} 的变更 merge/cherry-pick 到父 workDir 后再 close_agent（close 会删除子 worktree）。`,
      ].join('\n'),
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
   * Also unblocks any AndWait / wait_agent_idle waiters so they do not hang.
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
      const resultText =
        this.getAgentOutputText(agent.childSessionId)
        || `(${status})`
      this.resolveChildTurnWaiter(agent.childSessionId, resultText)
      this.setAgentIdleFlag(agent.childSessionId, true)
      this.resolveAgentIdleWaiters(agent.childSessionId)
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

  emitAgentUpdate(parentSessionId: string, agent: TrackedAgent, removed = false): void {
    if (removed) {
      this.emitAgentRemoved(parentSessionId, agent)
      return
    }
    const window = this.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('agent:update', {
        parentSessionId,
        agent: this.trackedAgentToInfo(agent),
      })
    }
  }

  /** Notify frontend to drop a sub-agent from the parent session sidebar. */
  emitAgentRemoved(parentSessionId: string, agent: TrackedAgent): void {
    const window = this.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('agent:update', {
        parentSessionId,
        agent: this.trackedAgentToInfo(agent),
        removed: true,
      })
    }
  }

  trackedAgentToInfo(agent: TrackedAgent): AgentInfo {
    const session = this.sessionService.getById(agent.childSessionId)
    return {
      agentId: agent.agentId,
      name: agent.name,
      parentSessionId: agent.parentSessionId,
      childSessionId: agent.childSessionId,
      status: agent.status,
      summary: agent.summary,
      workDir: session?.worktreePath || session?.workingDirectory || '',
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
        // Only delete if this timer's entry is still installed (not superseded)
        const current = this.childTurnWaiters.get(childSessionId)
        if (current?.timer === timer) {
          this.childTurnWaiters.delete(childSessionId)
        }
        reject(new Error(`Timeout waiting for child agent ${childSessionId} (${timeoutMs}ms)`))
      }, timeoutMs)

      installChildTurnWaiter(this.childTurnWaiters, childSessionId, {
        resolve,
        reject,
        timer,
      })
    })
  }

  resolveChildTurnWaiter(childSessionId: string, result: string): void {
    resolveChildTurnWaiterEntry(this.childTurnWaiters, childSessionId, result)
  }

  /**
   * Clean managed ABF worktree when a session is disposed/deleted.
   * - Nested children: same safety gates as closeChildSession → cleanupChildWorktree
   * - Top-level sessions: remove dedicated worktreePath under managed isolation root
   * - Orphan children (parent already gone): still remove managed path via worktreeSourceRepo
   */
  async cleanupDisposedSessionWorktree(sessionId: string): Promise<void> {
    const session = this.sessionService.getById(sessionId)
    if (!session) return
    const worktreePath = (session.worktreePath || '').trim()
    if (!worktreePath || session.worktreeMerged) return

    if (session.parentSessionId) {
      const parent = this.sessionService.getById(session.parentSessionId)
      if (parent) {
        await this.cleanupChildWorktree(parent, session)
        return
      }
      // Parent row already gone mid-cascade: fall through to source-repo managed cleanup.
      appLog(
        'warn',
        `Disposed-session worktree: parent ${session.parentSessionId} missing for ${sessionId}; trying source-repo cleanup`,
        'process',
      )
    }

    const sourceRepo = (session.worktreeSourceRepo || '').trim()
    if (!sourceRepo) return
    if (!isManagedAbfWorktreePath(sourceRepo, worktreePath)) {
      appLog(
        'warn',
        `Disposed-session worktree cleanup refused (not managed): ${worktreePath}`,
        'process',
      )
      return
    }
    await this.gitService.removeWorktree(
      sourceRepo,
      worktreePath,
      true,
      session.worktreeBranch || '',
    )
  }

  /**
   * Release lifecycle maps for a disposed session so waiters never hang and
   * memory does not leak. Call only from disposeSession (not stopProcess).
   */
  cleanupDisposedSessionMaps(sessionId: string): void {
    // Unblock AndWait / wait_agent_idle so dispose never leaves hangers
    const resultText = this.getAgentOutputText(sessionId) || '(session disposed)'
    this.resolveChildTurnWaiter(sessionId, resultText)
    this.agentIdleFlags.delete(sessionId)
    const idleWaiters = this.agentIdleWaiters.get(sessionId)
    if (idleWaiters) {
      for (const w of idleWaiters) {
        if (w.timer) clearTimeout(w.timer)
        w.resolve({ idle: true, output: resultText })
      }
      this.agentIdleWaiters.delete(sessionId)
    }

    this.childSessionNames.delete(sessionId)
    this.activeChildStack.delete(sessionId)
    this.agentTrackers.delete(sessionId)

    // Drop this id from any parent active stack
    for (const [parentId, stack] of this.activeChildStack) {
      const idx = stack.indexOf(sessionId)
      if (idx !== -1) {
        stack.splice(idx, 1)
        if (stack.length === 0) this.activeChildStack.delete(parentId)
      }
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
  ): { status: string; name: string; agentId: string; workDir: string } | null {
    const tracker = this.agentTrackers.get(parentSessionId)
    if (!tracker) return null
    for (const agent of tracker.getAll()) {
      if (agent.childSessionId === childSessionId) {
        const info = this.trackedAgentToInfo(agent)
        return {
          status: agent.status,
          name: agent.name,
          agentId: agent.agentId,
          workDir: info.workDir,
        }
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

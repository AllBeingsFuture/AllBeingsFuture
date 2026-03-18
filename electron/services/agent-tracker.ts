/**
 * AgentTracker - tracks sub-agent lifecycle from Claude SDK task events
 *
 * When the main agent spawns a sub-agent, the SDK emits:
 *   - task_started  → we create a child session and start tracking
 *   - task_progress → we update summary/usage/status
 *   - task_notification → we finalize (completed/failed/cancelled)
 *
 * Each tracked agent is backed by a real child session in the DB so
 * the user can click into it, see messages, and even send follow-ups.
 *
 * Sub-agent messages are extracted from the event's `data` field to
 * replicate the same thinking / text / tool_use display as the main agent.
 */

import type { SessionService } from './session.js'
import { appLog } from './log.js'

export interface TrackedAgent {
  agentId: string          // SDK task_id
  parentSessionId: string
  childSessionId: string
  status: 'pending' | 'running' | 'idle' | 'completed' | 'failed' | 'cancelled'
  name: string
  summary: string
  sdkSessionId: string     // SDK session_id for resume
  usage: { inputTokens: number; outputTokens: number }
  createdAt: string
  completedAt?: string
  streaming: boolean       // whether the sub-agent is actively producing output
}

export class AgentTracker {
  /** agentId (task_id) → TrackedAgent */
  private agents = new Map<string, TrackedAgent>()
  /** Dedup: last summary text per agent to avoid repeating identical messages */
  private lastSummaries = new Map<string, string>()
  /** Dedup: last assistant text per agent to avoid repeating identical content */
  private lastAssistantText = new Map<string, string>()

  constructor(
    private sessionService: SessionService,
    private parentProviderId: string,
    private parentWorkDir: string,
  ) {}

  /**
   * Called when the SDK emits a task_started system event.
   * Creates a child session and begins tracking.
   */
  onTaskStarted(parentSessionId: string, event: any): TrackedAgent {
    const taskId = event.task_id || event.taskId || `task-${Date.now()}`
    const sdkSessionId = event.session_id || event.sessionId || ''
    const description = event.description || event.prompt || ''
    const name = description
      ? `Agent: ${description.slice(0, 60)}${description.length > 60 ? '…' : ''}`
      : `Sub-Agent ${taskId.slice(0, 8)}`

    // Create a real child session in the DB
    const childSession = this.sessionService.create({
      name,
      providerId: this.parentProviderId,
      workingDirectory: this.parentWorkDir,
      parentSessionId,
    })

    // Store SDK session_id so the child can resume into the right context
    if (sdkSessionId) {
      this.sessionService.updateConversationId(childSession.id, sdkSessionId)
    }

    const agent: TrackedAgent = {
      agentId: taskId,
      parentSessionId,
      childSessionId: childSession.id,
      status: 'running',
      name,
      summary: description,
      sdkSessionId,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: new Date().toISOString(),
      streaming: true,
    }

    this.agents.set(taskId, agent)
    this.sessionService.updateStatus(childSession.id, 'running')
    appLog('info', `Agent tracked: ${taskId} → child ${childSession.id}`, 'agent-tracker')

    // Write the task description as the first user-like message so the context is clear
    if (description) {
      this.appendChildMessage(agent.childSessionId, 'user', description)
    }

    return agent
  }

  /**
   * Called when the SDK emits a task_progress system event.
   * Parses structured content blocks from event data and creates proper
   * messages (assistant / thinking / tool_use) in the child session —
   * mirroring the main agent's message flow.
   */
  onTaskProgress(event: any): TrackedAgent | null {
    const taskId = event.task_id || event.taskId
    const agent = this.agents.get(taskId)
    if (!agent) {
      appLog('warn', `task_progress for unknown agent: ${taskId}`, 'agent-tracker')
      return null
    }

    if (event.usage) {
      agent.usage.inputTokens += event.usage.input_tokens || 0
      agent.usage.outputTokens += event.usage.output_tokens || 0
    }

    // Try to extract structured content blocks from the event
    const hadDetailedContent = this.processEventContent(agent, event)

    // Fall back to summary text if no structured content was found
    const newSummary = event.summary || event.message
    if (newSummary && typeof newSummary === 'string') {
      agent.summary = newSummary
    }

    if (!hadDetailedContent && agent.summary) {
      const prev = this.lastSummaries.get(taskId)
      if (agent.summary !== prev) {
        this.lastSummaries.set(taskId, agent.summary)
        this.appendChildMessage(agent.childSessionId, 'assistant', agent.summary)
      }
    }

    return agent
  }

  /**
   * Called when the SDK emits a task_notification (final status).
   */
  onTaskNotification(event: any): TrackedAgent | null {
    const taskId = event.task_id || event.taskId
    const agent = this.agents.get(taskId)
    if (!agent) {
      appLog('warn', `task_notification for unknown agent: ${taskId}`, 'agent-tracker')
      return null
    }

    const status = event.status || 'completed'
    if (status === 'completed' || status === 'success') {
      agent.status = 'completed'
      this.sessionService.updateStatus(agent.childSessionId, 'completed')
    } else if (status === 'failed' || status === 'error') {
      agent.status = 'failed'
      this.sessionService.updateStatus(agent.childSessionId, 'error')
    } else if (status === 'cancelled') {
      agent.status = 'cancelled'
      this.sessionService.updateStatus(agent.childSessionId, 'terminated')
    } else {
      agent.status = status as TrackedAgent['status']
    }

    agent.completedAt = new Date().toISOString()
    agent.streaming = false

    // Extract any final structured content
    this.processEventContent(agent, event)

    const finalText = event.result || event.summary
    if (finalText && typeof finalText === 'string') {
      agent.summary = finalText
      const prev = this.lastSummaries.get(taskId)
      if (finalText !== prev) {
        this.lastSummaries.set(taskId, finalText)
        this.appendChildMessage(agent.childSessionId, 'assistant', finalText)
      }
    }

    // Cleanup dedup caches
    this.lastSummaries.delete(taskId)
    this.lastAssistantText.delete(taskId)

    appLog('info', `Agent finished: ${taskId} → ${agent.status}`, 'agent-tracker')
    return agent
  }

  /**
   * Register a persistent child session (user-spawned, not SDK-spawned).
   * Unlike SDK tasks, these have a live adapter and accept follow-up messages.
   */
  registerPersistentChild(
    parentSessionId: string,
    childSessionId: string,
    name: string,
    description: string,
  ): TrackedAgent {
    const agentId = `persistent-${childSessionId}`

    const agent: TrackedAgent = {
      agentId,
      parentSessionId,
      childSessionId,
      status: 'running',
      name,
      summary: description,
      sdkSessionId: '',
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: new Date().toISOString(),
      streaming: true,
    }

    this.agents.set(agentId, agent)
    this.sessionService.updateStatus(childSessionId, 'running')
    appLog('info', `Persistent child registered: ${agentId} → ${childSessionId}`, 'agent-tracker')

    return agent
  }

  getByAgentId(agentId: string): TrackedAgent | undefined {
    return this.agents.get(agentId)
  }

  getAgentsByParent(parentSessionId: string): TrackedAgent[] {
    const result: TrackedAgent[] = []
    for (const agent of this.agents.values()) {
      if (agent.parentSessionId === parentSessionId) {
        result.push(agent)
      }
    }
    return result
  }

  getAll(): TrackedAgent[] {
    return Array.from(this.agents.values())
  }

  /**
   * Finalize all still-running agents when the parent session completes.
   * Called when the main agent's stream ends normally (done event).
   */
  finalizeRunningAgents(
    status: 'completed' | 'cancelled' | 'failed' = 'completed',
    skipPersistent = false,
  ): TrackedAgent[] {
    const finalized: TrackedAgent[] = []
    const dbStatus = status === 'completed' ? 'completed'
      : status === 'cancelled' ? 'terminated'
      : 'error'

    for (const agent of this.agents.values()) {
      if (skipPersistent && agent.agentId.startsWith('persistent-')) continue
      if (agent.status === 'running' || agent.status === 'pending' || agent.status === 'idle') {
        agent.status = status
        agent.streaming = false
        agent.completedAt = agent.completedAt || new Date().toISOString()
        this.sessionService.updateStatus(agent.childSessionId, dbStatus)
        this.lastSummaries.delete(agent.agentId)
        this.lastAssistantText.delete(agent.agentId)
        finalized.push(agent)
        appLog('info', `Agent force-finalized: ${agent.agentId} → ${status}`, 'agent-tracker')
      }
    }
    return finalized
  }

  // ─── Internal helpers ──────────────────────────────────────────────

  /**
   * Extract structured content blocks from event data and write them as
   * proper typed messages (thinking / assistant / tool_use).
   * Returns true if any detailed content was found.
   */
  private processEventContent(agent: TrackedAgent, event: any): boolean {
    const data = event.data || {}
    let found = false

    // 1. Check for an array of content blocks (SDK may send these)
    const contentBlocks: any[] = data.content || data.content_blocks || event.content || event.content_blocks || []
    if (Array.isArray(contentBlocks) && contentBlocks.length > 0) {
      for (const block of contentBlocks) {
        if (block.type === 'thinking' && block.thinking) {
          this.appendChildMessage(agent.childSessionId, 'thinking', block.thinking, { isThinking: true })
          found = true
        } else if (block.type === 'text' && block.text) {
          const prev = this.lastAssistantText.get(agent.agentId)
          if (block.text !== prev) {
            this.lastAssistantText.set(agent.agentId, block.text)
            this.appendChildMessage(agent.childSessionId, 'assistant', block.text)
            found = true
          }
        } else if (block.type === 'tool_use') {
          this.appendChildMessage(agent.childSessionId, 'tool_use', block.name || 'tool', {
            toolName: block.name,
            toolInput: block.input,
          })
          found = true
        } else if (block.type === 'tool_result') {
          this.appendChildMessage(agent.childSessionId, 'system',
            `Tool result: ${typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '')}`)
          found = true
        }
      }
    }

    // 2. Check for standalone thinking field
    const thinking = data.thinking || event.thinking
    if (thinking && typeof thinking === 'string') {
      this.appendChildMessage(agent.childSessionId, 'thinking', thinking, { isThinking: true })
      found = true
    }

    // 3. Check for standalone tool_use fields
    const toolName = data.tool_name || data.toolName || event.tool_name || event.toolName
    if (toolName) {
      this.appendChildMessage(agent.childSessionId, 'tool_use', toolName, {
        toolName,
        toolInput: data.tool_input || data.toolInput || event.tool_input || event.toolInput || {},
      })
      found = true
    }

    // 4. Check if message field is a structured object with content blocks
    const msgObj = event.message || data.message
    if (msgObj && typeof msgObj === 'object' && Array.isArray(msgObj.content)) {
      for (const block of msgObj.content) {
        if (block.type === 'thinking' && block.thinking) {
          this.appendChildMessage(agent.childSessionId, 'thinking', block.thinking, { isThinking: true })
          found = true
        } else if (block.type === 'text' && block.text) {
          const prev = this.lastAssistantText.get(agent.agentId)
          if (block.text !== prev) {
            this.lastAssistantText.set(agent.agentId, block.text)
            this.appendChildMessage(agent.childSessionId, 'assistant', block.text)
            found = true
          }
        } else if (block.type === 'tool_use') {
          this.appendChildMessage(agent.childSessionId, 'tool_use', block.name || 'tool', {
            toolName: block.name,
            toolInput: block.input,
          })
          found = true
        }
      }
    }

    return found
  }

  /** Write a message into a child session's persisted messages */
  private appendChildMessage(
    childSessionId: string,
    role: string,
    content: string,
    extra?: { toolName?: string; toolInput?: any; isThinking?: boolean },
  ) {
    if (!content) return
    try {
      const session = this.sessionService.getById(childSessionId)
      if (!session) return
      let messages: any[] = []
      try { messages = JSON.parse(session.messagesJson || '[]') } catch {}
      messages.push({
        role,
        content,
        timestamp: new Date().toISOString(),
        ...(extra?.toolName ? { toolName: extra.toolName } : {}),
        ...(extra?.toolInput ? { toolInput: extra.toolInput } : {}),
        ...(extra?.isThinking ? { isThinking: true } : {}),
      })
      this.sessionService.updateMessages(childSessionId, JSON.stringify(messages))
    } catch (err: any) {
      appLog('warn', `Failed to append child message: ${err.message}`, 'agent-tracker')
    }
  }
}

import type { ChatMessage } from '../../../bindings/allbeingsfuture/internal/models/models'
import type {
  AgentSessionStreamState,
  AgentStreamEvent,
  AgentStreamPhase,
} from '../../types/agentStreamTypes'

type StreamChatMessage = ChatMessage & {
  id?: string
  timestamp?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  toolOutputs?: Array<{ stream: 'stdout' | 'stderr'; text: string }>
  toolUseId?: string
  /** Legacy process path id; treated as an alias of toolUseId for stream reduce. */
  toolCallId?: string
  toolStatus?: string
  isDelta?: boolean
  isError?: boolean
  isThinking?: boolean
  streamItemId?: string
  /** Legacy process path item id for assistant bubbles. */
  sourceItemId?: string
  partial?: boolean
}

function toolIdOf(message: StreamChatMessage): string | undefined {
  return message.toolUseId || message.toolCallId
}

function matchesToolCall(message: StreamChatMessage, toolCallId: string): boolean {
  return toolIdOf(message) === toolCallId
}

export interface AgentStreamReduction {
  messages: ChatMessage[]
  stream: AgentSessionStreamState
  streaming: boolean
  error: string
  ignored: boolean
}

const ACTIVE_PHASES = new Set<AgentStreamPhase>(['running', 'waiting_permission', 'cancelling'])

/**
 * @deprecated Silence must not hand live content ownership to legacy snapshots.
 * Kept only so older tests/imports do not break; content policy uses phase only.
 */
export const AGENT_STREAM_SILENCE_MS = 12_000

export function createAgentSessionStreamState(): AgentSessionStreamState {
  return { phase: 'idle', lastSequence: -1 }
}

export function isAgentStreamActive(stream: AgentSessionStreamState | undefined): boolean {
  return Boolean(stream && ACTIVE_PHASES.has(stream.phase))
}

/**
 * Single source of truth for live transcript ownership.
 *
 * While the normalized turn is open (running / waiting_permission / cancelling),
 * `agent:stream` alone owns message content. Legacy `chat:update` / `chat:patch`
 * / poll must not replace the transcript mid-turn — even after long silence.
 *
 * History of the broken model (why patches never stuck):
 * - Backend dual-emits agent:stream + legacy chat for every bridge event.
 * - Silence fail-open (12s) reassigned content to legacy mid-turn.
 * - Legacy rows lack streamItemId / partial / toolUseId shape → UI frozen,
 *   bubble forks, tool groups stuck — each fix patched one symptom then
 *   regressed another.
 *
 * Terminal recovery (lost `done`) still works: legacy `streaming:false`
 * always bypasses this gate and converges the phase.
 */
export function shouldPreferAgentStream(
  stream: AgentSessionStreamState | undefined,
  _now: number = Date.now(),
): boolean {
  void _now
  return isAgentStreamActive(stream)
}

/**
 * Converge a stuck active stream when legacy backend reports the turn has ended.
 * Returns undefined when there is nothing to change.
 */
export function convergeAgentStreamOnLegacyEnd(
  stream: AgentSessionStreamState | undefined,
): AgentSessionStreamState | undefined {
  if (!stream || !isAgentStreamActive(stream)) return undefined
  return {
    ...stream,
    phase: 'done',
    permission: undefined,
    statusMessage: undefined,
    plan: undefined,
  }
}

function timestampOf(event: AgentStreamEvent): string {
  return event.timestamp || new Date().toISOString()
}

function activate(stream: AgentSessionStreamState): AgentSessionStreamState {
  if (stream.phase === 'cancelling') return stream
  if (ACTIVE_PHASES.has(stream.phase)) return { ...stream, phase: 'running', terminalReason: undefined }
  return {
    ...stream,
    phase: 'running',
    statusMessage: undefined,
    plan: undefined,
    permission: undefined,
    terminalReason: undefined,
  }
}

function patchMessage(
  messages: ChatMessage[],
  predicate: (message: StreamChatMessage) => boolean,
  update: (message: StreamChatMessage) => StreamChatMessage,
): { messages: ChatMessage[]; found: boolean } {
  const index = messages.findIndex(message => predicate(message as StreamChatMessage))
  if (index < 0) return { messages, found: false }
  const next = messages.slice()
  next[index] = update(next[index] as StreamChatMessage) as ChatMessage
  return { messages: next, found: true }
}

/**
 * Close open narrative bubbles (assistant / thinking) before a tool or a new
 * reply segment starts. Providers often reuse one default text itemId for the
 * whole turn; without sealing, later text would keep growing the first bubble.
 */
function sealOpenNarrativeMessages(messages: ChatMessage[]): ChatMessage[] {
  let changed = false
  const next = messages.map(message => {
    const streamMessage = message as StreamChatMessage
    const isNarrative = streamMessage.role === 'assistant'
      || streamMessage.role === 'thinking'
      || Boolean(streamMessage.isThinking)
    if (!isNarrative || !streamMessage.partial) return message
    changed = true
    return { ...streamMessage, partial: false } as ChatMessage
  })
  return changed ? next : messages
}

function appendTextDelta(messages: ChatMessage[], event: Extract<AgentStreamEvent, { type: 'text_delta' }>) {
  // Only extend the *trailing* open assistant bubble with the same stream item.
  // Never reopen an earlier partial bubble after tools / other messages have
  // been appended — that is what forces multi-round replies into one box.
  //
  // Legacy fail-open snapshots often omit streamItemId/sourceItemId while still
  // marking the last assistant partial=true. Merge into that trailing bubble so
  // post-silence agent:stream deltas keep growing the live reply instead of
  // spawning a frozen second box with only the latest fragment.
  const last = messages[messages.length - 1] as StreamChatMessage | undefined
  const lastItemId = last?.streamItemId || last?.sourceItemId
  const canMergeTrailing = Boolean(
    last?.role === 'assistant'
    && last.partial === true
    && (lastItemId == null || lastItemId === event.itemId),
  )
  if (canMergeTrailing && last) {
    const next = messages.slice()
    next[next.length - 1] = {
      ...last,
      content: `${last.content || ''}${event.delta}`,
      partial: true,
      streamItemId: last.streamItemId || event.itemId,
    } as ChatMessage
    return next
  }

  return [...messages, {
    role: 'assistant',
    content: event.delta,
    partial: true,
    id: `${event.itemId}-${event.sequence}`,
    streamItemId: event.itemId,
    timestamp: timestampOf(event),
  } as unknown as ChatMessage]
}

function updateThinking(messages: ChatMessage[], event: Extract<AgentStreamEvent, { type: 'thinking_update' }>) {
  // Same trailing-only rule as text: a thinking block closed by tools must not
  // absorb later thought chunks into the earlier bubble.
  const last = messages[messages.length - 1] as StreamChatMessage | undefined
  const lastItemId = last?.streamItemId || last?.sourceItemId
  const canMergeTrailing = Boolean(
    last
    && Boolean(last.isThinking)
    && last.partial === true
    && (lastItemId == null || lastItemId === event.itemId),
  )
  if (canMergeTrailing && last) {
    const next = messages.slice()
    next[next.length - 1] = {
      ...last,
      content: event.mode === 'replace' ? event.text : `${last.content || ''}${event.text}`,
      partial: true,
      streamItemId: last.streamItemId || event.itemId,
    } as ChatMessage
    return next
  }

  return [...messages, {
    role: 'thinking',
    content: event.text,
    partial: true,
    isThinking: true,
    id: `${event.itemId}-${event.sequence}`,
    streamItemId: event.itemId,
    timestamp: timestampOf(event),
  } as unknown as ChatMessage]
}

function upsertToolCall(messages: ChatMessage[], event: Extract<AgentStreamEvent, { type: 'tool_call' }>) {
  const patched = patchMessage(
    messages,
    message => message.role === 'tool_use' && matchesToolCall(message, event.toolCallId),
    message => {
      const terminal = message.toolStatus === 'completed' || message.toolStatus === 'failed'
      return {
        ...message,
        toolName: event.name || message.toolName || event.title,
        toolInput: event.input || message.toolInput,
        content: event.title || message.content,
        // Normalize legacy toolCallId rows so later stream updates keep matching.
        toolUseId: message.toolUseId || event.toolCallId,
        toolCallId: message.toolCallId || event.toolCallId,
        // tool_call has no status field; keep existing terminal status, else pending.
        toolStatus: terminal ? message.toolStatus : (message.toolStatus || 'pending'),
        partial: !terminal,
        isDelta: !terminal,
      }
    },
  )
  if (patched.found) return patched.messages
  // New tool boundary: seal any live narrative so the next text_delta opens a new bubble.
  const sealed = sealOpenNarrativeMessages(messages)
  return [...sealed, {
    role: 'tool_use',
    content: event.title || '',
    partial: true,
    isDelta: true,
    id: `tool-${event.toolCallId}`,
    toolUseId: event.toolCallId,
    toolCallId: event.toolCallId,
    toolName: event.name || event.title,
    toolInput: event.input || {},
    toolStatus: 'pending',
    timestamp: timestampOf(event),
  } as unknown as ChatMessage]
}

function ensureToolCall(messages: ChatMessage[], event: Extract<AgentStreamEvent, { type: 'tool_update' }>) {
  const exists = messages.some(message => (
    (message as StreamChatMessage).role === 'tool_use'
    && matchesToolCall(message as StreamChatMessage, event.toolCallId)
  ))
  if (exists) return messages
  const terminal = event.status === 'completed' || event.status === 'failed'
  const sealed = sealOpenNarrativeMessages(messages)
  return [...sealed, {
    role: 'tool_use',
    content: event.title || '',
    partial: !terminal,
    // Keep isDelta in lockstep with partial so tool UI (groups/cards) treats
    // in-flight tool_use as live, not settled "已发起".
    isDelta: !terminal,
    id: `tool-${event.toolCallId}`,
    toolUseId: event.toolCallId,
    toolCallId: event.toolCallId,
    toolName: event.name || 'Tool',
    toolInput: event.input || {},
    toolStatus: event.status,
    timestamp: timestampOf(event),
  } as unknown as ChatMessage]
}

function updateTool(messages: ChatMessage[], event: Extract<AgentStreamEvent, { type: 'tool_update' }>) {
  let next = ensureToolCall(messages, event)
  const terminal = event.status === 'completed' || event.status === 'failed'
  const callPatch = patchMessage(
    next,
    message => message.role === 'tool_use' && matchesToolCall(message, event.toolCallId),
    message => ({
      ...message,
      toolName: event.name || message.toolName,
      toolInput: event.input || message.toolInput,
      content: event.title || message.content,
      toolUseId: message.toolUseId || event.toolCallId,
      toolCallId: message.toolCallId || event.toolCallId,
      // ConversationView / tool groups key off toolStatus (not only partial).
      toolStatus: event.status,
      partial: !terminal,
      isDelta: !terminal,
    }),
  )
  next = callPatch.messages

  const outputText = event.resultDelta || event.output?.text || (event.status === 'failed' ? event.error || '' : '')
  const resultPatch = patchMessage(
    next,
    message => message.role === 'tool_result' && matchesToolCall(message, event.toolCallId),
    message => ({
      ...message,
      toolName: event.name || message.toolName,
      toolInput: event.input || message.toolInput,
      content: `${message.content || ''}${outputText}`,
      toolResult: `${message.toolResult || ''}${outputText}`,
      toolOutputs: event.output
        ? [...(message.toolOutputs || []), event.output]
        : message.toolOutputs,
      toolUseId: message.toolUseId || event.toolCallId,
      isDelta: !terminal,
      partial: !terminal,
      isError: event.status === 'failed',
    }),
  )
  if (resultPatch.found) return resultPatch.messages

  return [...next, {
    role: 'tool_result',
    content: outputText,
    partial: !terminal,
    id: `tool-result-${event.toolCallId}`,
    toolUseId: event.toolCallId,
    toolCallId: event.toolCallId,
    toolName: event.name,
    toolInput: event.input,
    toolResult: outputText,
    toolOutputs: event.output ? [event.output] : undefined,
    isDelta: !terminal,
    isError: event.status === 'failed',
    timestamp: timestampOf(event),
  } as unknown as ChatMessage]
}

function isTerminalToolStatus(status: string | undefined): boolean {
  return status === 'completed' || status === 'failed'
}

function finalizeMessages(messages: ChatMessage[], error?: string): ChatMessage[] {
  const resultIds = new Set(messages
    .filter(message => message.role === 'tool_result')
    .map(message => toolIdOf(message as StreamChatMessage))
    .filter((id): id is string => Boolean(id)))
  const finalized = messages.map(message => {
    const streamMessage = message as StreamChatMessage
    const openToolUse = streamMessage.role === 'tool_use'
      && !isTerminalToolStatus(streamMessage.toolStatus)
    // Terminal turns must clear *all* live markers. Leaving isDelta=true on
    // tool_use (or unfinished toolStatus) makes messageGroupHasPartial /
    // tool groups stay "执行中" and virtualization keep growing estimates.
    if (!streamMessage.partial && !streamMessage.isDelta && !openToolUse) {
      if (error && streamMessage.role === 'tool_result' && !streamMessage.isError) {
        return { ...streamMessage, isError: true } as ChatMessage
      }
      return message
    }
    const next: StreamChatMessage = {
      ...streamMessage,
      partial: false,
      isDelta: false,
      isError: error && streamMessage.role === 'tool_result' ? true : streamMessage.isError,
    }
    if (openToolUse) {
      // Match process.ts done path: settle incomplete tools when the turn ends.
      next.toolStatus = error ? 'failed' : 'completed'
    }
    return next as ChatMessage
  })

  for (const message of messages) {
    const tool = message as StreamChatMessage
    const toolId = toolIdOf(tool)
    if (tool.role !== 'tool_use' || !toolId || resultIds.has(toolId)) continue
    finalized.push({
      role: 'tool_result',
      content: error || '',
      partial: false,
      id: `tool-result-${toolId}`,
      toolUseId: toolId,
      toolCallId: tool.toolCallId || toolId,
      toolName: tool.toolName,
      toolResult: error || '',
      isDelta: false,
      isError: Boolean(error),
      timestamp: tool.timestamp || new Date().toISOString(),
    } as unknown as ChatMessage)
  }
  return finalized
}

/**
 * After silence fail-open applies a legacy chat snapshot mid-turn, re-stamp
 * live partial flags so the UI does not freeze as "执行了 / 思考完成" while the
 * turn is still streaming. Safe no-op when streaming is false.
 */
export function annotateLivePartialFlags(
  messages: ChatMessage[],
  streaming: boolean,
): ChatMessage[] {
  if (!streaming || messages.length === 0) return messages

  const completedToolIds = new Set(
    messages
      .filter(message => {
        const m = message as StreamChatMessage
        return m.role === 'tool_result' && !m.partial && !m.isDelta
      })
      .map(message => toolIdOf(message as StreamChatMessage))
      .filter((id): id is string => Boolean(id)),
  )

  let changed = false
  const next = messages.map((message, index) => {
    const m = message as StreamChatMessage
    if (m.role === 'tool_use') {
      const id = toolIdOf(m)
      const terminalStatus = m.toolStatus === 'completed' || m.toolStatus === 'failed'
      const open = !terminalStatus && (!id || !completedToolIds.has(id))
      if (open && !m.partial) {
        changed = true
        return {
          ...m,
          partial: true,
          toolUseId: m.toolUseId || m.toolCallId,
        } as ChatMessage
      }
      if (open && !m.toolUseId && m.toolCallId) {
        changed = true
        return { ...m, toolUseId: m.toolCallId } as ChatMessage
      }
      return message
    }

    // Keep the trailing narrative bubble live while the turn is still open so
    // subsequent agent:stream deltas can merge instead of forking a new box.
    if (index === messages.length - 1) {
      const isNarrative = m.role === 'assistant'
        || m.role === 'thinking'
        || Boolean(m.isThinking)
      if (isNarrative && !m.partial) {
        changed = true
        return { ...m, partial: true } as ChatMessage
      }
    }
    return message
  })

  return changed ? next : messages
}

export function reduceAgentStreamEvent(
  messages: ChatMessage[],
  currentStream: AgentSessionStreamState | undefined,
  event: AgentStreamEvent,
): AgentStreamReduction {
  const current = currentStream || createAgentSessionStreamState()
  if (!Number.isSafeInteger(event.sequence) || event.sequence <= current.lastSequence) {
    return {
      messages,
      stream: current,
      streaming: isAgentStreamActive(current),
      error: current.phase === 'error' ? current.terminalReason || '' : '',
      ignored: true,
    }
  }

  let nextMessages = messages
  const eventAt = event.timestamp ? Date.parse(event.timestamp) : NaN
  const lastEventAt = Number.isFinite(eventAt) ? eventAt : Date.now()
  // Explicit type: lastEventAt is optional on AgentSessionStreamState; without annotation,
  // the local object is inferred with required lastEventAt and breaks activate() reassignment.
  let stream: AgentSessionStreamState = { ...current, lastSequence: event.sequence, lastEventAt }
  let error = ''

  switch (event.type) {
    case 'text_delta':
      nextMessages = appendTextDelta(messages, event)
      stream = activate(stream)
      break
    case 'thinking_update':
      nextMessages = updateThinking(messages, event)
      stream = activate(stream)
      break
    case 'tool_call':
      nextMessages = upsertToolCall(messages, event)
      stream = activate(stream)
      break
    case 'tool_update':
      nextMessages = updateTool(messages, event)
      stream = activate(stream)
      break
    case 'plan':
      stream = { ...activate(stream), plan: { title: event.title, entries: event.entries } }
      break
    case 'status':
      stream = {
        ...stream,
        phase: event.status === 'idle' ? 'idle' : event.status === 'waiting' ? 'waiting_permission' : 'running',
        statusMessage: event.message,
        terminalReason: undefined,
      }
      if (event.status === 'idle') {
        // Idle ends the turn — drop live progress UI (plan/status) so the bottom panel closes.
        nextMessages = finalizeMessages(messages)
        stream = { ...stream, plan: undefined, statusMessage: undefined }
      }
      break
    case 'permission_request':
      stream = {
        ...stream,
        phase: 'waiting_permission',
        permission: event.request,
        statusMessage: undefined,
        terminalReason: undefined,
      }
      break
    case 'done':
      nextMessages = finalizeMessages(messages)
      stream = {
        ...stream,
        phase: 'done',
        permission: undefined,
        statusMessage: undefined,
        plan: undefined,
        terminalReason: event.stopReason,
      }
      break
    case 'error':
      nextMessages = finalizeMessages(messages, event.message)
      stream = {
        ...stream,
        phase: 'error',
        permission: undefined,
        statusMessage: undefined,
        plan: undefined,
        terminalReason: event.message,
      }
      error = event.message
      break
    case 'cancelled':
      nextMessages = finalizeMessages(messages)
      stream = {
        ...stream,
        phase: 'cancelled',
        permission: undefined,
        statusMessage: undefined,
        plan: undefined,
        terminalReason: event.reason,
      }
      break
  }

  // activate() / branch spreads must not drop the stamp from a successful apply.
  stream = { ...stream, lastEventAt }

  return {
    messages: nextMessages,
    stream,
    streaming: isAgentStreamActive(stream),
    error,
    ignored: false,
  }
}

export function requestAgentStreamCancellation(stream: AgentSessionStreamState | undefined) {
  return { ...(stream || createAgentSessionStreamState()), phase: 'cancelling' as const, statusMessage: undefined }
}

export function resolveAgentStreamPermission(
  stream: AgentSessionStreamState | undefined,
  requestId: string,
) {
  const current = stream || createAgentSessionStreamState()
  if (current.permission?.requestId !== requestId) return current
  return { ...current, permission: undefined, phase: 'running' as const }
}

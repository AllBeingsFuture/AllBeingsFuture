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
  isDelta?: boolean
  isError?: boolean
  isThinking?: boolean
  streamItemId?: string
  partial?: boolean
}

export interface AgentStreamReduction {
  messages: ChatMessage[]
  stream: AgentSessionStreamState
  streaming: boolean
  error: string
  ignored: boolean
}

const ACTIVE_PHASES = new Set<AgentStreamPhase>(['running', 'waiting_permission', 'cancelling'])

/** How long agent:stream may stay silent before legacy chat:update/patch/poll may resume. */
export const AGENT_STREAM_SILENCE_MS = 12_000

export function createAgentSessionStreamState(): AgentSessionStreamState {
  return { phase: 'idle', lastSequence: -1 }
}

export function isAgentStreamActive(stream: AgentSessionStreamState | undefined): boolean {
  return Boolean(stream && ACTIVE_PHASES.has(stream.phase))
}

/**
 * Prefer the normalized agent:stream path only while it is active and not silent.
 * After silence timeout, legacy chat paths fail open so a lost done/event cannot freeze the UI.
 */
export function shouldPreferAgentStream(
  stream: AgentSessionStreamState | undefined,
  now: number = Date.now(),
): boolean {
  if (!isAgentStreamActive(stream)) return false
  const lastEventAt = stream!.lastEventAt
  // No timestamp yet (e.g. manually seeded active state) — keep preferring stream.
  if (lastEventAt == null) return true
  return now - lastEventAt < AGENT_STREAM_SILENCE_MS
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
  const last = messages[messages.length - 1] as StreamChatMessage | undefined
  if (
    last?.role === 'assistant'
    && last.partial === true
    && last.streamItemId === event.itemId
  ) {
    const next = messages.slice()
    next[next.length - 1] = {
      ...last,
      content: `${last.content || ''}${event.delta}`,
      partial: true,
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
  if (
    last
    && Boolean(last.isThinking)
    && last.partial === true
    && last.streamItemId === event.itemId
  ) {
    const next = messages.slice()
    next[next.length - 1] = {
      ...last,
      content: event.mode === 'replace' ? event.text : `${last.content || ''}${event.text}`,
      partial: true,
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
    message => message.role === 'tool_use' && message.toolUseId === event.toolCallId,
    message => ({
      ...message,
      toolName: event.name || message.toolName || event.title,
      toolInput: event.input || message.toolInput,
      content: event.title || message.content,
      partial: true,
    }),
  )
  if (patched.found) return patched.messages
  // New tool boundary: seal any live narrative so the next text_delta opens a new bubble.
  const sealed = sealOpenNarrativeMessages(messages)
  return [...sealed, {
    role: 'tool_use',
    content: event.title || '',
    partial: true,
    id: `tool-${event.toolCallId}`,
    toolUseId: event.toolCallId,
    toolName: event.name || event.title,
    toolInput: event.input || {},
    timestamp: timestampOf(event),
  } as unknown as ChatMessage]
}

function ensureToolCall(messages: ChatMessage[], event: Extract<AgentStreamEvent, { type: 'tool_update' }>) {
  const exists = messages.some(message => (
    (message as StreamChatMessage).role === 'tool_use'
    && (message as StreamChatMessage).toolUseId === event.toolCallId
  ))
  if (exists) return messages
  const sealed = sealOpenNarrativeMessages(messages)
  return [...sealed, {
    role: 'tool_use',
    content: event.title || '',
    partial: true,
    id: `tool-${event.toolCallId}`,
    toolUseId: event.toolCallId,
    toolName: event.name || 'Tool',
    toolInput: event.input || {},
    timestamp: timestampOf(event),
  } as unknown as ChatMessage]
}

function updateTool(messages: ChatMessage[], event: Extract<AgentStreamEvent, { type: 'tool_update' }>) {
  let next = ensureToolCall(messages, event)
  const callPatch = patchMessage(
    next,
    message => message.role === 'tool_use' && message.toolUseId === event.toolCallId,
    message => ({
      ...message,
      toolName: event.name || message.toolName,
      toolInput: event.input || message.toolInput,
      content: event.title || message.content,
      partial: event.status !== 'completed' && event.status !== 'failed',
    }),
  )
  next = callPatch.messages

  const terminal = event.status === 'completed' || event.status === 'failed'
  const outputText = event.resultDelta || event.output?.text || (event.status === 'failed' ? event.error || '' : '')
  const resultPatch = patchMessage(
    next,
    message => message.role === 'tool_result' && message.toolUseId === event.toolCallId,
    message => ({
      ...message,
      toolName: event.name || message.toolName,
      toolInput: event.input || message.toolInput,
      content: `${message.content || ''}${outputText}`,
      toolResult: `${message.toolResult || ''}${outputText}`,
      toolOutputs: event.output
        ? [...(message.toolOutputs || []), event.output]
        : message.toolOutputs,
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
    toolName: event.name,
    toolInput: event.input,
    toolResult: outputText,
    toolOutputs: event.output ? [event.output] : undefined,
    isDelta: !terminal,
    isError: event.status === 'failed',
    timestamp: timestampOf(event),
  } as unknown as ChatMessage]
}

function finalizeMessages(messages: ChatMessage[], error?: string): ChatMessage[] {
  const resultIds = new Set(messages
    .filter(message => message.role === 'tool_result')
    .map(message => (message as StreamChatMessage).toolUseId)
    .filter(Boolean))
  const finalized = messages.map(message => {
    const streamMessage = message as StreamChatMessage
    if (!streamMessage.partial && !streamMessage.isDelta) return message
    return {
      ...streamMessage,
      partial: false,
      isDelta: streamMessage.role === 'tool_result' ? false : streamMessage.isDelta,
      isError: error && streamMessage.role === 'tool_result' ? true : streamMessage.isError,
    } as ChatMessage
  })

  for (const message of messages) {
    const tool = message as StreamChatMessage
    if (tool.role !== 'tool_use' || !tool.toolUseId || resultIds.has(tool.toolUseId)) continue
    finalized.push({
      role: 'tool_result',
      content: error || '',
      partial: false,
      id: `tool-result-${tool.toolUseId}`,
      toolUseId: tool.toolUseId,
      toolName: tool.toolName,
      toolResult: error || '',
      isDelta: false,
      isError: Boolean(error),
      timestamp: tool.timestamp || new Date().toISOString(),
    } as unknown as ChatMessage)
  }
  return finalized
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
  let stream = { ...current, lastSequence: event.sequence, lastEventAt }
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

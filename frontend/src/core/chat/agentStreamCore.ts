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

export function createAgentSessionStreamState(): AgentSessionStreamState {
  return { phase: 'idle', lastSequence: -1 }
}

export function isAgentStreamActive(stream: AgentSessionStreamState | undefined): boolean {
  return Boolean(stream && ACTIVE_PHASES.has(stream.phase))
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

function appendTextDelta(messages: ChatMessage[], event: Extract<AgentStreamEvent, { type: 'text_delta' }>) {
  // Only extend an open (partial) assistant bubble with the same stream item.
  // Finalized replies must not be reopened when a later turn streams again.
  const patched = patchMessage(
    messages,
    message => (
      message.role === 'assistant'
      && message.partial === true
      && message.streamItemId === event.itemId
    ),
    message => ({ ...message, content: `${message.content || ''}${event.delta}`, partial: true }),
  )
  if (patched.found) return patched.messages
  return [...messages, {
    role: 'assistant',
    content: event.delta,
    partial: true,
    id: event.itemId,
    streamItemId: event.itemId,
    timestamp: timestampOf(event),
  } as unknown as ChatMessage]
}

function updateThinking(messages: ChatMessage[], event: Extract<AgentStreamEvent, { type: 'thinking_update' }>) {
  const patched = patchMessage(
    messages,
    message => (
      Boolean(message.isThinking)
      && message.partial === true
      && message.streamItemId === event.itemId
    ),
    message => ({
      ...message,
      content: event.mode === 'replace' ? event.text : `${message.content || ''}${event.text}`,
      partial: true,
    }),
  )
  if (patched.found) return patched.messages
  return [...messages, {
    role: 'thinking',
    content: event.text,
    partial: true,
    isThinking: true,
    id: event.itemId,
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
  return [...messages, {
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
  return [...messages, {
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
  let stream = { ...current, lastSequence: event.sequence }
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
      if (event.status === 'idle') nextMessages = finalizeMessages(messages)
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
        terminalReason: event.reason,
      }
      break
  }

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

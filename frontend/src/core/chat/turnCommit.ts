import type { ChatMessage } from '../../../bindings/allbeingsfuture/internal/models/models'
import type { AgentStreamEvent } from '../../types/agentStreamTypes'
import type { LiveBuffer, LiveToolEntry } from '../../types/sessionStreamTypes'

/** Stream-shaped chat row (same extensions agentStreamCore uses). */
type StreamChatMessage = ChatMessage & {
  id?: string
  timestamp?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  toolOutputs?: Array<{ stream: 'stdout' | 'stderr'; text: string }>
  toolUseId?: string
  toolCallId?: string
  toolStatus?: string
  isDelta?: boolean
  isError?: boolean
  isThinking?: boolean
  streamItemId?: string
  sourceItemId?: string
  partial?: boolean
}

function toolIdOf(message: StreamChatMessage): string | undefined {
  return message.toolUseId || message.toolCallId
}

function isTerminalToolStatus(status: string | undefined): boolean {
  return status === 'completed' || status === 'failed'
}

function isOpenToolUse(message: StreamChatMessage): boolean {
  return message.role === 'tool_use' && !isTerminalToolStatus(message.toolStatus)
}

function isOpenLiveMessage(message: StreamChatMessage): boolean {
  if (message.role === 'tool_use') return isOpenToolUse(message) || Boolean(message.partial || message.isDelta)
  if (message.role === 'tool_result') return Boolean(message.partial || message.isDelta)
  if (message.role === 'assistant' || message.role === 'thinking' || message.isThinking) {
    return Boolean(message.partial)
  }
  return false
}

export function emptyLiveBuffer(): LiveBuffer {
  return { tools: [] }
}

function upsertLiveTool(tools: LiveToolEntry[], next: LiveToolEntry): LiveToolEntry[] {
  const index = tools.findIndex(tool => tool.toolCallId === next.toolCallId)
  if (index < 0) return [...tools, next]
  const copy = tools.slice()
  copy[index] = next
  return copy
}

/**
 * Apply content-bearing stream events into the live buffer only.
 * Non-content events (plan/status/permission/done/error/cancelled) leave live unchanged.
 * Returns null only when input was null and the event does not open live content.
 */
export function reduceLive(live: LiveBuffer | null, event: AgentStreamEvent): LiveBuffer | null {
  switch (event.type) {
    case 'text_delta': {
      const base = live ?? emptyLiveBuffer()
      const prev = base.assistantText
      if (prev && prev.itemId === event.itemId) {
        return {
          ...base,
          assistantText: { itemId: event.itemId, text: `${prev.text}${event.delta}` },
        }
      }
      // Different itemId (or first text): replace slot. Multi-bubble mid-turn is
      // intentionally simplified in LiveBuffer (single assistantText).
      return {
        ...base,
        assistantText: { itemId: event.itemId, text: event.delta },
      }
    }
    case 'thinking_update': {
      const base = live ?? emptyLiveBuffer()
      const prev = base.thinking
      if (prev && prev.itemId === event.itemId) {
        const text = event.mode === 'replace'
          ? event.text
          : `${prev.text}${event.text}`
        return { ...base, thinking: { itemId: event.itemId, text } }
      }
      return {
        ...base,
        thinking: { itemId: event.itemId, text: event.text },
      }
    }
    case 'tool_call': {
      const base = live ?? emptyLiveBuffer()
      const existing = base.tools.find(tool => tool.toolCallId === event.toolCallId)
      const terminal = existing && isTerminalToolStatus(existing.status)
      const next: LiveToolEntry = {
        toolCallId: event.toolCallId,
        name: event.name || existing?.name,
        title: event.title || existing?.title || event.name || 'Tool',
        status: terminal ? existing!.status : (existing?.status || 'pending'),
        input: event.input || existing?.input,
        resultText: existing?.resultText,
        outputs: existing?.outputs,
        error: existing?.error,
      }
      return { ...base, tools: upsertLiveTool(base.tools, next) }
    }
    case 'tool_update': {
      const base = live ?? emptyLiveBuffer()
      const existing = base.tools.find(tool => tool.toolCallId === event.toolCallId)
      const resultDelta = event.resultDelta || event.output?.text || ''
      const failedText = event.status === 'failed' ? (event.error || '') : ''
      const appendText = resultDelta || (existing ? '' : failedText)
      const next: LiveToolEntry = {
        toolCallId: event.toolCallId,
        name: event.name || existing?.name,
        title: event.title || existing?.title || event.name || 'Tool',
        status: event.status,
        input: event.input || existing?.input,
        resultText: `${existing?.resultText || ''}${appendText}${!resultDelta && failedText && existing ? failedText : ''}`,
        outputs: event.output
          ? [...(existing?.outputs || []), event.output]
          : existing?.outputs,
        error: event.error ?? existing?.error,
      }
      // Ensure failed tools without prior result still carry error text.
      if (event.status === 'failed' && !next.resultText && event.error) {
        next.resultText = event.error
      }
      return { ...base, tools: upsertLiveTool(base.tools, next) }
    }
    default:
      return live
  }
}

/**
 * Project live buffer into ChatMessage[] for dual-write / old UI.
 * Open tools always carry partial + isDelta true.
 */
export function materializeLive(live: LiveBuffer | null): ChatMessage[] {
  if (!live) return []
  const out: ChatMessage[] = []

  if (live.thinking) {
    out.push({
      role: 'thinking',
      content: live.thinking.text,
      partial: true,
      isThinking: true,
      id: `thinking-${live.thinking.itemId}`,
      streamItemId: live.thinking.itemId,
    } as unknown as ChatMessage)
  }

  for (const tool of live.tools) {
    const terminal = isTerminalToolStatus(tool.status)
    out.push({
      role: 'tool_use',
      content: tool.title || '',
      partial: !terminal,
      isDelta: !terminal,
      id: `tool-${tool.toolCallId}`,
      toolUseId: tool.toolCallId,
      toolCallId: tool.toolCallId,
      toolName: tool.name || tool.title || 'Tool',
      toolInput: tool.input || {},
      toolStatus: tool.status,
    } as unknown as ChatMessage)

    const hasResult = Boolean(
      tool.resultText
      || (tool.outputs && tool.outputs.length > 0)
      || tool.error
      || terminal,
    )
    if (hasResult) {
      const resultText = tool.resultText || tool.error || ''
      out.push({
        role: 'tool_result',
        content: resultText,
        partial: !terminal,
        isDelta: !terminal,
        id: `tool-result-${tool.toolCallId}`,
        toolUseId: tool.toolCallId,
        toolCallId: tool.toolCallId,
        toolName: tool.name,
        toolInput: tool.input,
        toolResult: resultText,
        toolOutputs: tool.outputs,
        isError: tool.status === 'failed',
      } as unknown as ChatMessage)
    }
  }

  if (live.assistantText) {
    out.push({
      role: 'assistant',
      content: live.assistantText.text,
      partial: true,
      id: `assistant-${live.assistantText.itemId}`,
      streamItemId: live.assistantText.itemId,
    } as unknown as ChatMessage)
  }

  return out
}

function finalizeMaterialized(messages: ChatMessage[], error?: string): ChatMessage[] {
  const resultIds = new Set(
    messages
      .filter(message => message.role === 'tool_result')
      .map(message => toolIdOf(message as StreamChatMessage))
      .filter((id): id is string => Boolean(id)),
  )

  const finalized = messages.map(message => {
    const streamMessage = message as StreamChatMessage
    const openToolUse = isOpenToolUse(streamMessage)
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
 * Finalize live into settled messages, append to committed, clear live.
 * Strategy A: turn-end commit.
 */
export function commitTurn(
  committed: ChatMessage[],
  live: LiveBuffer | null,
  error?: string,
): { committed: ChatMessage[]; live: null } {
  if (!live) {
    return { committed, live: null }
  }
  const settled = finalizeMaterialized(materializeLive(live), error)
  if (settled.length === 0) {
    return { committed, live: null }
  }
  return { committed: [...committed, ...settled], live: null }
}

/**
 * Seed committed/live from a legacy mixed agentStreamMessages buffer.
 * When streamingActive, open partial tools/text fold into live; settled prefix stays committed.
 */
export function splitMessagesToCommittedAndLive(
  messages: ChatMessage[],
  streamingActive: boolean,
): { committed: ChatMessage[]; live: LiveBuffer | null } {
  if (!streamingActive) {
    // Preserve message identity for legacy chat:update/patch dual-write.
    // Terminal agent:stream paths finalize via commitTurn / reduceAgentStreamEvent.
    return { committed: messages, live: null }
  }

  const committed: ChatMessage[] = []
  let live: LiveBuffer | null = null
  let inLiveTail = false

  const ensureLive = (): LiveBuffer => {
    if (!live) live = emptyLiveBuffer()
    return live
  }

  for (const message of messages) {
    const m = message as StreamChatMessage
    const open = isOpenLiveMessage(m)

    // Once we hit the open tail, subsequent rows fold into live (including
    // terminal tools still mid-turn under Strategy A).
    if (!inLiveTail && !open) {
      committed.push(message)
      continue
    }

    inLiveTail = true
    const buffer = ensureLive()

    if (m.role === 'thinking' || m.isThinking) {
      const itemId = m.streamItemId || m.sourceItemId || m.id || 'thinking'
      buffer.thinking = {
        itemId,
        text: m.content || '',
      }
      continue
    }

    if (m.role === 'assistant') {
      const itemId = m.streamItemId || m.sourceItemId || m.id || 'assistant'
      buffer.assistantText = {
        itemId,
        text: m.content || '',
      }
      continue
    }

    if (m.role === 'tool_use') {
      const toolCallId = toolIdOf(m) || m.id || `tool-${buffer.tools.length}`
      const existing = buffer.tools.find(tool => tool.toolCallId === toolCallId)
      buffer.tools = upsertLiveTool(buffer.tools, {
        toolCallId,
        name: m.toolName || existing?.name,
        title: m.content || existing?.title || m.toolName || 'Tool',
        status: (m.toolStatus as LiveToolEntry['status']) || existing?.status || 'pending',
        input: m.toolInput || existing?.input,
        resultText: existing?.resultText,
        outputs: existing?.outputs,
        error: existing?.error,
      })
      continue
    }

    if (m.role === 'tool_result') {
      const toolCallId = toolIdOf(m) || m.id || `tool-result-${buffer.tools.length}`
      const existing = buffer.tools.find(tool => tool.toolCallId === toolCallId)
      const status: LiveToolEntry['status'] = m.isError
        ? 'failed'
        : (m.partial || m.isDelta)
          ? (existing?.status || 'in_progress')
          : 'completed'
      buffer.tools = upsertLiveTool(buffer.tools, {
        toolCallId,
        name: m.toolName || existing?.name,
        title: existing?.title || m.toolName || 'Tool',
        status: existing && isTerminalToolStatus(existing.status) ? existing.status : status,
        input: m.toolInput || existing?.input,
        resultText: m.toolResult || m.content || existing?.resultText || '',
        outputs: m.toolOutputs || existing?.outputs,
        error: m.isError ? (m.toolResult || m.content || existing?.error) : existing?.error,
      })
      continue
    }

    // Unknown role in live tail — keep as committed fallback.
    committed.push(message)
  }

  // Active stream always exposes a live buffer (may be empty).
  return { committed, live: live ?? emptyLiveBuffer() }
}

/** Project mixed transcript for dual-write: committed + materialize(live). */
export function projectMixedMessages(
  committed: ChatMessage[],
  live: LiveBuffer | null,
): ChatMessage[] {
  const liveMessages = materializeLive(live)
  if (liveMessages.length === 0) return committed
  return [...committed, ...liveMessages]
}

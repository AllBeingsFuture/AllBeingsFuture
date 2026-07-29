/**
 * Converts bridge adapter events into the provider-neutral agent:stream contract.
 * Sequence numbers are strictly increasing per session for safe deduplication.
 */

import type { BridgeEvent } from '../bridge/types.js'
import type {
  AgentPermissionOption,
  AgentPermissionOptionKind,
  AgentPlanEntry,
  AgentPlanEntryStatus,
  AgentStreamEvent,
  AgentStreamSource,
} from './agent-stream-types.js'

interface SessionStreamState {
  sequence: number
  source: AgentStreamSource
  toolOutputText: Map<string, string>
  defaultTextItemId: string
  defaultThinkingItemId: string
}

const PERMISSION_KINDS = new Set<AgentPermissionOptionKind>([
  'allow_once',
  'allow_always',
  'reject_once',
  'reject_always',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatOutputText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function mapPlanStatus(status: unknown): AgentPlanEntryStatus {
  if (status === 'cancelled' || status === 'failed' || status === 'blocked') return 'blocked'
  if (status === 'in_progress' || status === 'completed' || status === 'pending') return status
  return 'pending'
}

function mapToolStatus(status: unknown): 'pending' | 'in_progress' | 'completed' | 'failed' {
  if (status === 'pending' || status === 'completed' || status === 'failed') return status
  if (status === 'in_progress') return 'in_progress'
  return 'in_progress'
}

function mapPermissionKind(kind: unknown): AgentPermissionOptionKind | null {
  if (typeof kind !== 'string') return null
  return PERMISSION_KINDS.has(kind as AgentPermissionOptionKind)
    ? kind as AgentPermissionOptionKind
    : null
}

function normalizePlanEntries(entries: BridgeEvent['entries']): AgentPlanEntry[] {
  if (!Array.isArray(entries)) return []
  return entries.map((entry, index) => {
    const record: Record<string, unknown> = isRecord(entry) ? entry : {}
    const content = typeof record.content === 'string'
      ? record.content
      : typeof record.title === 'string'
        ? record.title
        : `Step ${index + 1}`
    return {
      id: typeof record.id === 'string' && record.id
        ? record.id
        : `plan-entry-${index}`,
      title: content,
      status: mapPlanStatus(record.status),
    }
  })
}

function normalizePermissionOptions(options: BridgeEvent['options']): AgentPermissionOption[] {
  if (!Array.isArray(options)) return []
  const mapped: AgentPermissionOption[] = []
  for (const option of options) {
    if (!isRecord(option)) continue
    const optionId = typeof option.optionId === 'string' ? option.optionId : ''
    const label = typeof option.name === 'string'
      ? option.name
      : typeof (option as { label?: unknown }).label === 'string'
        ? String((option as { label?: unknown }).label)
        : ''
    const kind = mapPermissionKind(option.kind)
    if (!optionId || !label || !kind) continue
    mapped.push({ optionId, label, kind })
  }
  return mapped
}

export class AgentStreamNormalizer {
  private sessions = new Map<string, SessionStreamState>()

  configureSession(sessionId: string, source: AgentStreamSource): void {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      existing.source = source
      return
    }
    this.sessions.set(sessionId, {
      sequence: -1,
      source,
      toolOutputText: new Map(),
      defaultTextItemId: 'assistant-text',
      defaultThinkingItemId: 'assistant-thinking',
    })
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  normalize(sessionId: string, event: BridgeEvent): AgentStreamEvent | null {
    const state = this.ensureSession(sessionId)
    const sequence = state.sequence + 1
    const base = {
      sessionId,
      sequence,
      timestamp: new Date().toISOString(),
      source: state.source,
    }

    let streamEvent: AgentStreamEvent | null = null

    switch (event.event) {
      case 'delta': {
        const delta = event.text || ''
        if (!delta) return null
        streamEvent = {
          ...base,
          type: 'text_delta',
          itemId: event.itemId || state.defaultTextItemId,
          delta,
        }
        break
      }
      case 'thinking': {
        const text = event.text || event.thinking || ''
        if (!text) return null
        streamEvent = {
          ...base,
          type: 'thinking_update',
          itemId: event.itemId || state.defaultThinkingItemId,
          text,
          // Bridge adapters emit thinking chunks; the reducer appends by default.
          mode: 'delta',
        }
        break
      }
      case 'tool': {
        const toolCallId = event.toolCallId
          || event.tool_name
          || event.name
          || `tool-${sequence}`
        const title = event.name || event.toolName || event.tool_name || 'Tool'
        if (!event.isUpdate) {
          streamEvent = {
            ...base,
            type: 'tool_call',
            toolCallId,
            title,
            name: event.name || event.toolName || event.tool_name,
            input: event.input || event.toolInput || event.tool_input,
          }
          break
        }

        const status = mapToolStatus(event.toolStatus || event.status)
        const fullText = formatOutputText(event.output)
        const previous = state.toolOutputText.get(toolCallId) || ''
        let resultDelta: string | undefined
        if (fullText) {
          resultDelta = fullText.startsWith(previous) ? fullText.slice(previous.length) : fullText
          state.toolOutputText.set(toolCallId, fullText)
        }
        streamEvent = {
          ...base,
          type: 'tool_update',
          toolCallId,
          status,
          name: event.name || event.toolName || event.tool_name,
          title,
          input: event.input || event.toolInput || event.tool_input,
          resultDelta: resultDelta || undefined,
          output: resultDelta
            ? { stream: 'stdout', text: resultDelta }
            : undefined,
          error: status === 'failed' ? (event.error || fullText || 'Tool failed') : undefined,
        }
        break
      }
      case 'plan': {
        if (event.data && isRecord(event.data) && event.data.operation === 'removed') {
          streamEvent = { ...base, type: 'plan', entries: [] }
          break
        }
        const entries = normalizePlanEntries(event.entries)
        // Ignore plan lifecycle noise without displayable entries.
        if (!entries.length && !event.planId) return null
        streamEvent = {
          ...base,
          type: 'plan',
          title: event.planId || undefined,
          entries,
        }
        break
      }
      case 'permission': {
        // Only surface the initial request; outcomes stay internal to the adapter.
        if (event.outcome) return null
        const requestId = typeof event.requestId === 'string' ? event.requestId : ''
        const options = normalizePermissionOptions(event.options)
        if (!requestId || options.length === 0) return null
        streamEvent = {
          ...base,
          type: 'permission_request',
          request: {
            requestId,
            toolCallId: event.toolCallId,
            title: event.name || 'Permission required',
            description: typeof event.description === 'string' ? event.description : undefined,
            options,
          },
        }
        break
      }
      case 'status': {
        if (event.phase === 'running') {
          streamEvent = { ...base, type: 'status', status: 'running', message: event.detail }
          break
        }
        if (event.phase === 'idle') {
          streamEvent = { ...base, type: 'status', status: 'idle', message: event.detail }
          break
        }
        if (event.phase === 'waiting' || event.phase === 'waiting_permission') {
          streamEvent = { ...base, type: 'status', status: 'waiting', message: event.detail }
          break
        }
        if (event.phase === 'starting') {
          streamEvent = { ...base, type: 'status', status: 'starting', message: event.detail }
          break
        }
        // ready and other non-UI phases are ignored (adapter no longer forwards mode/usage/etc.)
        return null
      }
      case 'done': {
        if (event.stopReason === 'cancelled' || event.phase === 'cancelled') {
          streamEvent = {
            ...base,
            type: 'cancelled',
            reason: typeof event.stopReason === 'string' ? event.stopReason : 'cancelled',
          }
        } else {
          streamEvent = {
            ...base,
            type: 'done',
            stopReason: typeof event.stopReason === 'string' ? event.stopReason : undefined,
          }
        }
        state.toolOutputText.clear()
        break
      }
      case 'error': {
        streamEvent = {
          ...base,
          type: 'error',
          message: event.error || (typeof event.message === 'string' ? event.message : 'Unknown error'),
        }
        state.toolOutputText.clear()
        break
      }
      case 'agent_task':
        // Child-agent lifecycle stays on the existing agent:update channel.
        return null
      default:
        return null
    }

    if (!streamEvent) return null
    state.sequence = sequence
    return streamEvent
  }

  private ensureSession(sessionId: string): SessionStreamState {
    let state = this.sessions.get(sessionId)
    if (!state) {
      state = {
        sequence: -1,
        source: { kind: 'legacy-adapter' },
        toolOutputText: new Map(),
        defaultTextItemId: 'assistant-text',
        defaultThinkingItemId: 'assistant-thinking',
      }
      this.sessions.set(sessionId, state)
    }
    return state
  }
}

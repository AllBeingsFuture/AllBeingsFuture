import type { AgentPermissionResponse, AgentStreamEvent } from '../types/agentStreamTypes'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAgentStreamEvent(value: unknown): AgentStreamEvent | null {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0) return null
  if (typeof value.type !== 'string') return null

  switch (value.type) {
    case 'text_delta':
      return typeof value.itemId === 'string' && typeof value.delta === 'string' ? value as unknown as AgentStreamEvent : null
    case 'thinking_update':
      return typeof value.itemId === 'string'
        && typeof value.text === 'string'
        && (value.mode === undefined || value.mode === 'delta' || value.mode === 'replace')
        ? value as unknown as AgentStreamEvent
        : null
    case 'tool_call':
      return typeof value.toolCallId === 'string' && typeof value.title === 'string' ? value as unknown as AgentStreamEvent : null
    case 'tool_update':
      return typeof value.toolCallId === 'string'
        && ['pending', 'in_progress', 'completed', 'failed'].includes(String(value.status))
        ? value as unknown as AgentStreamEvent
        : null
    case 'plan':
      return Array.isArray(value.entries) && value.entries.every(entry => (
        isRecord(entry)
        && typeof entry.id === 'string'
        && typeof entry.title === 'string'
        && ['pending', 'in_progress', 'completed', 'blocked'].includes(String(entry.status))
      )) ? value as unknown as AgentStreamEvent : null
    case 'status':
      return ['starting', 'running', 'waiting', 'idle'].includes(String(value.status))
        ? value as unknown as AgentStreamEvent
        : null
    case 'permission_request':
      return isRecord(value.request)
        && typeof value.request.requestId === 'string'
        && typeof value.request.title === 'string'
        && Array.isArray(value.request.options)
        && value.request.options.length > 0
        && value.request.options.every(option => (
          isRecord(option)
          && typeof option.optionId === 'string'
          && typeof option.label === 'string'
          && ['allow_once', 'allow_always', 'reject_once', 'reject_always'].includes(String(option.kind))
        ))
        ? value as unknown as AgentStreamEvent
        : null
    case 'done':
    case 'cancelled':
      return value as unknown as AgentStreamEvent
    case 'error':
      return typeof value.message === 'string' ? value as unknown as AgentStreamEvent : null
    default:
      return null
  }
}

export async function respondToAgentPermission(response: AgentPermissionResponse): Promise<void> {
  const result = await window.electronAPI.invoke('agent:permission:respond', response)
  if (result && typeof result === 'object' && result.accepted === false) {
    throw new Error(typeof result.error === 'string' ? result.error : 'Permission response was rejected')
  }
}

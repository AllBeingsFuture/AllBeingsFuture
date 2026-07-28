import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAgentStreamEvent, respondToAgentPermission } from '../agentStreamIpc'

describe('parseAgentStreamEvent', () => {
  beforeEach(() => {
    vi.mocked(window.electronAPI.invoke).mockReset()
  })
  it('accepts normalized events without provider-specific fields', () => {
    expect(parseAgentStreamEvent({
      type: 'tool_call', sessionId: 'session-1', sequence: 3,
      toolCallId: 'call-1', title: 'Read configuration',
      source: { kind: 'native-acp-v1' },
    })).toEqual(expect.objectContaining({ type: 'tool_call', toolCallId: 'call-1' }))
  })

  it('rejects malformed permission prompts and unsupported events', () => {
    expect(parseAgentStreamEvent({
      type: 'permission_request', sessionId: 'session-1', sequence: 4,
      request: { requestId: 'request-1', title: 'Approve?', options: [] },
    })).toBeNull()
    expect(parseAgentStreamEvent({ type: 'codex_output', sessionId: 'session-1', sequence: 5 })).toBeNull()
  })

  it('sends permission choices over the provider-neutral response channel', async () => {
    vi.mocked(window.electronAPI.invoke).mockResolvedValue({ accepted: true })

    await respondToAgentPermission({
      sessionId: 'session-1', requestId: 'request-1', optionId: 'allow-once',
    })

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('agent:permission:respond', {
      sessionId: 'session-1', requestId: 'request-1', optionId: 'allow-once',
    })
  })
})

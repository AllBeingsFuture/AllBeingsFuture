import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../../bindings/allbeingsfuture/internal/models/models'
import { createAgentSessionStreamState, reduceAgentStreamEvent } from '../agentStreamCore'

describe('agentStreamCore', () => {
  it('appends text deltas once and ignores replayed sequence numbers', () => {
    const first = reduceAgentStreamEvent([], undefined, {
      type: 'text_delta', sessionId: 'session-1', sequence: 1, itemId: 'reply-1', delta: 'Hello ',
    })
    const second = reduceAgentStreamEvent(first.messages, first.stream, {
      type: 'text_delta', sessionId: 'session-1', sequence: 2, itemId: 'reply-1', delta: 'world',
    })
    const replay = reduceAgentStreamEvent(second.messages, second.stream, {
      type: 'text_delta', sessionId: 'session-1', sequence: 2, itemId: 'reply-1', delta: 'world',
    })

    expect(second.messages).toHaveLength(1)
    expect(second.messages[0].content).toBe('Hello world')
    expect(replay.ignored).toBe(true)
    expect(replay.messages).toBe(second.messages)
  })

  it('supports replace-style thinking updates without duplicating text', () => {
    const first = reduceAgentStreamEvent([], undefined, {
      type: 'thinking_update', sessionId: 'session-1', sequence: 1, itemId: 'thought-1', text: 'Checking', mode: 'replace',
    })
    const second = reduceAgentStreamEvent(first.messages, first.stream, {
      type: 'thinking_update', sessionId: 'session-1', sequence: 2, itemId: 'thought-1', text: 'Checking files', mode: 'replace',
    })

    expect(second.messages).toHaveLength(1)
    expect(second.messages[0]).toEqual(expect.objectContaining({
      role: 'thinking', content: 'Checking files', isThinking: true, partial: true,
    }))
  })

  it('correlates tool output with its call and finalizes the lifecycle', () => {
    const call = reduceAgentStreamEvent([], undefined, {
      type: 'tool_call', sessionId: 'session-1', sequence: 1,
      toolCallId: 'tool-1', title: 'Run tests', name: 'shell', input: { command: 'npm test' },
    })
    const output = reduceAgentStreamEvent(call.messages, call.stream, {
      type: 'tool_update', sessionId: 'session-1', sequence: 2,
      toolCallId: 'tool-1', status: 'in_progress', output: { stream: 'stdout', text: 'PASS\n' },
    })
    const complete = reduceAgentStreamEvent(output.messages, output.stream, {
      type: 'tool_update', sessionId: 'session-1', sequence: 3,
      toolCallId: 'tool-1', status: 'completed', resultDelta: 'Done',
    })

    expect(complete.messages).toHaveLength(2)
    expect(complete.messages[0]).toEqual(expect.objectContaining({
      role: 'tool_use', toolUseId: 'tool-1', partial: false,
    }))
    expect(complete.messages[1]).toEqual(expect.objectContaining({
      role: 'tool_result', toolUseId: 'tool-1', toolResult: 'PASS\nDone', isDelta: false, partial: false,
    }))
  })

  it('flushes partial messages and pending tools on terminal errors', () => {
    const messages = [
      { role: 'assistant', content: 'Partial reply', partial: true } as ChatMessage,
      { role: 'tool_use', content: '', partial: true, toolUseId: 'tool-1', toolName: 'shell' } as unknown as ChatMessage,
    ]
    const terminal = reduceAgentStreamEvent(messages, createAgentSessionStreamState(), {
      type: 'error', sessionId: 'session-1', sequence: 4, message: 'Agent disconnected',
    })

    expect(terminal.streaming).toBe(false)
    expect(terminal.error).toBe('Agent disconnected')
    expect(terminal.stream.phase).toBe('error')
    expect(terminal.messages[0]).toEqual(expect.objectContaining({ partial: false }))
    expect(terminal.messages[2]).toEqual(expect.objectContaining({
      role: 'tool_result', toolUseId: 'tool-1', isError: true, toolResult: 'Agent disconnected',
    }))
  })

  it('replaces plan and status state, then clears pending permission on completion', () => {
    const plan = reduceAgentStreamEvent([], undefined, {
      type: 'plan', sessionId: 'session-1', sequence: 1, title: 'Implementation',
      entries: [{ id: 'step-1', title: 'Inspect files', status: 'in_progress' }],
    })
    const status = reduceAgentStreamEvent(plan.messages, plan.stream, {
      type: 'status', sessionId: 'session-1', sequence: 2, status: 'running', message: 'Inspecting files',
    })
    const permission = reduceAgentStreamEvent(status.messages, status.stream, {
      type: 'permission_request', sessionId: 'session-1', sequence: 3,
      request: {
        requestId: 'permission-1',
        title: 'Allow edit?',
        options: [{ optionId: 'allow', label: 'Allow once', kind: 'allow_once' }],
      },
    })
    const done = reduceAgentStreamEvent(permission.messages, permission.stream, {
      type: 'done', sessionId: 'session-1', sequence: 4, stopReason: 'end_turn',
    })

    expect(status.stream.plan?.entries[0]?.title).toBe('Inspect files')
    expect(status.stream.statusMessage).toBe('Inspecting files')
    expect(permission.stream.phase).toBe('waiting_permission')
    expect(done.stream).toEqual(expect.objectContaining({
      phase: 'done', permission: undefined, statusMessage: undefined, terminalReason: 'end_turn',
    }))
    expect(done.streaming).toBe(false)
  })
})

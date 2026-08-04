import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../../bindings/allbeingsfuture/internal/models/models'
import type { AgentStreamEvent } from '../../../types/agentStreamTypes'
import {
  commitTurn,
  emptyLiveBuffer,
  materializeLive,
  reduceLive,
  splitMessagesToCommittedAndLive,
} from '../turnCommit'

function textDelta(sequence: number, delta: string, itemId = 'reply-1'): AgentStreamEvent {
  return {
    type: 'text_delta',
    sessionId: 's1',
    sequence,
    itemId,
    delta,
  }
}

function toolCall(sequence: number, toolCallId = 'tool-1'): AgentStreamEvent {
  return {
    type: 'tool_call',
    sessionId: 's1',
    sequence,
    toolCallId,
    title: 'Grep',
    name: 'Grep',
    input: { pattern: 'foo' },
  }
}

function toolUpdate(
  sequence: number,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  toolCallId = 'tool-1',
  extra: Partial<Extract<AgentStreamEvent, { type: 'tool_update' }>> = {},
): AgentStreamEvent {
  return {
    type: 'tool_update',
    sessionId: 's1',
    sequence,
    toolCallId,
    status,
    ...extra,
  }
}

describe('turnCommit', () => {
  it('keeps live tools out of committed while streaming (strategy A)', () => {
    let live = reduceLive(null, textDelta(1, 'Hello '))
    live = reduceLive(live, toolCall(2))
    live = reduceLive(live, toolUpdate(3, 'in_progress', 'tool-1', {
      resultDelta: 'hit\n',
    }))

    const committed: ChatMessage[] = [
      { role: 'user', content: 'search foo', partial: false } as ChatMessage,
    ]

    // Open tools only live — committed unchanged during the turn.
    expect(committed).toHaveLength(1)
    expect(committed[0].role).toBe('user')
    expect(live?.tools).toHaveLength(1)
    expect(live?.tools[0]).toEqual(expect.objectContaining({
      toolCallId: 'tool-1',
      status: 'in_progress',
      resultText: 'hit\n',
    }))
    expect(live?.assistantText?.text).toBe('Hello ')
  })

  it('materializeLive produces partial tool rows for open tools', () => {
    let live = reduceLive(null, toolCall(1))
    live = reduceLive(live, toolUpdate(2, 'in_progress', 'tool-1', {
      output: { stream: 'stdout', text: 'partial\n' },
    }))

    const rows = materializeLive(live)
    const toolUse = rows.find(message => message.role === 'tool_use')
    const toolResult = rows.find(message => message.role === 'tool_result')

    expect(toolUse).toEqual(expect.objectContaining({
      role: 'tool_use',
      toolUseId: 'tool-1',
      partial: true,
      isDelta: true,
      toolStatus: 'in_progress',
    }))
    expect(toolResult).toEqual(expect.objectContaining({
      role: 'tool_result',
      toolUseId: 'tool-1',
      partial: true,
      isDelta: true,
      toolResult: 'partial\n',
    }))
  })

  it('settle commit moves tools+text into committed and clears live', () => {
    const prior: ChatMessage[] = [
      { role: 'user', content: 'go', partial: false } as ChatMessage,
    ]
    let live = reduceLive(null, textDelta(1, 'Working'))
    live = reduceLive(live, toolCall(2))
    live = reduceLive(live, toolUpdate(3, 'completed', 'tool-1', {
      resultDelta: 'done',
    }))

    const settled = commitTurn(prior, live)
    expect(settled.live).toBeNull()
    expect(settled.committed[0]).toEqual(expect.objectContaining({
      role: 'user', content: 'go',
    }))

    const tools = settled.committed.filter(message => message.role === 'tool_use')
    const results = settled.committed.filter(message => message.role === 'tool_result')
    const assistants = settled.committed.filter(message => message.role === 'assistant')

    expect(tools).toHaveLength(1)
    expect(tools[0]).toEqual(expect.objectContaining({
      role: 'tool_use',
      toolUseId: 'tool-1',
      partial: false,
      isDelta: false,
      toolStatus: 'completed',
    }))
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(expect.objectContaining({
      role: 'tool_result',
      partial: false,
      isDelta: false,
      toolResult: 'done',
    }))
    expect(assistants).toHaveLength(1)
    expect(assistants[0]).toEqual(expect.objectContaining({
      role: 'assistant',
      content: 'Working',
      partial: false,
    }))
  })

  it('commitTurn on error fails open tools and clears live', () => {
    let live = reduceLive(null, toolCall(1))
    const settled = commitTurn([], live, 'boom')
    expect(settled.live).toBeNull()
    expect(settled.committed[0]).toEqual(expect.objectContaining({
      role: 'tool_use',
      toolStatus: 'failed',
      partial: false,
      isDelta: false,
    }))
    expect(settled.committed[1]).toEqual(expect.objectContaining({
      role: 'tool_result',
      isError: true,
      toolResult: 'boom',
    }))
  })

  it('splitMessagesToCommittedAndLive seeds open tools into live when active', () => {
    const messages = [
      { role: 'user', content: 'hi', partial: false } as ChatMessage,
      {
        role: 'tool_use',
        content: 'Grep',
        partial: true,
        isDelta: true,
        toolUseId: 't1',
        toolStatus: 'in_progress',
        toolName: 'Grep',
      } as unknown as ChatMessage,
      {
        role: 'assistant',
        content: '…',
        partial: true,
        streamItemId: 'a1',
      } as unknown as ChatMessage,
    ]

    const { committed, live } = splitMessagesToCommittedAndLive(messages, true)
    expect(committed).toHaveLength(1)
    expect(committed[0].role).toBe('user')
    expect(live).not.toBeNull()
    expect(live!.tools).toHaveLength(1)
    expect(live!.tools[0].toolCallId).toBe('t1')
    expect(live!.assistantText?.text).toBe('…')
  })

  it('splitMessagesToCommittedAndLive clears live when not streaming (preserves rows)', () => {
    const messages = [
      {
        role: 'assistant',
        content: 'done',
        partial: true,
      } as ChatMessage,
    ]
    const { committed, live } = splitMessagesToCommittedAndLive(messages, false)
    expect(live).toBeNull()
    // Legacy dual-write keeps message identity; finalize is commitTurn's job.
    expect(committed[0]).toEqual(expect.objectContaining({
      role: 'assistant',
      content: 'done',
      partial: true,
    }))
  })

  it('emptyLiveBuffer starts with empty tools', () => {
    expect(emptyLiveBuffer()).toEqual({ tools: [] })
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import type { AgentStreamEvent } from '../../types/agentStreamTypes'
import { useSessionStreamStore } from '../sessionStreamStore'

function textDelta(
  sessionId: string,
  sequence: number,
  delta: string,
  itemId = 'reply-1',
): AgentStreamEvent {
  return {
    type: 'text_delta',
    sessionId,
    sequence,
    itemId,
    delta,
  }
}

function toolCall(
  sessionId: string,
  sequence: number,
  toolCallId = 'tool-1',
): AgentStreamEvent {
  return {
    type: 'tool_call',
    sessionId,
    sequence,
    toolCallId,
    title: 'Bash',
    name: 'Bash',
  }
}

function done(sessionId: string, sequence: number): AgentStreamEvent {
  return {
    type: 'done',
    sessionId,
    sequence,
    stopReason: 'end_turn',
  }
}

describe('sessionStreamStore', () => {
  beforeEach(() => {
    useSessionStreamStore.getState().resetForTests()
  })

  it('applyBatch keeps text+tool only in live; done commits', () => {
    const store = useSessionStreamStore.getState()
    store.applyBatch('parent-1', [
      textDelta('parent-1', 1, 'Looking up'),
      toolCall('parent-1', 2),
    ])

    let entry = useSessionStreamStore.getState().getEntry('parent-1')
    expect(entry).toBeDefined()
    expect(entry!.committed).toEqual([])
    expect(entry!.live).not.toBeNull()
    expect(entry!.live!.assistantText?.text).toBe('Looking up')
    expect(entry!.live!.tools).toHaveLength(1)
    expect(entry!.live!.tools[0].toolCallId).toBe('tool-1')
    expect(entry!.stream.phase).toBe('running')

    // Open tools must not appear in committed mid-turn.
    expect(entry!.committed.some(message => message.role === 'tool_use')).toBe(false)

    store.applyBatch('parent-1', [done('parent-1', 3)])
    entry = useSessionStreamStore.getState().getEntry('parent-1')
    expect(entry!.live).toBeNull()
    expect(entry!.stream.phase).toBe('done')
    expect(entry!.committed.some(message => message.role === 'tool_use')).toBe(true)
    expect(entry!.committed.some(message => message.role === 'assistant')).toBe(true)
    const tool = entry!.committed.find(message => message.role === 'tool_use')
    expect(tool).toEqual(expect.objectContaining({
      partial: false,
      isDelta: false,
    }))
  })

  it('setScrollMode follow/free; pinFollowOnSelect resets to follow', () => {
    const store = useSessionStreamStore.getState()
    store.ensureEntry('s1')
    store.setScrollMode('s1', 'free')
    expect(useSessionStreamStore.getState().getEntry('s1')!.viewport.scrollMode).toBe('free')

    store.pinFollowOnSelect('s1')
    expect(useSessionStreamStore.getState().getEntry('s1')!.viewport.scrollMode).toBe('follow')

    store.setScrollMode('s1', 'follow')
    expect(useSessionStreamStore.getState().getEntry('s1')!.viewport.scrollMode).toBe('follow')
  })

  it('parent/child different sessionIds are independent', () => {
    const store = useSessionStreamStore.getState()
    store.applyBatch('parent-a', [textDelta('parent-a', 1, 'parent text')])
    store.applyBatch('child-b', [
      textDelta('child-b', 1, 'child text'),
      toolCall('child-b', 2, 'child-tool'),
    ])

    const parent = useSessionStreamStore.getState().getEntry('parent-a')!
    const child = useSessionStreamStore.getState().getEntry('child-b')!

    expect(parent.live?.assistantText?.text).toBe('parent text')
    expect(parent.live?.tools).toHaveLength(0)
    expect(child.live?.assistantText?.text).toBe('child text')
    expect(child.live?.tools).toHaveLength(1)
    expect(child.live?.tools[0].toolCallId).toBe('child-tool')

    // Committing child must not touch parent.
    store.applyBatch('child-b', [done('child-b', 3)])
    const parentAfter = useSessionStreamStore.getState().getEntry('parent-a')!
    const childAfter = useSessionStreamStore.getState().getEntry('child-b')!
    expect(parentAfter.live?.assistantText?.text).toBe('parent text')
    expect(childAfter.live).toBeNull()
    expect(childAfter.committed.some(message => message.role === 'assistant')).toBe(true)
  })

  it('replaceCommitted keeps live while stream is active', () => {
    const store = useSessionStreamStore.getState()
    store.applyBatch('s1', [textDelta('s1', 1, 'live')])
    store.replaceCommitted('s1', [
      { role: 'user', content: 'history', partial: false } as never,
    ])
    const entry = useSessionStreamStore.getState().getEntry('s1')!
    expect(entry.committed).toHaveLength(1)
    expect(entry.committed[0].content).toBe('history')
    expect(entry.live?.assistantText?.text).toBe('live')
  })

  it('clearSession removes entry', () => {
    const store = useSessionStreamStore.getState()
    store.ensureEntry('gone')
    store.clearSession('gone')
    expect(useSessionStreamStore.getState().getEntry('gone')).toBeUndefined()
  })
})

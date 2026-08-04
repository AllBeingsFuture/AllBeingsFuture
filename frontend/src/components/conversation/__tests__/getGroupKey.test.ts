import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../../bindings/allbeingsfuture/internal/models/models'
import { getGroupKey } from '../ConversationView'

type Group = Parameters<typeof getGroupKey>[1]

function messageGroup(
  type: Group['type'],
  index: number,
  messages: Array<Partial<ChatMessage> & Record<string, unknown>>,
): Group {
  return {
    type,
    index,
    messages: messages as ChatMessage[],
  }
}

describe('getGroupKey', () => {
  it('prefers stable stream/tool ids over shifting array index', () => {
    const beforeInsert = messageGroup('message', 2, [
      { role: 'assistant', content: 'tail', id: 'reply-1-3', streamItemId: 'reply-1', partial: true },
    ])
    // Tools inserted above shift start index 2 → 4; key must stay the same.
    const afterInsert = messageGroup('message', 4, [
      { role: 'assistant', content: 'tail longer', id: 'reply-1-3', streamItemId: 'reply-1', partial: true },
    ])

    expect(getGroupKey('s1', beforeInsert)).toBe(getGroupKey('s1', afterInsert))
    expect(getGroupKey('s1', beforeInsert)).toContain('reply-1')
    expect(getGroupKey('s1', beforeInsert)).not.toMatch(/-i2$/)
  })

  it('keys tool groups by toolUseId/toolCallId so multi-tool merges stay stable', () => {
    const oneTool = messageGroup('tool_group', 3, [
      { role: 'tool_use', toolUseId: 'call-a', content: '' },
    ])
    const twoTools = messageGroup('tool_group', 3, [
      { role: 'tool_use', toolUseId: 'call-a', content: '' },
      { role: 'tool_result', toolUseId: 'call-a', content: 'ok' },
      { role: 'tool_use', toolUseId: 'call-b', content: '' },
    ])

    expect(getGroupKey('s1', oneTool)).toBe('s1-tool_group-call-a')
    expect(getGroupKey('s1', twoTools)).toBe('s1-tool_group-call-a')
  })

  it('keys child agents by childSessionId only (index must not matter)', () => {
    const a = {
      type: 'child_agent' as const,
      index: 1,
      messages: [] as ChatMessage[],
      childSessionId: 'child-9',
    }
    const b = { ...a, index: 7 }
    expect(getGroupKey('s1', a)).toBe('s1-child-child-9')
    expect(getGroupKey('s1', b)).toBe('s1-child-child-9')
  })

  it('falls back to index only when no stable ids exist', () => {
    const group = messageGroup('message', 5, [{ role: 'assistant', content: 'legacy' }])
    expect(getGroupKey('s1', group)).toBe('s1-message-i5')
  })
})

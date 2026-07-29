import { describe, expect, it } from 'vitest'
import { estimateMessageGroupHeight } from '../ConversationView'

function makeGroup(
  type: 'message' | 'tool_group' | 'thinking' | 'child_agent',
  messages: Array<Record<string, unknown>>,
) {
  return { type, messages, index: 0 } as any
}

describe('estimateMessageGroupHeight', () => {
  it('estimates thinking groups at collapsed height regardless of content length', () => {
    const longThinking = 'x'.repeat(5000)
    const short = estimateMessageGroupHeight(makeGroup('thinking', [{ role: 'thinking', content: 'hi' }]))
    const long = estimateMessageGroupHeight(makeGroup('thinking', [{ role: 'thinking', content: longThinking }]))

    expect(short).toBe(44)
    expect(long).toBe(44)
    // Must not use content-length scaling that produced 100s–1400px gaps.
    expect(long).toBeLessThan(80)
  })

  it('adds image height for user messages with images', () => {
    const textOnly = estimateMessageGroupHeight(makeGroup('message', [
      { role: 'user', content: 'see screenshot' },
    ]))
    const withImages = estimateMessageGroupHeight(makeGroup('message', [
      { role: 'user', content: 'see screenshot', images: ['data:image/png;base64,aaa', 'data:image/png;base64,bbb'] },
    ]))

    expect(withImages).toBeGreaterThan(textOnly)
    expect(withImages - textOnly).toBe(480) // 2 * 240
  })

  it('keeps tool_group / child_agent estimates independent of thinking content length', () => {
    expect(estimateMessageGroupHeight(makeGroup('tool_group', [
      { role: 'tool_use', content: '' },
      { role: 'tool_use', content: '' },
    ]))).toBe(Math.max(160, 88 + 2 * 160))

    expect(estimateMessageGroupHeight(makeGroup('child_agent', [
      { role: 'assistant', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'assistant', content: 'c' },
    ]))).toBe(Math.max(160, 160 + 3 * 64))
  })
})

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

  it('uses a tighter height model for partial streaming messages', () => {
    const partial = estimateMessageGroupHeight(makeGroup('message', [
      { role: 'assistant', content: 'x'.repeat(200), partial: true },
    ]))
    const complete = estimateMessageGroupHeight(makeGroup('message', [
      { role: 'assistant', content: 'x'.repeat(200), partial: false },
    ]))

    // Partial estimate tracks plain pre-wrap growth; completed keeps a mild history pad.
    expect(partial).toBeLessThan(complete)
    expect(partial).toBeGreaterThan(72)
  })

  it('does not massively overestimate settled long assistant messages', () => {
    // Old content/6 * 22 formula hit ~4000px on multi-k char replies and left blank
    // bottom gaps under stick-to-bottom when measured cache was cold.
    const longBody = 'word '.repeat(800) // ~4000 chars of prose-like content
    const complete = estimateMessageGroupHeight(makeGroup('message', [
      { role: 'assistant', content: longBody, partial: false },
    ]))
    const partial = estimateMessageGroupHeight(makeGroup('message', [
      { role: 'assistant', content: longBody, partial: true },
    ]))

    expect(complete).toBeGreaterThan(partial * 0.8)
    // Roomier than partial, but far below the old content/6 * 22 path (~4000 cap).
    expect(complete).toBeLessThan(3400)
    const oldAggressive = Math.min(4000, 120 + Math.ceil(longBody.length / 6) * 22)
    expect(complete).toBeLessThan(oldAggressive)
    expect(oldAggressive - complete).toBeGreaterThan(500)
  })

  it('keeps tool_group / child_agent estimates independent of thinking content length', () => {
    // Settled tool groups default to a compact header height.
    expect(estimateMessageGroupHeight(makeGroup('tool_group', [
      { role: 'tool_use', content: '' },
      { role: 'tool_use', content: '' },
    ]))).toBe(88)

    // In-flight tool groups grow so stick-to-bottom tracks the open list.
    expect(estimateMessageGroupHeight(makeGroup('tool_group', [
      { role: 'tool_use', content: '', partial: true },
      { role: 'tool_result', content: 'out', isDelta: true },
    ]))).toBe(Math.max(160, 88 + 2 * 80))

    expect(estimateMessageGroupHeight(makeGroup('child_agent', [
      { role: 'assistant', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'assistant', content: 'c' },
    ]))).toBe(Math.max(160, 160 + 3 * 64))
  })

  it('caps partial single tool_group height and does not scale with unrelated content bulk', () => {
    const single = estimateMessageGroupHeight(makeGroup('tool_group', [
      { role: 'tool_use', content: '', partial: true, toolName: 'wait_agent_idle' },
    ]))
    const bulky = estimateMessageGroupHeight(makeGroup('tool_group', [
      {
        role: 'tool_use',
        content: 'x'.repeat(20_000),
        partial: true,
        toolName: 'wait_agent_idle',
      },
      {
        role: 'tool_result',
        content: 'y'.repeat(20_000),
        isDelta: true,
      },
    ]))

    expect(single).toBe(Math.max(160, 88 + 80))
    // Still only message-count based — must not balloon into multi-k blank gaps.
    expect(bulky).toBe(Math.max(160, 88 + 2 * 80))
    expect(bulky).toBeLessThan(400)
  })
})

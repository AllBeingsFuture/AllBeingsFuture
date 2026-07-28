import { describe, expect, it } from 'vitest'
import { ADAPTER_OPTIONS } from '../ProviderForm'

describe('Provider adapter options', () => {
  it('exposes ACP stdio as a first-class adapter for edit/create flow', () => {
    const keys = ADAPTER_OPTIONS.map((option) => option.key)
    expect(keys).toContain('claude-sdk')
    expect(keys).toContain('codex-appserver')
    expect(keys).toContain('gemini-headless')
    expect(keys).toContain('opencode-sdk')
    expect(keys).toContain('openai-api')
    expect(keys).toContain('acp')

    const acp = ADAPTER_OPTIONS.find((option) => option.key === 'acp')
    expect(acp?.label).toMatch(/ACP/i)
  })

  it('does not invent private per-model adapter types', () => {
    const keys = ADAPTER_OPTIONS.map((option) => option.key)
    expect(keys).not.toContain('grok-sdk')
    expect(keys).not.toContain('qwen-sdk')
    expect(keys).not.toContain('kimi-sdk')
    expect(keys).not.toContain('copilot-sdk')
  })
})

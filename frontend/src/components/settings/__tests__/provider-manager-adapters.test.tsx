import { describe, expect, it } from 'vitest'
import { ADAPTER_OPTIONS } from '../ProviderForm'
import { resolveAdapterBadge } from '../../../utils/providerDisplay'

describe('Provider adapter options', () => {
  it('exposes only ACP stdio and OpenAI API as selectable adapters', () => {
    const keys = ADAPTER_OPTIONS.map((option) => option.key)
    expect(keys).toContain('acp')
    expect(keys).toContain('openai-api')
    expect(keys).not.toContain('claude-sdk')
    expect(keys).not.toContain('codex-appserver')
    expect(keys).not.toContain('gemini-headless')
    expect(keys).not.toContain('opencode-sdk')

    const acp = ADAPTER_OPTIONS.find((option) => option.key === 'acp')
    expect(acp?.label).toMatch(/ACP/i)
    expect(acp?.label).toMatch(/stdio/i)

    const openai = ADAPTER_OPTIONS.find((option) => option.key === 'openai-api')
    expect(openai?.label).not.toMatch(/ACP/i)
  })

  it('does not invent private per-model adapter types', () => {
    const keys = ADAPTER_OPTIONS.map((option) => option.key)
    expect(keys).not.toContain('grok-sdk')
    expect(keys).not.toContain('qwen-sdk')
    expect(keys).not.toContain('kimi-sdk')
    expect(keys).not.toContain('copilot-sdk')
  })

  it('UI badge shows ACP v1/stdio for agents and never for openai-api', () => {
    expect(resolveAdapterBadge('acp')).toEqual({ label: 'ACP v1 / stdio', color: '#A78BFA' })
    expect(resolveAdapterBadge('acp-stdio')).toEqual({ label: 'ACP v1 / stdio', color: '#A78BFA' })
    expect(resolveAdapterBadge('claude-sdk').label).toBe('ACP v1 / stdio')
    expect(resolveAdapterBadge('codex-appserver').label).toBe('ACP v1 / stdio')
    expect(resolveAdapterBadge('openai-api')).toEqual({ label: 'OpenAI API', color: '#10B981' })
    expect(resolveAdapterBadge('openai-api').label).not.toMatch(/ACP/i)
  })
})

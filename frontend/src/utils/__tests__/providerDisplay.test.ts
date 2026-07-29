import { describe, expect, it } from 'vitest'
import { resolveAdapterBadge, resolveProviderDisplayInfo } from '../providerDisplay'
import type { AIProvider } from '../../types/models'

function provider(partial: Partial<AIProvider> & Pick<AIProvider, 'id' | 'name' | 'adapterType'>): AIProvider {
  return {
    command: '',
    isBuiltin: true,
    envOverrides: '',
    executablePath: '',
    nodeVersion: '',
    autoAcceptFlag: '',
    resumeFlag: '',
    defaultArgs: '',
    autoAcceptArg: '',
    resumeArg: '',
    sessionIdDetection: '',
    resumeFormat: '',
    sessionIdPattern: '',
    gitBashPath: '',
    defaultModel: '',
    maxOutputTokens: 0,
    reasoningEffort: '',
    preferResponsesApi: false,
    sortOrder: 0,
    isEnabled: true,
    createdAt: '',
    updatedAt: '',
    ...partial,
  }
}

describe('providerDisplay', () => {
  it('labels all eight built-in ACP providers by id', () => {
    expect(resolveProviderDisplayInfo('claude-code').label).toBe('Claude Code')
    expect(resolveProviderDisplayInfo('codex').label).toBe('Codex CLI')
    expect(resolveProviderDisplayInfo('gemini-cli').label).toBe('Gemini CLI')
    expect(resolveProviderDisplayInfo('opencode').label).toBe('OpenCode')
    expect(resolveProviderDisplayInfo('grok-build').label).toBe('Grok Build')
    expect(resolveProviderDisplayInfo('qwen-code').label).toBe('Qwen Code')
    expect(resolveProviderDisplayInfo('kimi-cli').label).toBe('Kimi CLI')
    expect(resolveProviderDisplayInfo('github-copilot').label).toBe('GitHub Copilot CLI')
  })

  it('uses ACP adapter color for native ACP providers', () => {
    const providers = [
      provider({ id: 'grok-build', name: 'Grok Build', adapterType: 'acp', command: 'grok', defaultArgs: 'agent stdio' }),
      provider({ id: 'claude-code', name: 'Claude Code', adapterType: 'acp', command: 'claude-agent-acp' }),
      provider({ id: 'codex', name: 'Codex CLI', adapterType: 'acp', command: 'codex-acp' }),
    ]
    expect(resolveProviderDisplayInfo('grok-build', providers).label).toBe('Grok Build')
    expect(resolveProviderDisplayInfo('claude-code', providers).color).toBe('#58A6FF')
    expect(resolveProviderDisplayInfo('codex', providers).color).toBe('#F97316')
  })

  it('never labels openai-api as ACP', () => {
    const providers = [
      provider({ id: 'my-api', name: 'My Proxy', adapterType: 'openai-api', command: '' }),
    ]
    const badge = resolveAdapterBadge('openai-api')
    expect(badge.label).toBe('OpenAI API')
    expect(badge.label).not.toMatch(/ACP/i)
    expect(resolveProviderDisplayInfo('my-api', providers).color).toBe('#10B981')
  })
})

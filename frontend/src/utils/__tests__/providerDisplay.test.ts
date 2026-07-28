import { describe, expect, it } from 'vitest'
import { resolveProviderDisplayInfo } from '../providerDisplay'
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
  it('labels built-in ACP providers by id when name list is empty', () => {
    expect(resolveProviderDisplayInfo('grok-build').label).toBe('Grok Build')
    expect(resolveProviderDisplayInfo('qwen-code').label).toBe('Qwen Code')
    expect(resolveProviderDisplayInfo('kimi-cli').label).toBe('Kimi CLI')
    expect(resolveProviderDisplayInfo('github-copilot').label).toBe('GitHub Copilot CLI')
  })

  it('uses ACP adapter color for native ACP providers', () => {
    const providers = [
      provider({ id: 'grok-build', name: 'Grok Build', adapterType: 'acp', command: 'grok', defaultArgs: 'agent stdio' }),
    ]
    const info = resolveProviderDisplayInfo('grok-build', providers)
    expect(info.label).toBe('Grok Build')
    expect(info.color).toBe('#A78BFA')
  })

  it('keeps legacy providers unchanged', () => {
    expect(resolveProviderDisplayInfo('claude-code').label).toBe('Claude Code')
    expect(resolveProviderDisplayInfo('codex').label).toBe('Codex CLI')
  })
})

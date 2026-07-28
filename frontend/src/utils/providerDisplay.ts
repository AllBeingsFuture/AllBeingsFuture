import type { AIProvider } from '../types/models'

const PROVIDER_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex CLI',
  'gemini-cli': 'Gemini CLI',
  iflow: 'iFlow CLI',
  'iflow-cli': 'iFlow CLI',
  opencode: 'OpenCode',
  'openai-api': 'OpenAI API',
  'grok-build': 'Grok Build',
  'qwen-code': 'Qwen Code',
  'kimi-cli': 'Kimi CLI',
  'github-copilot': 'GitHub Copilot CLI',
}

const PROVIDER_COLORS: Record<string, string> = {
  'claude-code': '#58A6FF',
  'claude-sdk': '#58A6FF',
  iflow: '#A78BFA',
  'iflow-cli': '#A78BFA',
  'iflow-acp': '#A78BFA',
  codex: '#F97316',
  'codex-appserver': '#F97316',
  'gemini-cli': '#34D399',
  'gemini-headless': '#34D399',
  opencode: '#FB923C',
  'opencode-sdk': '#FB923C',
  'openai-api': '#10B981',
  'grok-build': '#E8B84A',
  'qwen-code': '#6366F1',
  'kimi-cli': '#38BDF8',
  'github-copilot': '#A3E635',
  acp: '#A78BFA',
  'acp-stdio': '#A78BFA',
}

export function resolveProviderDisplayInfo(
  providerId?: string,
  providers: AIProvider[] = [],
): { label: string; color: string } {
  if (!providerId) {
    return { label: 'Unknown', color: '#6B7280' }
  }

  const provider = providers.find(item => item.id === providerId)
  const label = provider?.name || PROVIDER_LABELS[providerId] || providerId.slice(0, 8)
  const colorKey = provider?.adapterType || providerId
  const color = PROVIDER_COLORS[colorKey] || '#6B7280'

  return { label, color }
}

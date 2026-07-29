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
  iflow: '#A78BFA',
  'iflow-cli': '#A78BFA',
  'iflow-acp': '#A78BFA',
  codex: '#F97316',
  'gemini-cli': '#34D399',
  opencode: '#FB923C',
  'openai-api': '#10B981',
  'grok-build': '#E8B84A',
  'qwen-code': '#6366F1',
  'kimi-cli': '#38BDF8',
  'github-copilot': '#A3E635',
  // Shared ACP badge color for all ACP agents
  acp: '#A78BFA',
  'acp-stdio': '#A78BFA',
}

/** Adapter badge labels shown in provider UI. OpenAI-compatible API is never labeled ACP. */
export function resolveAdapterBadge(adapterType?: string): { label: string; color: string } {
  const t = (adapterType || '').toLowerCase()
  if (t === 'openai-api') {
    return { label: 'OpenAI API', color: PROVIDER_COLORS['openai-api'] }
  }
  if (t === 'acp' || t === 'acp-stdio') {
    return { label: 'ACP v1 / stdio', color: PROVIDER_COLORS.acp }
  }
  // Retired built-in types display as ACP after unification
  if (
    t === 'claude-sdk'
    || t === 'codex-appserver'
    || t === 'gemini-headless'
    || t === 'opencode-sdk'
  ) {
    return { label: 'ACP v1 / stdio', color: PROVIDER_COLORS.acp }
  }
  return { label: adapterType || 'Unknown', color: '#6B7280' }
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
  // Prefer per-provider brand color; fall back to ACP badge color for native ACP agents
  const color =
    PROVIDER_COLORS[providerId]
    || (provider?.adapterType === 'openai-api'
      ? PROVIDER_COLORS['openai-api']
      : PROVIDER_COLORS[provider?.adapterType || ''] || PROVIDER_COLORS.acp)

  return { label, color }
}

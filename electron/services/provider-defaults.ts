/**
 * Canonical built-in AI provider presets.
 *
 * All built-in CLI agents use the shared AcpAdapter (stdio NDJSON JSON-RPC v1).
 * OpenAI-compatible HTTP APIs remain a separate non-agent adapter type.
 *
 * ACP launch commands come only from the official ACP registry / CLI --help
 * verification — never invent unusable presets.
 */

export type BuiltinAdapterType = 'openai-api' | 'acp'

export interface BuiltinProviderDefault {
  id: string
  name: string
  command: string
  adapterType: BuiltinAdapterType
  /** Extra argv tokens appended after the resolved command (ACP mode flags). */
  defaultArgs: string
  isBuiltin: true
  isEnabled: boolean
  sortOrder: number
  /**
   * Short note describing how ACP mode was verified (for tests/docs/report).
   * Not persisted to the database.
   */
  acpVerification?: string
}

/** Built-in provider ids that were historically non-ACP and require DB upgrade. */
export const LEGACY_BUILTIN_ACP_UPGRADE_IDS = [
  'claude-code',
  'codex',
  'gemini-cli',
  'opencode',
] as const

/** Adapter types that must no longer be selected for built-in CLI agents. */
export const RETIRED_BUILTIN_ADAPTER_TYPES = [
  'claude-sdk',
  'codex-appserver',
  'gemini-headless',
  'opencode-sdk',
] as const

/**
 * Built-in CLI providers seeded into SQLite on migrate.
 * Every entry uses adapterType `acp` and is dispatched through AcpAdapter.
 */
export const BUILTIN_PROVIDER_DEFAULTS: readonly BuiltinProviderDefault[] = [
  {
    id: 'grok-build',
    name: 'Grok Build',
    command: 'grok',
    adapterType: 'acp',
    // Local CLI: `grok agent --help` → stdio; registry: npx @xai-official/grok agent stdio
    defaultArgs: 'agent stdio',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 1,
    acpVerification:
      'Local `grok agent stdio --help` + official ACP registry grok-build/agent.json (agent stdio)',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    // Official ACP registry: @agentclientprotocol/claude-agent-acp (no native claude --acp).
    // Thin JS wrapper may ship in the app; host Claude CLI is resolved like Grok
    // (PATH / CLAUDE_CODE_EXECUTABLE / provider executablePath) — never pack platform natives.
    command: 'claude-agent-acp',
    adapterType: 'acp',
    defaultArgs: '',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 2,
    acpVerification:
      'Official ACP registry claude-acp/agent.json → claude-agent-acp JS wrapper; host Claude via CLAUDE_CODE_EXECUTABLE / CLAUDE_PATH / PATH (no packed platform binary)',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    // Official ACP registry: @agentclientprotocol/codex-acp (codex app-server is not ACP).
    // Thin JS wrapper may ship; host `codex` via CODEX_PATH / PATH like Grok — no packed natives.
    command: 'codex-acp',
    adapterType: 'acp',
    defaultArgs: '',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 3,
    acpVerification:
      'Official ACP registry codex-acp/agent.json → codex-acp JS wrapper; host codex via CODEX_PATH / PATH (no packed @openai/codex-* platform packages)',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    command: 'gemini',
    adapterType: 'acp',
    // Official registry args: --acp
    defaultArgs: '--acp',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 4,
    acpVerification:
      'Official ACP registry gemini/agent.json → @google/gemini-cli --acp (native ACP)',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    adapterType: 'acp',
    // Official registry binary args: acp
    defaultArgs: 'acp',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 5,
    acpVerification:
      'Official ACP registry opencode/agent.json → opencode acp (native ACP subcommand)',
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    command: 'qwen',
    adapterType: 'acp',
    // Official registry args
    defaultArgs: '--acp --experimental-skills',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 6,
    acpVerification:
      'Official ACP registry qwen-code/agent.json → --acp --experimental-skills',
  },
  {
    id: 'kimi-cli',
    name: 'Kimi CLI',
    command: 'kimi',
    adapterType: 'acp',
    // Official README / registry: kimi acp
    defaultArgs: 'acp',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 7,
    acpVerification:
      'Official ACP registry kimi/agent.json → kimi acp',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot CLI',
    command: 'copilot',
    adapterType: 'acp',
    // Official ACP registry github-copilot-cli: --acp
    defaultArgs: '--acp',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 8,
    acpVerification:
      'Official ACP registry github-copilot-cli/agent.json → copilot --acp',
  },
] as const

export function getBuiltinProviderDefaults(): BuiltinProviderDefault[] {
  return BUILTIN_PROVIDER_DEFAULTS.map((entry) => ({ ...entry }))
}

export function getAcpBuiltinProviders(): BuiltinProviderDefault[] {
  return getBuiltinProviderDefaults().filter((entry) => entry.adapterType === 'acp')
}

export function getBuiltinProviderDefaultById(id: string): BuiltinProviderDefault | undefined {
  return BUILTIN_PROVIDER_DEFAULTS.find((entry) => entry.id === id)
}

export function isAcpAdapterType(adapterType: string | undefined | null): boolean {
  const t = (adapterType || '').toLowerCase()
  return t === 'acp' || t === 'acp-stdio'
}

export function isRetiredBuiltinAdapterType(adapterType: string | undefined | null): boolean {
  const t = (adapterType || '').toLowerCase()
  return (RETIRED_BUILTIN_ADAPTER_TYPES as readonly string[]).includes(t)
}

/**
 * Build the argv that AcpAdapter will spawn for a provider preset.
 * Mirrors AcpAdapter: executablePath || command, then defaultArgs tokens.
 */
export function buildAcpLaunchConfig(provider: {
  command?: string
  executablePath?: string
  defaultArgs?: string
}): { command: string; args: string[] } {
  const raw = (provider.executablePath || provider.command || '').trim()
  if (!raw) {
    return { command: '', args: [] }
  }

  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) || []
  const command = (parts.shift() || '').replace(/^"|"$/g, '')
  const commandArgs = parts.map((part) => part.replace(/^"|"$/g, ''))

  const extraRaw = (provider.defaultArgs || '').trim()
  const extraParts = extraRaw
    ? (extraRaw.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map((part) => part.replace(/^"|"$/g, ''))
    : []

  return {
    command,
    args: [...commandArgs, ...extraParts],
  }
}

/** SQL seed rows for INSERT OR IGNORE (no verification notes). */
export function builtinProviderSeedRows(): Array<{
  id: string
  name: string
  command: string
  adapterType: string
  defaultArgs: string
  isEnabled: number
  sortOrder: number
}> {
  return BUILTIN_PROVIDER_DEFAULTS.map((entry) => ({
    id: entry.id,
    name: entry.name,
    command: entry.command,
    adapterType: entry.adapterType,
    defaultArgs: entry.defaultArgs,
    isEnabled: entry.isEnabled ? 1 : 0,
    sortOrder: entry.sortOrder,
  }))
}

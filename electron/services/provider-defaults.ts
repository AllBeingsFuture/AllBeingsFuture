/**
 * Canonical built-in AI provider presets.
 *
 * New ACP agents reuse the shared AcpAdapter (stdio NDJSON JSON-RPC v1).
 * Do not add provider-specific streaming runtimes here.
 *
 * ACP launch commands are taken only from official registry/docs or local
 * CLI --help verification — never invent unusable presets.
 */

export type BuiltinAdapterType =
  | 'claude-sdk'
  | 'codex-appserver'
  | 'gemini-headless'
  | 'opencode-sdk'
  | 'openai-api'
  | 'acp'

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

/**
 * Built-in providers seeded into SQLite on migrate.
 * Keep Claude Code / Codex / Gemini / OpenCode on their existing adapters.
 * Additional agents must use adapterType `acp` and go through AcpAdapter.
 */
export const BUILTIN_PROVIDER_DEFAULTS: readonly BuiltinProviderDefault[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    adapterType: 'claude-sdk',
    defaultArgs: '',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 1,
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    adapterType: 'codex-appserver',
    defaultArgs: '',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 2,
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    command: 'gemini',
    adapterType: 'gemini-headless',
    defaultArgs: '',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 3,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    adapterType: 'opencode-sdk',
    defaultArgs: '',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 4,
  },
  {
    id: 'grok-build',
    name: 'Grok Build',
    command: 'grok',
    adapterType: 'acp',
    // Local CLI: `grok agent --help` → stdio; registry: npx @xai-official/grok agent stdio
    defaultArgs: 'agent stdio',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 5,
    acpVerification:
      'Local `grok agent stdio --help` + official ACP registry agent.json (npx @xai-official/grok agent stdio)',
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    command: 'qwen',
    adapterType: 'acp',
    // Official registry args; source also documents --acp (experimental-acp deprecated)
    defaultArgs: '--acp --experimental-skills',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 6,
    acpVerification:
      'Official ACP registry agent.json + Qwen Code CLI source option `--acp` ("Starts the agent in ACP mode")',
  },
  {
    id: 'kimi-cli',
    name: 'Kimi CLI',
    command: 'kimi',
    adapterType: 'acp',
    // Official README: configure ACP client with command `kimi` args `["acp"]`
    defaultArgs: 'acp',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 7,
    acpVerification:
      'Official Kimi CLI README ACP section + ACP registry agent.json (`kimi acp`)',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot CLI',
    command: 'copilot',
    adapterType: 'acp',
    // Official ACP registry: npx @github/copilot --acp
    defaultArgs: '--acp',
    isBuiltin: true,
    isEnabled: true,
    sortOrder: 8,
    acpVerification:
      'Official ACP registry agent.json (npx @github/copilot --acp) + agentclientprotocol.com agents list',
  },
] as const

export function getBuiltinProviderDefaults(): BuiltinProviderDefault[] {
  return BUILTIN_PROVIDER_DEFAULTS.map((entry) => ({ ...entry }))
}

export function getAcpBuiltinProviders(): BuiltinProviderDefault[] {
  return getBuiltinProviderDefaults().filter((entry) => entry.adapterType === 'acp')
}

export function isAcpAdapterType(adapterType: string | undefined | null): boolean {
  const t = (adapterType || '').toLowerCase()
  return t === 'acp' || t === 'acp-stdio'
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

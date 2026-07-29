/**
 * Provider capability registry.
 * Declares MCP / Skill support for each built-in AI provider.
 *
 * All built-in CLI agents negotiate MCP over the shared AcpAdapter session.
 */

// ---- Types ----

export interface ProviderMcpCapability {
  /** Whether the provider natively supports MCP */
  native: boolean
  /** Fallback when native MCP is unavailable */
  fallback: 'prompt-injection' | 'none'
}

export interface ProviderSkillCapability {
  /** Whether /slash commands are natively supported */
  slashCommands: boolean
  /** Whether system prompt injection is supported */
  systemPrompt: boolean
  /** Native skill directory path */
  nativeSkillDir?: string
}

export interface ProviderCapability {
  providerId: string
  mcpSupport: ProviderMcpCapability
  skillSupport: ProviderSkillCapability
}

function acpNativeCapability(providerId: string, skillExtras?: Partial<ProviderSkillCapability>): ProviderCapability {
  return {
    providerId,
    mcpSupport: {
      native: true,
      fallback: 'none',
    },
    skillSupport: {
      slashCommands: false,
      systemPrompt: true,
      ...skillExtras,
    },
  }
}

// ---- Registry ----

export class ProviderCapabilityRegistry {
  private static readonly capabilities: ReadonlyMap<string, ProviderCapability> = new Map([
    // Built-in CLI agents: MCP negotiated over shared AcpAdapter
    ['claude-code', {
      providerId: 'claude-code',
      mcpSupport: {
        native: true,
        fallback: 'none',
      },
      skillSupport: {
        slashCommands: true,
        systemPrompt: true,
        nativeSkillDir: '.claude/commands',
      },
    }],
    ['codex', acpNativeCapability('codex')],
    ['gemini-cli', acpNativeCapability('gemini-cli')],
    ['opencode', acpNativeCapability('opencode')],
    ['grok-build', acpNativeCapability('grok-build')],
    ['qwen-code', acpNativeCapability('qwen-code')],
    ['kimi-cli', acpNativeCapability('kimi-cli')],
    ['github-copilot', acpNativeCapability('github-copilot')],
    // Non-agent HTTP API
    ['openai-api', {
      providerId: 'openai-api',
      mcpSupport: {
        native: false,
        fallback: 'none',
      },
      skillSupport: {
        slashCommands: false,
        systemPrompt: true,
      },
    }],
    // Optional legacy id still referenced in older DBs / UI labels
    ['iflow', acpNativeCapability('iflow')],
  ])

  /** Get full capability description for a provider */
  static get(providerId: string): ProviderCapability | undefined {
    return this.capabilities.get(providerId)
  }

  /** Get all registered provider capabilities */
  static getAll(): ProviderCapability[] {
    return Array.from(this.capabilities.values())
  }

  /** MCP capability (conservative default when unregistered) */
  static getMcpCapability(providerId: string): ProviderMcpCapability {
    return this.capabilities.get(providerId)?.mcpSupport ?? {
      native: false,
      fallback: 'none',
    }
  }

  /** Skill capability */
  static getSkillCapability(providerId: string): ProviderSkillCapability {
    return this.capabilities.get(providerId)?.skillSupport ?? {
      slashCommands: false,
      systemPrompt: false,
    }
  }

  /** Whether the provider natively supports MCP */
  static supportsNativeMcp(providerId: string): boolean {
    return this.capabilities.get(providerId)?.mcpSupport.native ?? false
  }
}

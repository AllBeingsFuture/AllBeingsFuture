/**
 * BridgeManager - Manages AI provider sessions in-process.
 *
 * Built-in CLI agents all speak ACP v1 over stdio via the shared AcpAdapter.
 * Custom OpenAI-compatible HTTP APIs use OpenAIAdapter (non-agent).
 * Legacy SDK/headless adapters are retired and rejected if still requested.
 */

import { OpenAIAdapter } from './adapters/openai.js'
import { AcpAdapter } from './adapters/acp.js'
import type { BridgeEventCallback, ProviderAdapter } from './types.js'
import { isAcpAdapterType, isRetiredBuiltinAdapterType } from '../services/provider-defaults.js'

interface AdapterInstance {
  adapter: ProviderAdapter
  eventCallback: BridgeEventCallback
}

/**
 * Normalize provider adapter types / short names to the runtime adapter key.
 * All built-in CLI agent ids map to the shared `acp` adapter.
 */
const ADAPTER_ALIASES = new Map<string, string>([
  // Shared ACP
  ['acp', 'acp'],
  ['acp-stdio', 'acp'],
  // Built-in CLI agent ids / short names → AcpAdapter
  ['claude', 'acp'],
  ['claude-code', 'acp'],
  ['claude_cli', 'acp'],
  ['claude_sdk', 'acp'],
  ['claude-sdk', 'acp'],
  ['claude-agent-acp', 'acp'],
  ['codex', 'acp'],
  ['codex-cli', 'acp'],
  ['codex-acp', 'acp'],
  ['codex-appserver', 'acp'],
  ['gemini', 'acp'],
  ['gemini-cli', 'acp'],
  ['gemini-headless', 'acp'],
  ['opencode', 'acp'],
  ['opencode-cli', 'acp'],
  ['opencode-sdk', 'acp'],
  ['grok', 'acp'],
  ['grok-build', 'acp'],
  ['qwen', 'acp'],
  ['qwen-code', 'acp'],
  ['kimi', 'acp'],
  ['kimi-cli', 'acp'],
  ['copilot', 'acp'],
  ['github-copilot', 'acp'],
  ['github-copilot-cli', 'acp'],
  // Non-agent HTTP API
  ['openai', 'openai-api'],
  ['openai-api', 'openai-api'],
])

/** Commands that imply the shared ACP stdio adapter (not openai-api). */
const ACP_COMMAND_HINTS = [
  'claude-agent-acp',
  'claude',
  'codex-acp',
  'codex',
  'gemini',
  'opencode',
  'grok',
  'qwen',
  'kimi',
  'copilot',
]

export function normalizeAdapterType(adapterType: string, config?: Record<string, any>): string {
  const raw = (adapterType || '').trim()
  if (raw) {
    const lowered = raw.toLowerCase()
    if (ADAPTER_ALIASES.has(lowered)) {
      return ADAPTER_ALIASES.get(lowered)!
    }
    // Explicit retired type still requested as free-form string → route to ACP
    // so sessions never re-enter removed SDK/headless runtimes.
    if (isRetiredBuiltinAdapterType(lowered) || isAcpAdapterType(lowered)) {
      return 'acp'
    }
    return lowered
  }

  const command = String(config?.command || config?.executablePath || '').toLowerCase()
  if (command.includes('openai') && !command.includes('codex')) {
    return 'openai-api'
  }
  if (ACP_COMMAND_HINTS.some((hint) => command.includes(hint))) {
    return 'acp'
  }
  return adapterType || ''
}

function createAdapter(
  adapterType: string,
  config: Record<string, any>,
  emit: BridgeEventCallback,
): ProviderAdapter {
  const normalized = normalizeAdapterType(adapterType, config)
  switch (normalized) {
    case 'openai-api':
      return new OpenAIAdapter(config, emit)
    case 'acp':
      return new AcpAdapter(config, emit)
    default:
      if (isRetiredBuiltinAdapterType(adapterType) || isRetiredBuiltinAdapterType(normalized)) {
        throw new Error(
          `Retired adapter '${adapterType}' is no longer available. `
          + 'Built-in CLI agents use ACP v1 stdio (adapterType: acp).',
        )
      }
      throw new Error(`Unknown adapter: ${adapterType} (normalized: ${normalized})`)
  }
}

export class BridgeManager {
  private sessions = new Map<string, AdapterInstance>()

  async initSession(
    sessionId: string,
    adapterType: string,
    config: Record<string, any>,
    eventCallback: BridgeEventCallback,
  ): Promise<void> {
    // Destroy existing session if any
    if (this.sessions.has(sessionId)) {
      await this.destroySession(sessionId)
    }

    const emit = (event: any) => {
      eventCallback({ ...event, sessionId })
    }

    const adapter = createAdapter(adapterType, config, emit)

    if (config.envOverrides) {
      adapter.envOverrides = config.envOverrides
    }
    if (config.resumeFlag) {
      adapter.resumeFlag = config.resumeFlag
    }

    await adapter.init()
    this.sessions.set(sessionId, { adapter, eventCallback })

    const resolved = normalizeAdapterType(adapterType, config)
    console.log(`[bridge] Session initialized: ${sessionId} (${adapterType} → ${resolved})`)
  }

  async sendMessage(
    sessionId: string,
    message: string,
    images?: Array<{data: string, mimeType: string}>,
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not initialized: ${sessionId}`)

    session.adapter.currentRequestId = `req-${Date.now()}`
    await session.adapter.send(message, images)
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      await session.adapter.stop()
    }
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      await session.adapter.destroy()
      this.sessions.delete(sessionId)
      console.log(`[bridge] Session destroyed: ${sessionId}`)
    }
  }

  async destroyAll(): Promise<void> {
    const promises = []
    for (const [sid] of this.sessions) {
      promises.push(this.destroySession(sid).catch(() => {}))
    }
    await Promise.all(promises)
  }

  isSessionActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    // If adapter exposes isAlive(), use it for deeper health check.
    // A dead adapter (stream ended, query torn down) should be re-initialized.
    if (typeof session.adapter.isAlive === 'function') {
      return session.adapter.isAlive()
    }
    return true
  }

  /**
   * Check whether the adapter instance exists in the Map (regardless of health).
   * Used internally for cleanup decisions.
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }
}

/**
 * BridgeManager - Manages AI provider sessions in-process
 *
 * This replaces the old subprocess-based bridge (bridge.js + NDJSON protocol).
 * Adapters (Claude SDK, Codex, Gemini, OpenCode) run directly in the
 * Electron main process, eliminating IPC overhead.
 */

import { ClaudeAdapter } from './adapters/claude.js'
import { CodexAdapter } from './adapters/codex.js'
import { GeminiAdapter } from './adapters/gemini.js'
import { OpenCodeAdapter } from './adapters/opencode.js'

type EventCallback = (event: any) => void

interface AdapterInstance {
  adapter: any
  eventCallback: EventCallback
}

const ADAPTER_ALIASES = new Map<string, string>([
  ['claude', 'claude-sdk'],
  ['claude-code', 'claude-sdk'],
  ['claude_cli', 'claude-sdk'],
  ['claude_sdk', 'claude-sdk'],
  ['codex', 'codex-appserver'],
  ['codex-cli', 'codex-appserver'],
  ['codex-appserver', 'codex-appserver'],
  ['gemini', 'gemini-headless'],
  ['gemini-cli', 'gemini-headless'],
  ['opencode', 'opencode-sdk'],
  ['opencode-cli', 'opencode-sdk'],
])

function normalizeAdapterType(adapterType: string, config?: Record<string, any>): string {
  if (adapterType) {
    return ADAPTER_ALIASES.get(adapterType) || adapterType
  }
  const command = (config?.command || '').toLowerCase()
  if (command.includes('claude')) return 'claude-sdk'
  if (command.includes('codex')) return 'codex-appserver'
  if (command.includes('gemini')) return 'gemini-headless'
  if (command.includes('opencode')) return 'opencode-sdk'
  return adapterType
}

function createAdapter(adapterType: string, config: Record<string, any>, emit: EventCallback): any {
  const normalized = normalizeAdapterType(adapterType, config)
  switch (normalized) {
    case 'claude-sdk':
      return new ClaudeAdapter(config, emit)
    case 'codex-appserver':
      return new CodexAdapter(config, emit)
    case 'gemini-headless':
      return new GeminiAdapter(config, emit)
    case 'opencode-sdk':
      return new OpenCodeAdapter(config, emit)
    default:
      throw new Error(`Unknown adapter: ${adapterType} (normalized: ${normalized})`)
  }
}

export class BridgeManager {
  private sessions = new Map<string, AdapterInstance>()

  async initSession(
    sessionId: string,
    adapterType: string,
    config: Record<string, any>,
    eventCallback: EventCallback,
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

    console.log(`[bridge] Session initialized: ${sessionId} (${adapterType})`)
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

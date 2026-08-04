/**
 * MemPalace safe-proxy wiring for multi-agent concurrent writes.
 *
 * When enabled user MCP configs look like mempalace, rewrite command/args to
 * the embedded mempalace-safe stdio proxy so write tools are file-locked and
 * peer-writer lock failures become recoverable retries.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type McpRuntimeConfig = {
  command: string
  args: string[]
  env: Record<string, string>
  cwd?: string
}

const SAFE_MARKER = 'mempalace-safe'

/** Detect mempalace by server key / command / args. */
export function isMempalaceServer(
  key: string,
  command: string,
  args: string[] = [],
): boolean {
  const parts = [key, command, ...args].map((p) => String(p || '').toLowerCase())
  return parts.some((p) => p.includes('mempalace'))
}

/** True when command/args already point at our safe proxy (avoid double wrap). */
export function isMempalaceSafeWrapped(command: string, args: string[] = []): boolean {
  const blob = [command, ...args].join(' ').toLowerCase()
  return blob.includes(SAFE_MARKER) && (blob.includes('proxy.mjs') || blob.includes('proxy.js'))
}

export function isMempalaceSafeProxyDisabled(): boolean {
  const raw = String(process.env.ABF_DISABLE_MEMPALACE_SAFE || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

/**
 * Resolve path to embedded proxy.mjs (dev + packaged Electron).
 */
export function resolveMempalaceSafeProxyPath(): string | null {
  const override = String(process.env.ABF_MEMPALACE_SAFE_PROXY || '').trim()
  if (override) {
    if (override === '0' || override.toLowerCase() === 'false') return null
    if (fs.existsSync(override)) return override
  }

  const candidates: string[] = []

  // Packaged: extraResources → resources/mcps/mempalace-safe/proxy.mjs
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'mcps', 'mempalace-safe', 'proxy.mjs'))
  }

  // Dev / worktree: cwd-relative
  candidates.push(
    path.join(process.cwd(), 'electron', 'embedded-assets', 'mcps', 'mempalace-safe', 'proxy.mjs'),
  )

  // Compiled: electron/dist/services → ../../embedded-assets/...
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    candidates.push(
      path.join(here, '..', '..', 'embedded-assets', 'mcps', 'mempalace-safe', 'proxy.mjs'),
      path.join(here, '..', 'embedded-assets', 'mcps', 'mempalace-safe', 'proxy.mjs'),
      // monorepo root from dist
      path.join(here, '..', '..', '..', 'electron', 'embedded-assets', 'mcps', 'mempalace-safe', 'proxy.mjs'),
    )
  } catch {
    /* import.meta unavailable — ignore */
  }

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}

/**
 * Rewrite a single enabled MCP config to run through the safe proxy when it
 * looks like mempalace. Returns the original config when not applicable.
 */
export function wrapMempalaceConfigIfNeeded(
  key: string,
  config: McpRuntimeConfig,
  proxyPath: string | null = resolveMempalaceSafeProxyPath(),
): McpRuntimeConfig {
  if (isMempalaceSafeProxyDisabled()) return config
  if (!proxyPath) return config

  const command = config.command || 'node'
  const args = Array.isArray(config.args) ? config.args.map(String) : []
  const env = config.env && typeof config.env === 'object' ? { ...config.env } : {}

  if (!isMempalaceServer(key, command, args)) return config
  if (isMempalaceSafeWrapped(command, args)) return config

  // Inject bounded timeout defaults only when unset (user/env wins).
  const withTimeoutDefaults = (keyName: string, value: string) => {
    if (env[keyName] !== undefined && String(env[keyName]).trim() !== '') return
    if (process.env[keyName] !== undefined && String(process.env[keyName]).trim() !== '') return
    env[keyName] = value
  }
  // Concurrent multi-agent writers: queue budgets so writers succeed (not busy-skip).
  // Budgets cover embed/chroma latency + multi-agent serialization (not agent 15–20s skip window).
  withTimeoutDefaults('ABF_MEMPALACE_LOCK_MAX_MS', '180000')
  withTimeoutDefaults('ABF_MEMPALACE_TOOL_MAX_MS', '180000')
  withTimeoutDefaults('ABF_MEMPALACE_TOOL_RETRIES', '12')
  withTimeoutDefaults('ABF_MEMPALACE_CHILD_TIMEOUT_MS', '90000')
  withTimeoutDefaults('ABF_MEMPALACE_LOCK_MAX_HOLD_MS', '180000')

  return {
    ...config,
    command: 'node',
    args: [proxyPath],
    env: {
      ...env,
      ABF_MEMPALACE_COMMAND: command,
      ABF_MEMPALACE_ARGS: JSON.stringify(args),
      // Ensure peer writer lease does not sticky-readonly peer MCP processes.
      // Writes are still serialized by the proxy's abf_write.lock.
      MEMPALACE_MCP_ALLOW_PEER_WRITER: env.MEMPALACE_MCP_ALLOW_PEER_WRITER || '1',
    },
  }
}

/**
 * Apply safe wrap to the full getEnabledServerConfigs map.
 */
export function applyMempalaceSafeProxy(
  configs: Record<string, McpRuntimeConfig>,
  proxyPath: string | null = resolveMempalaceSafeProxyPath(),
): Record<string, McpRuntimeConfig> {
  const out: Record<string, McpRuntimeConfig> = {}
  for (const [key, cfg] of Object.entries(configs)) {
    out[key] = wrapMempalaceConfigIfNeeded(key, cfg, proxyPath)
  }
  return out
}

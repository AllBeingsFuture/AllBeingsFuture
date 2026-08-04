/**
 * MemPalace safe-proxy wiring for multi-agent concurrent writes.
 *
 * When enabled user MCP configs look like mempalace, rewrite command/args to
 * the embedded mempalace-safe stdio proxy so write tools are file-locked and
 * peer-writer lock failures become recoverable retries.
 *
 * Each ABF agent session still spawns its own proxy+backend (ACP stdio MCP).
 * Serialization is cross-process via a shared abf_write.lock — not a host
 * singleton connection (stdio cannot be shared across agent processes).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { appLog } from './log.js'

export type McpRuntimeConfig = {
  command: string
  args: string[]
  env: Record<string, string>
  cwd?: string
}

const SAFE_MARKER = 'mempalace-safe'

/**
 * Host defaults: must cover queue wait + real write (align with proxy.mjs /
 * write-lock.mjs). Prior 25s child timeout was the production failure mode —
 * embed/chroma checkpoint often exceeds 25s; timeout released abf_write.lock
 * while the child was still writing → multi-process Chroma pile-up.
 *
 * toolMax (180s) ≥ lockMax (180s queue) is not required on one axis: each
 * tools/call starts its own deadline. lockMax covers wait-for-front-of-queue;
 * childTimeout covers one real write after lock is held; toolMax bounds the
 * whole attempt including peer-lock retries.
 */
export const MEMPALACE_SAFE_DEFAULTS = {
  LOCK_MAX_MS: '180000',
  TOOL_MAX_MS: '180000',
  TOOL_RETRIES: '12',
  CHILD_TIMEOUT_MS: '90000',
  LOCK_MAX_HOLD_MS: '180000',
} as const

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

/** Shared absolute lock path so worktree isolation / cwd never diverges. */
export function resolveSharedWriteLockPath(): string {
  const override = String(process.env.ABF_MEMPALACE_WRITE_LOCK || '').trim()
  if (override) return path.resolve(override)
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir()
  return path.join(home, '.mempalace', 'locks', 'abf_write.lock')
}

/**
 * Optional Electron app path (dev + packaged). Avoid static electron import so
 * unit tests can load this module outside the Electron runtime.
 */
function tryElectronAppPath(): string | null {
  try {
    const require = createRequire(import.meta.url)
    const electron = require('electron') as { app?: { getAppPath?: () => string } }
    const appPath = electron?.app?.getAppPath?.()
    return typeof appPath === 'string' && appPath.trim() ? appPath : null
  } catch {
    return null
  }
}

/**
 * Resolve path to embedded proxy.mjs (dev + packaged Electron).
 * Prefer app/resources paths over process.cwd() — session worktrees often
 * change cwd and previously caused silent wrap no-ops.
 */
export function resolveMempalaceSafeProxyPath(): string | null {
  const override = String(process.env.ABF_MEMPALACE_SAFE_PROXY || '').trim()
  if (override) {
    if (override === '0' || override.toLowerCase() === 'false') return null
    if (fs.existsSync(override)) return path.resolve(override)
  }

  const candidates: string[] = []

  // Packaged: extraResources → resources/mcps/mempalace-safe/proxy.mjs
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'mcps', 'mempalace-safe', 'proxy.mjs'))
  }

  // Electron app path (stable when cwd is a worktree / user home)
  const appPath = tryElectronAppPath()
  if (appPath) {
    candidates.push(
      path.join(appPath, 'electron', 'embedded-assets', 'mcps', 'mempalace-safe', 'proxy.mjs'),
      path.join(appPath, 'embedded-assets', 'mcps', 'mempalace-safe', 'proxy.mjs'),
    )
  }

  // Dev / worktree: cwd-relative (last-resort after app path)
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
    if (c && fs.existsSync(c)) return path.resolve(c)
  }
  return null
}

/**
 * Materialize env into the MCP config map (ACP passes env as an explicit list
 * to the agent-spawned MCP process — host process.env is NOT reliably inherited).
 * User config.env wins; then host process.env override; else default.
 */
function injectEnvDefault(
  env: Record<string, string>,
  keyName: string,
  defaultValue: string,
): void {
  if (env[keyName] !== undefined && String(env[keyName]).trim() !== '') return
  const fromHost = process.env[keyName]
  if (fromHost !== undefined && String(fromHost).trim() !== '') {
    env[keyName] = String(fromHost)
    return
  }
  env[keyName] = defaultValue
}

function injectMempalaceBudgets(env: Record<string, string>): void {
  injectEnvDefault(env, 'ABF_MEMPALACE_LOCK_MAX_MS', MEMPALACE_SAFE_DEFAULTS.LOCK_MAX_MS)
  injectEnvDefault(env, 'ABF_MEMPALACE_TOOL_MAX_MS', MEMPALACE_SAFE_DEFAULTS.TOOL_MAX_MS)
  injectEnvDefault(env, 'ABF_MEMPALACE_TOOL_RETRIES', MEMPALACE_SAFE_DEFAULTS.TOOL_RETRIES)
  injectEnvDefault(env, 'ABF_MEMPALACE_CHILD_TIMEOUT_MS', MEMPALACE_SAFE_DEFAULTS.CHILD_TIMEOUT_MS)
  injectEnvDefault(env, 'ABF_MEMPALACE_LOCK_MAX_HOLD_MS', MEMPALACE_SAFE_DEFAULTS.LOCK_MAX_HOLD_MS)
  // Pin shared lock path (HOME-based absolute) so worktree cwd cannot fork locks.
  injectEnvDefault(env, 'ABF_MEMPALACE_WRITE_LOCK', resolveSharedWriteLockPath())
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

  const command = config.command || 'node'
  const args = Array.isArray(config.args) ? config.args.map(String) : []
  const env = config.env && typeof config.env === 'object' ? { ...config.env } : {}

  if (!isMempalaceServer(key, command, args)) return config
  if (isMempalaceSafeWrapped(command, args)) {
    // Already wrapped (user or prior pass): still ensure budgets + shared lock
    // are present so short leftover host env cannot silently starve the queue.
    injectMempalaceBudgets(env)
    if (!env.MEMPALACE_MCP_ALLOW_PEER_WRITER) {
      env.MEMPALACE_MCP_ALLOW_PEER_WRITER = '1'
    }
    return { ...config, env }
  }

  if (!proxyPath) {
    appLog(
      'warn',
      `MemPalace MCP "${key}" is enabled but mempalace-safe proxy.mjs was not found — ` +
        'concurrent multi-agent writes will NOT be queued (peer lock / 未写入 likely). ' +
        'Set ABF_MEMPALACE_SAFE_PROXY to an absolute proxy.mjs path, or reinstall package resources.',
      'mempalace-safe',
    )
    // Best-effort: still allow peer writers so palace is not sticky read-only.
    // Without the proxy there is no abf_write.lock serialization.
    return {
      ...config,
      env: {
        ...env,
        MEMPALACE_MCP_ALLOW_PEER_WRITER: env.MEMPALACE_MCP_ALLOW_PEER_WRITER || '1',
      },
    }
  }

  // Concurrent multi-agent writers: queue budgets so writers succeed (not busy-skip).
  // Always materialize into config.env — agent CLI spawns MCP with this map.
  injectMempalaceBudgets(env)

  const wrapped: McpRuntimeConfig = {
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

  appLog(
    'info',
    `MemPalace safe proxy applied for "${key}" → ${proxyPath} ` +
      `(toolMax=${wrapped.env.ABF_MEMPALACE_TOOL_MAX_MS}ms, lockMax=${wrapped.env.ABF_MEMPALACE_LOCK_MAX_MS}ms, ` +
      `childTimeout=${wrapped.env.ABF_MEMPALACE_CHILD_TIMEOUT_MS}ms, lock=${wrapped.env.ABF_MEMPALACE_WRITE_LOCK})`,
    'mempalace-safe',
  )

  return wrapped
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

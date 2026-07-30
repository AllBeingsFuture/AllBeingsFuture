/**
 * Resolve host CLI binaries the same way for every built-in provider.
 *
 * Product rule: production packages do **not** embed platform-native Codex /
 * Claude binaries (hundreds of MB). Runtime must locate the CLI like Grok:
 *   1. provider.executablePath (user settings)
 *   2. explicit env override (GROK_PATH / CODEX_PATH / CLAUDE_CODE_EXECUTABLE)
 *   3. well-known user install dirs
 *   4. PATH
 *
 * ACP JS wrappers (codex-acp / claude-agent-acp) may still ship in the app;
 * they receive the resolved host path via env when present.
 */

import { createRequire } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type HostCliKind = 'grok' | 'codex' | 'claude' | 'generic'

export interface ResolveHostCliOptions {
  /** Bare command name, e.g. grok / codex / claude */
  commandName: string
  /** Provider settings field (highest priority after non-empty absolute path) */
  executablePath?: string
  /** Env vars that may point at the binary or its bin directory */
  envKeys?: readonly string[]
  /** Extra absolute candidate paths (homedir-relative entries allowed) */
  extraCandidates?: readonly string[]
}

function isExistingFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile()
  } catch {
    return false
  }
}

function expandCandidate(candidate: string): string[] {
  const trimmed = candidate.trim()
  if (!trimmed) return []

  // Env may point at a directory (bin root) or the binary itself.
  try {
    if (statSync(trimmed).isDirectory()) {
      return []
    }
  } catch {
    // may not exist
  }

  if (process.platform === 'win32' && !path.extname(trimmed)) {
    const out = [trimmed]
    for (const ext of ['.cmd', '.exe', '.bat', '.ps1']) {
      out.push(`${trimmed}${ext}`)
    }
    return out
  }
  return [trimmed]
}

function pathSearchEntries(): string[] {
  const home = os.homedir()
  const entries: string[] = []
  const seen = new Set<string>()
  const add = (dir: string | undefined) => {
    if (!dir) return
    const abs = path.resolve(dir)
    if (seen.has(abs) || !existsSync(abs)) return
    seen.add(abs)
    entries.push(abs)
  }

  for (const envKey of ['GROK_PATH', 'CODEX_PATH', 'CLAUDE_CODE_EXECUTABLE', 'CLAUDE_PATH'] as const) {
    const value = process.env[envKey]?.trim()
    if (!value) continue
    try {
      if (statSync(value).isDirectory()) add(value)
      else add(path.dirname(value))
    } catch {
      add(path.dirname(value))
    }
  }

  add(path.join(home, '.grok', 'bin'))
  add(path.join(home, '.npm-global', 'bin'))
  add(path.join(home, '.local', 'bin'))
  add(path.join(home, 'homebrew', 'bin'))
  add('/opt/homebrew/bin')
  add('/usr/local/bin')

  // Dev workspace: optional platform shims under local node_modules/.bin
  add(path.join(process.cwd(), 'node_modules', '.bin'))

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    add(path.join(appData, 'npm'))
  }

  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    add(entry.trim())
  }

  return entries
}

/**
 * Resolve a host CLI absolute path, or undefined when not found.
 * Does not resolve ACP wrapper package names (codex-acp / claude-agent-acp).
 */
export function resolveHostCliPath(options: ResolveHostCliOptions): string | undefined {
  const commandName = options.commandName.trim()
  if (!commandName) return undefined

  const ordered: string[] = []

  if (options.executablePath?.trim()) {
    ordered.push(options.executablePath.trim())
  }

  for (const envKey of options.envKeys || []) {
    const value = process.env[envKey]?.trim()
    if (value) ordered.push(value)
  }

  for (const extra of options.extraCandidates || []) {
    if (extra) ordered.push(extra)
  }

  // Bare name: search common bins + PATH
  for (const dir of pathSearchEntries()) {
    ordered.push(path.join(dir, commandName))
  }

  const seen = new Set<string>()
  for (const candidate of ordered) {
    for (const expanded of expandCandidate(candidate)) {
      const abs = path.isAbsolute(expanded) ? expanded : path.resolve(expanded)
      if (seen.has(abs)) continue
      seen.add(abs)
      // Skip ACP wrapper names mistakenly stored as "host" CLI
      const base = path.basename(abs).replace(/\.(cmd|exe|bat|ps1)$/i, '')
      if (base === 'codex-acp' || base === 'claude-agent-acp') continue
      if (isExistingFile(abs)) return abs
    }
  }

  return undefined
}

export function resolveGrokCliPath(executablePath?: string): string | undefined {
  return resolveHostCliPath({
    commandName: 'grok',
    executablePath,
    envKeys: ['GROK_PATH'],
    extraCandidates: [path.join(os.homedir(), '.grok', 'bin', 'grok')],
  })
}

/** Host `codex` binary for the codex-acp wrapper (CODEX_PATH). */
export function resolveCodexCliPath(executablePath?: string): string | undefined {
  return resolveHostCliPath({
    commandName: 'codex',
    executablePath,
    envKeys: ['CODEX_PATH'],
    extraCandidates: [
      path.join(os.homedir(), '.npm-global', 'bin', 'codex'),
      path.join(os.homedir(), '.local', 'bin', 'codex'),
      '/usr/local/bin/codex',
      '/opt/homebrew/bin/codex',
    ],
  })
}

/**
 * Host Claude Code executable for claude-agent-acp
 * (CLAUDE_CODE_EXECUTABLE / CLAUDE_PATH / `claude` on PATH).
 */
export function resolveClaudeCodeExecutable(executablePath?: string): string | undefined {
  return resolveHostCliPath({
    commandName: 'claude',
    executablePath,
    envKeys: ['CLAUDE_CODE_EXECUTABLE', 'CLAUDE_PATH'],
    extraCandidates: [
      path.join(os.homedir(), '.local', 'bin', 'claude'),
      path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ],
  })
}

/**
 * Dev-only fallback: optional platform package still present under node_modules.
 * Production packs exclude these; packaged apps must use host CLI.
 */
export function hasOptionalClaudeNativePackage(): boolean {
  try {
    const req = createRequire(import.meta.url)
    const ext = process.platform === 'win32' ? '.exe' : ''
    const id = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude${ext}`
    req.resolve(id)
    return true
  } catch {
    return false
  }
}

/** Dev-only: optional @openai/codex-* platform package still resolvable. */
export function hasOptionalCodexNativePackage(): boolean {
  try {
    const req = createRequire(import.meta.url)
    const target =
      process.platform === 'darwin' && process.arch === 'arm64' ? 'darwin-arm64'
        : process.platform === 'darwin' && process.arch === 'x64' ? 'darwin-x64'
          : process.platform === 'linux' && process.arch === 'arm64' ? 'linux-arm64'
            : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x64'
              : process.platform === 'win32' && process.arch === 'arm64' ? 'win32-arm64'
                : process.platform === 'win32' ? 'win32-x64'
                  : ''
    if (!target) return false
    // Package name mapping used by @openai/codex bin shim
    req.resolve(`@openai/codex-${target}/package.json`)
    return true
  } catch {
    return false
  }
}

/** User-facing error when a host CLI is missing (aligned with Grok messaging level). */
export function missingHostCliError(kind: HostCliKind, details?: string): Error {
  const installHints: Record<HostCliKind, string> = {
    grok:
      'Install Grok Build CLI and ensure `grok` is on PATH, or set GROK_PATH / Provider executable path.',
    codex:
      'Install Codex CLI (`npm i -g @openai/codex` or the official installer) and ensure `codex` is on PATH, '
      + 'or set CODEX_PATH / Provider executable path. The app no longer ships platform-native Codex binaries.',
    claude:
      'Install Claude Code CLI and ensure `claude` is on PATH, or set CLAUDE_CODE_EXECUTABLE / CLAUDE_PATH / '
      + 'Provider executable path. The app no longer ships platform-native Claude agent binaries.',
    generic:
      'Install the required CLI and ensure it is on PATH, or set the Provider executable path.',
  }
  const suffix = details ? ` ${details}` : ''
  return new Error(`CLI not found for ${kind}.${suffix} ${installHints[kind]}`)
}

/**
 * Electron-builder `files` exclude globs for Codex/Claude platform natives.
 * Kept here so packaging tests stay in sync with package.json.
 */
export const PACKAGING_NATIVE_CLI_EXCLUDE_GLOBS = [
  '!**/node_modules/@openai/codex-*/**',
  '!**/node_modules/@openai/codex/vendor/**',
  '!**/node_modules/@anthropic-ai/claude-agent-sdk-*/**',
  '!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/**',
  '!**/node_modules/@anthropic-ai/claude-agent-sdk/cli.js',
  '!**/node_modules/@img/sharp-*/**',
] as const

/** asarUnpack should only list thin ACP JS wrappers + peers — never platform CLI packages. */
export const PACKAGING_ASAR_UNPACK_ALLOWED_PREFIXES = [
  'node_modules/@agentclientprotocol/claude-agent-acp/',
  'node_modules/@agentclientprotocol/codex-acp/',
  'node_modules/@agentclientprotocol/sdk/',
  'node_modules/zod/',
] as const

export const PACKAGING_ASAR_UNPACK_FORBIDDEN_SUBSTRINGS = [
  '@openai/codex',
  '@anthropic-ai/claude-agent-sdk',
] as const

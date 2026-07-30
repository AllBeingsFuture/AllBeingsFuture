import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertSpawnableEntrypoint,
  isBundledAcpWrapperCommand,
  resolveBundledAcpWrapperEntry,
  resolveJsRunner,
  toSpawnableFilesystemPath,
} from './acp-package-resolve.js'

export interface ParsedCommand {
  command: string
  args: string[]
}

export interface ResolvedProcessCommand {
  command: string
  args: string[]
  shell: boolean
  shimEntrypoint?: string
  /** Extra env applied after buildChildProcessEnv (e.g. ELECTRON_RUN_AS_NODE). */
  env?: Record<string, string>
}

const WINDOWS_COMMAND_EXTENSION_PRIORITY = ['.cmd', '.exe', '.bat', '.ps1']

export function parseCommand(command: string | undefined, fallback: string): ParsedCommand {
  if (!command) return { command: fallback, args: [] }

  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || []
  const parsedCommand = (parts.shift() || fallback).replace(/^"|"$/g, '')
  const args = parts.map(part => part.replace(/^"|"$/g, ''))

  return {
    command: parsedCommand || fallback,
    args,
  }
}

export function resolveCommand(command: string | undefined, fallback: string): ParsedCommand {
  const parsed = parseCommand(command, fallback)
  if (!parsed.command) {
    return parsed
  }

  // Absolute / relative paths: Windows may still need extension resolution.
  if (hasPathSeparator(parsed.command)) {
    if (process.platform === 'win32') {
      return {
        command: resolvePathCandidate(parsed.command) || parsed.command,
        args: parsed.args,
      }
    }
    return parsed
  }

  // Bare names: always resolve to an absolute path when possible.
  // GUI-launched Electron inherits a stripped PATH (/usr/bin:/bin/…); relying on
  // spawn PATH lookup alone still fails if child env is wrong or incomplete.
  // Search well-known user bins (~/.grok/bin, npm-global, homebrew, …) first.
  if (process.platform === 'win32') {
    return {
      command: resolveWindowsCommand(parsed.command),
      args: parsed.args,
    }
  }

  const matches = findCommandInPath(parsed.command)
  if (matches.length > 0) {
    return { command: matches[0], args: parsed.args }
  }
  return parsed
}

export function detectGitBashPath(preferredPath?: string): string | undefined {
  const candidates = new Set<string>()

  if (preferredPath) {
    candidates.add(preferredPath)
  }

  for (const candidate of [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
    'D:\\Git\\bin\\bash.exe',
    'D:\\Program Files\\Git\\bin\\bash.exe',
  ]) {
    candidates.add(candidate)
  }

  for (const gitPath of findCommandInPath('git')) {
    const gitDir = path.dirname(gitPath)
    const gitRoot = path.dirname(gitDir)
    candidates.add(path.join(gitDir, 'bash.exe'))
    candidates.add(path.join(gitRoot, 'bin', 'bash.exe'))
    candidates.add(path.join(gitRoot, 'usr', 'bin', 'bash.exe'))
  }

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

export function detectGitCmdPath(): string | undefined {
  // Check well-known Git installation directories on Windows
  for (const candidate of [
    'C:\\Program Files\\Git\\cmd',
    'D:\\Git\\cmd',
    'C:\\Program Files (x86)\\Git\\cmd',
    'D:\\Program Files\\Git\\cmd',
  ]) {
    if (existsSync(path.join(candidate, 'git.exe'))) {
      return candidate
    }
  }

  // Derive from findCommandInPath results
  for (const gitExe of findCommandInPath('git')) {
    const dir = path.dirname(gitExe)
    if (existsSync(path.join(dir, 'git.exe'))) {
      return dir
    }
  }

  return undefined
}

export function detectNodeExecutablePath(preferredPath?: string): string | undefined {
  const candidates = new Set<string>()

  if (preferredPath) {
    candidates.add(preferredPath)
  }

  for (const candidate of [
    'C:\\Program Files\\nodejs\\node.exe',
    'D:\\Program Files\\nodejs\\node.exe',
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node.exe'),
  ]) {
    candidates.add(candidate)
  }

  for (const nodePath of findCommandInPath('node')) {
    candidates.add(nodePath)
  }

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

export function buildChildProcessEnv(envOverrides?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_NO_ATTACH_CONSOLE
  delete env.ELECTRON_NO_ASAR
  delete env.NODE_OPTIONS

  const pathEntries = splitPathEntries(env.PATH)
  const nodePath = detectNodeExecutablePath(env.NODE)
  if (nodePath) {
    prependPathEntry(pathEntries, path.dirname(nodePath))
  }

  const npmGlobalBin = path.join(os.homedir(), 'AppData', 'Roaming', 'npm')
  if (existsSync(npmGlobalBin)) {
    prependPathEntry(pathEntries, npmGlobalBin)
  }

  // Electron GUI launches (Finder/Dock) inherit a minimal PATH that omits
  // user CLI installs. Mirror getCommandSearchPathEntries so child agents
  // (especially Grok at ~/.grok/bin) remain spawnable.
  for (const candidate of [
    path.join(os.homedir(), '.npm-global', 'bin'),
    path.join(os.homedir(), '.grok', 'bin'),
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), 'homebrew', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]) {
    if (existsSync(candidate)) {
      prependPathEntry(pathEntries, candidate)
    }
  }

  // Ensure Git is on PATH — Electron may inherit a PATH without Git
  if (process.platform === 'win32') {
    const gitPath = detectGitCmdPath()
    if (gitPath) {
      prependPathEntry(pathEntries, gitPath)
    }
  }

  env.PATH = pathEntries.join(path.delimiter)

  if (envOverrides && typeof envOverrides === 'object') {
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined || value === null) continue
      env[key] = String(value)
    }
  }

  return env
}

export function resolveProcessCommand(command: string | undefined, fallback: string): ResolvedProcessCommand {
  const resolved = resolveCommand(command, fallback)

  // 1) ACP wrappers (claude-agent-acp / codex-acp): JS-only package entry via Node.
  //    Platform-native Codex/Claude binaries are NOT packed — wrappers need host CLI
  //    (CODEX_PATH / CLAUDE_CODE_EXECUTABLE or PATH). Prefer app.asar.unpacked, else
  //    global install / PATH (same model as Grok).
  if (isBundledAcpWrapperCommand(resolved.command)) {
    const entry = resolveBundledAcpWrapperEntry(resolved.command)
    if (entry) {
      assertSpawnableEntrypoint(entry, resolved.command)
      const runner = resolveJsRunner()
      return {
        command: runner.command,
        args: [entry, ...resolved.args],
        shell: false,
        shimEntrypoint: entry,
        env: {
          ...runner.env,
          // Ensure system Node can resolve asarUnpacked peer deps (sdk/zod/…).
          ...buildUnpackedNodePathEnv(entry),
        },
      }
    }
    // No bundled entry: resolve like any other PATH CLI (global install).
  }

  // 2) Absolute / relative path that points at a JS entry (possibly under asar)
  const directSpawnable = toSpawnableFilesystemPath(resolved.command)
  if (directSpawnable && /\.[cm]?js$/i.test(directSpawnable)) {
    assertSpawnableEntrypoint(directSpawnable, 'ACP script')
    const runner = resolveJsRunner()
    return {
      command: runner.command,
      args: [directSpawnable, ...resolved.args],
      shell: false,
      shimEntrypoint: directSpawnable,
      env: runner.env,
    }
  }

  // 3) Windows npm .cmd shims → node + entrypoint
  const shell = shouldUseShell(resolved.command)
  const shimEntrypoint = resolveNpmShimEntrypoint(resolved.command)
  const nodePath = detectNodeExecutablePath()

  if (shimEntrypoint && nodePath) {
    const spawnableShim = toSpawnableFilesystemPath(shimEntrypoint) || shimEntrypoint
    if (isInsideAsarPath(spawnableShim)) {
      throw new Error(`npm shim entrypoint is inside app.asar and cannot be spawned: ${spawnableShim}`)
    }
    return {
      command: nodePath,
      args: [spawnableShim, ...resolved.args],
      shell: false,
      shimEntrypoint: spawnableShim,
    }
  }

  // 4) Plain binary name / path — rewrite asar → unpacked when applicable
  const commandPath = toSpawnableFilesystemPath(resolved.command) || resolved.command
  if (isInsideAsarPath(commandPath)) {
    throw new Error(
      `Command path is inside app.asar and cannot be spawned: ${commandPath}. `
      + 'Unpack the binary via asarUnpack or install it outside the asar archive.',
    )
  }

  return {
    command: commandPath,
    args: resolved.args,
    shell,
    shimEntrypoint,
  }
}

function isInsideAsarPath(filePath: string): boolean {
  const normalized = path.normalize(filePath)
  return normalized.includes(`${path.sep}app.asar${path.sep}`)
    && !normalized.includes(`${path.sep}app.asar.unpacked${path.sep}`)
}

/** NODE_PATH roots so unpacked wrappers can import asarUnpacked peer packages. */
function buildUnpackedNodePathEnv(entryPath: string): Record<string, string> {
  const roots: string[] = []
  const add = (dir: string) => {
    if (dir && existsSync(dir) && !roots.includes(dir)) roots.push(dir)
  }

  // Walk up from the entry looking for node_modules directories on real FS.
  let dir = path.dirname(entryPath)
  for (let i = 0; i < 8; i++) {
    add(path.join(dir, 'node_modules'))
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    add(path.join(resourcesPath, 'app.asar.unpacked', 'node_modules'))
  }

  if (roots.length === 0) return {}
  const existing = process.env.NODE_PATH || ''
  const merged = [...roots, ...existing.split(path.delimiter).filter(Boolean)]
  return { NODE_PATH: merged.join(path.delimiter) }
}

function resolveWindowsCommand(command: string): string {
  if (!command) return command

  const normalized = command.trim().replace(/^"|"$/g, '')
  if (!normalized) return command

  if (hasPathSeparator(normalized)) {
    return resolvePathCandidate(normalized) || normalized
  }

  const matches = findCommandInPath(normalized)
  return pickPreferredWindowsCandidate(matches) || normalized
}

function resolvePathCandidate(command: string): string | undefined {
  if (path.extname(command)) {
    return existsSync(command) ? command : undefined
  }

  if (existsSync(command)) {
    return command
  }

  for (const extension of WINDOWS_COMMAND_EXTENSION_PRIORITY) {
    const candidate = `${command}${extension}`
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

function pickPreferredWindowsCandidate(candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined

  const existing = candidates
    .map(candidate => candidate.trim())
    .filter(candidate => candidate && existsSync(candidate))

  if (existing.length === 0) return undefined

  for (const extension of WINDOWS_COMMAND_EXTENSION_PRIORITY) {
    const match = existing.find(candidate => candidate.toLowerCase().endsWith(extension))
    if (match) {
      return match
    }
  }

  return existing[0]
}

function findCommandInPath(command: string): string[] {
  const pathEntries = getCommandSearchPathEntries()

  const matches: string[] = []
  const searchNames = buildSearchNames(command)

  for (const entry of pathEntries) {
    for (const searchName of searchNames) {
      const candidate = path.join(entry, searchName)
      if (existsSync(candidate)) {
        matches.push(candidate)
      }
    }
  }

  return matches
}

function getCommandSearchPathEntries(): string[] {
  const entries = splitPathEntries(process.env.PATH)

  // Prefer project / app local node_modules/.bin so bundled ACP wrappers resolve offline.
  for (const binDir of collectLocalNodeModuleBinDirs()) {
    prependPathEntry(entries, binDir)
  }

  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const npmGlobalBin = path.join(appData, 'npm')
  if (existsSync(npmGlobalBin)) {
    prependPathEntry(entries, npmGlobalBin)
  }

  // Common user-level global bin locations (macOS/Linux).
  // GUI apps do not load shell rc files — these dirs must be searched explicitly
  // so host CLIs (especially `grok` at ~/.grok/bin) resolve without ENOENT.
  for (const candidate of [
    path.join(os.homedir(), '.npm-global', 'bin'),
    path.join(os.homedir(), '.grok', 'bin'),
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), 'homebrew', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]) {
    if (existsSync(candidate)) {
      prependPathEntry(entries, candidate)
    }
  }

  for (const candidate of [
    'C:\\Program Files\\nodejs',
    'D:\\Program Files\\nodejs',
  ]) {
    if (existsSync(candidate)) {
      prependPathEntry(entries, candidate)
    }
  }

  return entries
}

/** node_modules/.bin directories that may contain installed ACP agent wrappers. */
function collectLocalNodeModuleBinDirs(): string[] {
  const dirs: string[] = []
  const seen = new Set<string>()
  const roots = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.dirname(fileURLToPath(import.meta.url)),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
  ]

  for (const root of roots) {
    const bin = path.join(root, 'node_modules', '.bin')
    if (!existsSync(bin) || seen.has(bin)) continue
    seen.add(bin)
    dirs.push(bin)
  }
  return dirs
}

function buildSearchNames(command: string): string[] {
  if (path.extname(command)) {
    return [command]
  }

  const pathExtensions = (process.env.PATHEXT || '')
    .split(';')
    .map(extension => extension.trim().toLowerCase())
    .filter(Boolean)

  const names = new Set<string>([command])
  for (const extension of [...WINDOWS_COMMAND_EXTENSION_PRIORITY, ...pathExtensions]) {
    const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`
    names.add(`${command}${normalizedExtension}`)
  }

  return Array.from(names)
}

function hasPathSeparator(value: string): boolean {
  return value.includes('\\') || value.includes('/') || /^[a-z]:/i.test(value)
}

function shouldUseShell(command: string): boolean {
  if (process.platform !== 'win32') return false
  return /\.(cmd|bat)$/i.test(command)
}

function resolveNpmShimEntrypoint(commandPath: string): string | undefined {
  if (!/\.cmd$/i.test(commandPath) || !existsSync(commandPath)) {
    return undefined
  }

  try {
    const content = readFileSync(commandPath, 'utf8')
    const match = content.match(/"%dp0%\\([^"]+?\.js)"/i)
    if (!match?.[1]) {
      return undefined
    }

    const relativePath = match[1].replace(/\\/g, path.sep)
    const entrypoint = path.resolve(path.dirname(commandPath), relativePath)
    return existsSync(entrypoint) ? entrypoint : undefined
  } catch {
    return undefined
  }
}

function splitPathEntries(pathValue: string | undefined): string[] {
  return (pathValue || '')
    .split(path.delimiter)
    .map(entry => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
}

function prependPathEntry(entries: string[], value: string): void {
  const normalized = value.trim().replace(/^"|"$/g, '')
  if (!normalized) return
  const existingIndex = entries.findIndex(entry => entry.localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0)
  if (existingIndex >= 0) {
    entries.splice(existingIndex, 1)
  }
  entries.unshift(normalized)
}

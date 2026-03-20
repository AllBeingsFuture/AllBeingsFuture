import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface ParsedCommand {
  command: string
  args: string[]
}

export interface ResolvedProcessCommand {
  command: string
  args: string[]
  shell: boolean
  shimEntrypoint?: string
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
  if (process.platform !== 'win32') {
    return parsed
  }

  return {
    command: resolveWindowsCommand(parsed.command),
    args: parsed.args,
  }
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
  const shell = shouldUseShell(resolved.command)
  const shimEntrypoint = resolveNpmShimEntrypoint(resolved.command)
  const nodePath = detectNodeExecutablePath()

  if (shimEntrypoint && nodePath) {
    return {
      command: nodePath,
      args: [shimEntrypoint, ...resolved.args],
      shell: false,
      shimEntrypoint,
    }
  }

  return {
    command: resolved.command,
    args: resolved.args,
    shell,
    shimEntrypoint,
  }
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

  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const npmGlobalBin = path.join(appData, 'npm')
  if (existsSync(npmGlobalBin)) {
    prependPathEntry(entries, npmGlobalBin)
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

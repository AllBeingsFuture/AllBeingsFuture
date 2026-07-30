/**
 * Resolve thin ACP wrapper packages to real filesystem paths that can be
 * passed to child_process.spawn.
 *
 * Electron packs dependencies into app.asar by default. Paths inside app.asar
 * (without .unpacked) cannot be used as spawn targets for system Node / most
 * OS exec paths. Official **JS-only** wrappers:
 *   - claude-agent-acp → @agentclientprotocol/claude-agent-acp
 *   - codex-acp        → @agentclientprotocol/codex-acp
 * are asarUnpacked and resolved here.
 *
 * Platform-native Codex / Claude binaries are **not** packed (see docs/size-packaging.md).
 * Host CLIs are resolved separately via PATH / CODEX_PATH / CLAUDE_CODE_EXECUTABLE.
 */

import { existsSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export interface BundledAcpWrapper {
  /** Short command name stored in provider.command */
  commandName: string
  /** npm package name */
  packageName: string
  /** Entry relative to package root (package.json bin target) */
  entryRelative: string
}

/** Official ACP wrapper packages shipped as app dependencies. */
export const BUNDLED_ACP_WRAPPERS: readonly BundledAcpWrapper[] = [
  {
    commandName: 'claude-agent-acp',
    packageName: '@agentclientprotocol/claude-agent-acp',
    entryRelative: 'dist/index.js',
  },
  {
    commandName: 'codex-acp',
    packageName: '@agentclientprotocol/codex-acp',
    entryRelative: 'dist/index.js',
  },
] as const

const commandToWrapper = new Map(
  BUNDLED_ACP_WRAPPERS.map((w) => [w.commandName, w]),
)

/** True when path is inside an asar archive and not the unpacked twin. */
export function isInsideAsarArchive(filePath: string): boolean {
  const normalized = path.normalize(filePath)
  const marker = `${path.sep}app.asar${path.sep}`
  const unpacked = `${path.sep}app.asar.unpacked${path.sep}`
  if (normalized.includes(unpacked)) return false
  return normalized.includes(marker) || normalized.endsWith(`${path.sep}app.asar`)
}

/**
 * Rewrite app.asar/… → app.asar.unpacked/… when the unpacked twin exists.
 * Returns undefined if the path is still not a real on-disk file.
 */
export function toSpawnableFilesystemPath(filePath: string): string | undefined {
  if (!filePath) return undefined
  const normalized = path.normalize(filePath)

  if (!isInsideAsarArchive(normalized)) {
    return existsSync(normalized) ? normalized : undefined
  }

  const unpacked = normalized.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  )
  if (unpacked !== normalized && existsSync(unpacked)) {
    return unpacked
  }
  return undefined
}

/** Candidate node_modules roots for packaged + dev layouts. */
export function collectNodeModulesRoots(): string[] {
  const roots: string[] = []
  const seen = new Set<string>()
  const add = (dir: string) => {
    const abs = path.resolve(dir)
    if (seen.has(abs)) return
    if (!existsSync(abs)) return
    seen.add(abs)
    roots.push(abs)
  }

  // Packaged Electron: prefer unpacked first (spawnable)
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || ''
  if (resourcesPath) {
    add(path.join(resourcesPath, 'app.asar.unpacked', 'node_modules'))
    // asar path is readable via Electron require but not spawnable — still useful for detection
    add(path.join(resourcesPath, 'app.asar', 'node_modules'))
  }

  // Dev / tests: cwd and module-relative roots
  add(path.join(process.cwd(), 'node_modules'))
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    // electron/bridge → ../../node_modules
    add(path.resolve(here, '../../node_modules'))
    add(path.resolve(here, '../../../node_modules'))
  } catch {
    // ignore
  }

  // createRequire from this file (works when running from compiled dist)
  try {
    const req = createRequire(import.meta.url)
    for (const wrapper of BUNDLED_ACP_WRAPPERS) {
      try {
        const pkgJson = req.resolve(`${wrapper.packageName}/package.json`)
        add(path.resolve(path.dirname(pkgJson), '../..'))
        add(path.resolve(path.dirname(pkgJson), '../../..'))
      } catch {
        // package not visible from this module graph
      }
    }
  } catch {
    // ignore
  }

  return roots
}

export function resolveBundledAcpWrapperEntry(commandName: string): string | undefined {
  const base = path.basename(commandName.replace(/\\/g, '/'))
  // Strip Windows .cmd/.exe noise
  const bare = base.replace(/\.(cmd|exe|bat|ps1)$/i, '')
  const wrapper = commandToWrapper.get(bare)
  if (!wrapper) return undefined

  for (const modulesRoot of collectNodeModulesRoots()) {
    const entry = path.join(modulesRoot, ...wrapper.packageName.split('/'), wrapper.entryRelative)
    const spawnable = toSpawnableFilesystemPath(entry) || (existsSync(entry) && !isInsideAsarArchive(entry) ? entry : undefined)
    if (spawnable) {
      try {
        return realpathSync(spawnable)
      } catch {
        return spawnable
      }
    }
  }

  // Last resort: createRequire resolve then rewrite asar → unpacked
  try {
    const req = createRequire(import.meta.url)
    const pkgJson = req.resolve(`${wrapper.packageName}/package.json`)
    const entry = path.join(path.dirname(pkgJson), wrapper.entryRelative)
    const spawnable = toSpawnableFilesystemPath(entry)
    if (spawnable) return realpathSync(spawnable)
  } catch {
    // ignore
  }

  return undefined
}

export function isBundledAcpWrapperCommand(command: string): boolean {
  const base = path.basename((command || '').replace(/\\/g, '/')).replace(/\.(cmd|exe|bat|ps1)$/i, '')
  return commandToWrapper.has(base)
}

/**
 * Assert a path is safe for child_process.spawn (real file, not asar-only).
 * Throws a clear error for packaging misconfiguration.
 */
export function assertSpawnableEntrypoint(filePath: string, label = 'ACP agent'): void {
  if (!filePath) {
    throw new Error(`${label}: empty executable path`)
  }
  if (isInsideAsarArchive(filePath)) {
    throw new Error(
      `${label} entry is inside app.asar and cannot be spawned: ${filePath}. `
      + 'Unpack the ACP wrapper via asarUnpack (app.asar.unpacked) and resolve through acp-package-resolve.',
    )
  }
  if (!existsSync(filePath)) {
    throw new Error(`${label} entry does not exist on disk: ${filePath}`)
  }
  try {
    const st = statSync(filePath)
    if (!st.isFile()) {
      throw new Error(`${label} entry is not a file: ${filePath}`)
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(label)) throw err
    throw new Error(`${label} entry is not accessible: ${filePath}`)
  }
}

/**
 * Prefer system Node for running JS wrappers; fall back to Electron binary
 * with ELECTRON_RUN_AS_NODE=1 when packaged and no system node is available.
 */
export function resolveJsRunner(): { command: string; env?: Record<string, string> } {
  const fromPath = findNodeInPath()
  if (fromPath) {
    return { command: fromPath }
  }

  // Packaged Electron binary can run as Node
  const execPath = process.execPath
  if (execPath && existsSync(execPath)) {
    // When already running under Electron, this is the app binary.
    return {
      command: execPath,
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }
  }

  return { command: 'node' }
}

function findNodeInPath(): string | undefined {
  const pathEnv = process.env.PATH || ''
  const entries = pathEnv.split(path.delimiter).filter(Boolean)
  const names = process.platform === 'win32' ? ['node.exe', 'node'] : ['node']
  for (const entry of entries) {
    for (const name of names) {
      const candidate = path.join(entry, name)
      if (existsSync(candidate)) {
        try {
          // Avoid using Electron binary accidentally named node
          const real = realpathSync(candidate)
          if (/Electron|AllBeingsFuture/i.test(real) && !real.endsWith('node') && !real.endsWith('node.exe')) {
            continue
          }
          return real
        } catch {
          return candidate
        }
      }
    }
  }
  return undefined
}

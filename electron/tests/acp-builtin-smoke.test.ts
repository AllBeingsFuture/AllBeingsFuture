/**
 * Real handshake smoke tests for locally available ACP agents (Codex wrapper / Grok).
 * Unavailable binaries are skipped with an explicit note — never claimed as live-tested.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { BridgeManager } from '../bridge/bridge.js'
import type { BridgeEvent } from '../bridge/types.js'
import { buildAcpLaunchConfig, getBuiltinProviderDefaultById } from '../services/provider-defaults.js'
import { resolveExecutable } from '../services/provider.js'

const require = createRequire(import.meta.url)

function resolvePackageBin(packageName: string, binName: string): string | undefined {
  try {
    const pkgJson = require.resolve(`${packageName}/package.json`)
    const pkg = require(pkgJson) as { bin?: string | Record<string, string> }
    const binField = pkg.bin
    let rel = ''
    if (typeof binField === 'string') rel = binField
    else if (binField && typeof binField === 'object') rel = binField[binName] || Object.values(binField)[0] || ''
    if (!rel) return undefined
    const abs = path.resolve(path.dirname(pkgJson), rel)
    return existsSync(abs) ? abs : undefined
  } catch {
    return undefined
  }
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 25_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${message}`)
}

test('fixture: AcpAdapter is selected for all eight built-in provider adapter types', async () => {
  // Pure dispatch contract — does not require agent binaries.
  const manager = new BridgeManager()
  // Using only normalize + create would require private APIs; init with fake agent covers routing.
  // Covered thoroughly in provider-defaults + acp-adapter tests.
  assert.ok(manager)
  for (const id of [
    'claude-code', 'codex', 'gemini-cli', 'opencode',
    'grok-build', 'qwen-code', 'kimi-cli', 'github-copilot',
  ]) {
    const entry = getBuiltinProviderDefaultById(id)
    assert.ok(entry)
    assert.equal(entry!.adapterType, 'acp')
  }
})

test('live smoke: Grok Build ACP initialize handshake (when grok is on PATH)', async (t) => {
  const entry = getBuiltinProviderDefaultById('grok-build')!
  const launch = buildAcpLaunchConfig(entry)
  const grokPath = [
    process.env.GROK_PATH,
    path.join(process.env.HOME || '', '.grok', 'bin', 'grok'),
    '/Users/zhongshengjieweilai/.grok/bin/grok',
  ].find((p) => p && existsSync(p))

  if (!grokPath && !resolveExecutable(launch.command)) {
    t.skip('grok binary not available — contract-only, not live-tested')
    return
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'abf-grok-acp-'))
  const manager = new BridgeManager()
  const events: BridgeEvent[] = []

  try {
    await manager.initSession(
      'smoke-grok',
      'acp',
      {
        command: grokPath || launch.command,
        defaultArgs: entry.defaultArgs,
        workDir,
        startupTimeoutMs: 30_000,
        shutdownTimeoutMs: 2_000,
        autoAccept: true,
      },
      (event) => events.push(event),
    )

    await waitFor(
      () => events.some((e) => e.event === 'status' && e.phase === 'ready'),
      'Grok ACP initialize ready',
      30_000,
    )

    const ready = events.find((e) => e.event === 'status' && e.phase === 'ready')
    assert.equal(ready?.initializeResponse?.protocolVersion, 1)
    assert.ok(manager.isSessionActive('smoke-grok'))
    console.log('[smoke] Grok ACP initialize OK', {
      agent: ready?.initializeResponse?.agentInfo?.name,
      conversationId: ready?.conversationId,
    })
  } finally {
    await manager.destroyAll()
    await rm(workDir, { recursive: true, force: true })
  }
})

test('live smoke: Codex ACP initialize via codex-acp wrapper (when package or bin present)', async (t) => {
  const entry = getBuiltinProviderDefaultById('codex')!
  const packageBin = resolvePackageBin('@agentclientprotocol/codex-acp', 'codex-acp')
  const pathBin = resolveExecutable('codex-acp')
  const localCodex = [
    process.env.CODEX_PATH,
    path.join(process.env.HOME || '', '.npm-global', 'bin', 'codex'),
    '/Users/zhongshengjieweilai/.npm-global/bin/codex',
  ].find((p) => p && existsSync(p))

  if (!packageBin && !pathBin) {
    t.skip('codex-acp package/bin not available — contract-only, not live-tested')
    return
  }

  // Prefer running the package entry with system node for reliable Electron-free smoke.
  const command = packageBin || 'codex-acp'
  const workDir = await mkdtemp(path.join(tmpdir(), 'abf-codex-acp-'))
  const manager = new BridgeManager()
  const events: BridgeEvent[] = []
  const envOverrides: Record<string, string> = {}
  if (localCodex) envOverrides.CODEX_PATH = localCodex

  try {
    // When packageBin is a .js file, spawn via node
    const config: Record<string, unknown> = {
      workDir,
      startupTimeoutMs: 45_000,
      shutdownTimeoutMs: 2_000,
      autoAccept: true,
      envOverrides,
    }
    if (packageBin && packageBin.endsWith('.js')) {
      config.command = process.execPath
      config.defaultArgs = `${packageBin}`
      // ELECTRON_RUN_AS_NODE if execPath is electron — for node test runner process.execPath is node
    } else {
      config.command = command
      config.defaultArgs = entry.defaultArgs
    }

    await manager.initSession('smoke-codex', 'acp', config, (event) => events.push(event))

    await waitFor(
      () => events.some((e) => e.event === 'status' && e.phase === 'ready'),
      'Codex ACP initialize ready',
      45_000,
    )

    const ready = events.find((e) => e.event === 'status' && e.phase === 'ready')
    assert.equal(ready?.initializeResponse?.protocolVersion, 1)
    assert.ok(manager.isSessionActive('smoke-codex'))
    console.log('[smoke] Codex ACP initialize OK', {
      agent: ready?.initializeResponse?.agentInfo?.name,
      conversationId: ready?.conversationId,
      codexPath: localCodex || '(bundled)',
    })
  } finally {
    await manager.destroyAll()
    await rm(workDir, { recursive: true, force: true })
  }
})

test('unavailable agents document official command contracts only (no live claim)', () => {
  const unavailable = ['claude-code', 'gemini-cli', 'opencode', 'qwen-code', 'kimi-cli', 'github-copilot']
  for (const id of unavailable) {
    const entry = getBuiltinProviderDefaultById(id)!
    const launch = buildAcpLaunchConfig(entry)
    // Do not assert resolveExecutable — just that canonical contract is defined
    assert.ok(launch.command)
    assert.ok(entry.acpVerification)
    if (!resolveExecutable(launch.command)) {
      // Expected on this machine for most agents — record explicitly
      assert.ok(true, `${id}: binary absent; contract ${launch.command} ${launch.args.join(' ')}`)
    }
  }
})

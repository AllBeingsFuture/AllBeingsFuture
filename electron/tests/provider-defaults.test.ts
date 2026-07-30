import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  BUILTIN_PROVIDER_DEFAULTS,
  buildAcpLaunchConfig,
  builtinProviderSeedRows,
  getAcpBuiltinProviders,
  getBuiltinProviderDefaultById,
  getBuiltinProviderDefaults,
  isAcpAdapterType,
  isRetiredBuiltinAdapterType,
  LEGACY_BUILTIN_ACP_UPGRADE_IDS,
  RETIRED_BUILTIN_ADAPTER_TYPES,
} from '../services/provider-defaults.js'
import { ProviderCapabilityRegistry } from '../bridge/ProviderCapabilityRegistry.js'
import { normalizeAdapterType } from '../bridge/bridge.js'
import { extractExecutableTarget, resolveExecutable } from '../services/provider.js'

const REQUIRED_ACP_IDS = [
  'grok-build',
  'claude-code',
  'codex',
  'gemini-cli',
  'opencode',
  'qwen-code',
  'kimi-cli',
  'github-copilot',
] as const

const CANONICAL_ARGV: Record<string, { command: string; args: string[] }> = {
  'claude-code': { command: 'claude-agent-acp', args: [] },
  codex: { command: 'codex-acp', args: [] },
  'gemini-cli': { command: 'gemini', args: ['--acp'] },
  opencode: { command: 'opencode', args: ['acp'] },
  'grok-build': { command: 'grok', args: ['agent', 'stdio'] },
  'qwen-code': { command: 'qwen', args: ['--acp', '--experimental-skills'] },
  'kimi-cli': { command: 'kimi', args: ['acp'] },
  'github-copilot': { command: 'copilot', args: ['--acp'] },
}

test('all eight built-in CLI providers use shared ACP adapter', () => {
  const defaults = getBuiltinProviderDefaults()
  const byId = new Map(defaults.map((entry) => [entry.id, entry]))

  assert.equal(defaults.length, REQUIRED_ACP_IDS.length)

  for (const id of REQUIRED_ACP_IDS) {
    const entry = byId.get(id)
    assert.ok(entry, `missing provider ${id}`)
    if (!entry) continue
    assert.equal(entry.adapterType, 'acp', `${id} must use adapterType acp`)
    assert.ok(entry.command.trim(), `${id} must have a command`)
    assert.ok(entry.acpVerification?.trim(), `${id} must document ACP verification basis`)
    assert.equal(entry.isBuiltin, true)
    assert.equal(entry.isEnabled, true)
    assert.ok(!isRetiredBuiltinAdapterType(entry.adapterType))
  }

  for (const entry of getAcpBuiltinProviders()) {
    assert.equal(entry.adapterType, 'acp')
  }
})

test('canonical ACP argv matches official registry / local CLI contracts', () => {
  for (const entry of getAcpBuiltinProviders()) {
    const launch = buildAcpLaunchConfig(entry)
    assert.deepEqual(launch, CANONICAL_ARGV[entry.id], `unexpected launch for ${entry.id}`)
  }

  assert.deepEqual(
    buildAcpLaunchConfig({
      command: 'grok',
      executablePath: '/opt/xai/bin/grok',
      defaultArgs: 'agent stdio',
    }),
    { command: '/opt/xai/bin/grok', args: ['agent', 'stdio'] },
  )
})

test('seed rows cover every builtin default including default_args', () => {
  const rows = builtinProviderSeedRows()
  assert.equal(rows.length, BUILTIN_PROVIDER_DEFAULTS.length)

  const claude = rows.find((row) => row.id === 'claude-code')
  assert.ok(claude)
  assert.equal(claude!.adapterType, 'acp')
  assert.equal(claude!.command, 'claude-agent-acp')
  assert.equal(claude!.defaultArgs, '')

  const codex = rows.find((row) => row.id === 'codex')
  assert.equal(codex?.command, 'codex-acp')
  assert.equal(codex?.adapterType, 'acp')

  const gemini = rows.find((row) => row.id === 'gemini-cli')
  assert.equal(gemini?.defaultArgs, '--acp')

  const opencode = rows.find((row) => row.id === 'opencode')
  assert.equal(opencode?.defaultArgs, 'acp')

  const grok = rows.find((row) => row.id === 'grok-build')
  assert.equal(grok?.defaultArgs, 'agent stdio')
})

test('Grok Build is first in built-in provider sort order', () => {
  const defaults = getBuiltinProviderDefaults()
  assert.equal(defaults[0]?.id, 'grok-build')
  assert.equal(defaults[0]?.sortOrder, 1)

  const rows = builtinProviderSeedRows()
  const ordered = [...rows].sort((a, b) => a.sortOrder - b.sortOrder)
  assert.equal(ordered[0]?.id, 'grok-build')
  assert.equal(ordered[0]?.sortOrder, 1)

  for (let i = 1; i < ordered.length; i++) {
    assert.ok(
      ordered[i]!.sortOrder > ordered[i - 1]!.sortOrder,
      `sortOrder must be strictly increasing at index ${i}`,
    )
  }
})

test('capability registry registers all ACP builtins with native MCP negotiation', () => {
  for (const id of REQUIRED_ACP_IDS) {
    const cap = ProviderCapabilityRegistry.get(id)
    assert.ok(cap, `capability missing for ${id}`)
    assert.equal(cap!.mcpSupport.native, true)
    assert.equal(ProviderCapabilityRegistry.supportsNativeMcp(id), true)
    assert.equal(cap!.skillSupport.systemPrompt, true)
  }

  const openai = ProviderCapabilityRegistry.get('openai-api')
  assert.ok(openai)
  assert.equal(openai!.mcpSupport.native, false)
})

test('isAcpAdapterType and retired adapter helpers', () => {
  assert.equal(isAcpAdapterType('acp'), true)
  assert.equal(isAcpAdapterType('acp-stdio'), true)
  assert.equal(isAcpAdapterType('ACP'), true)
  assert.equal(isAcpAdapterType('claude-sdk'), false)
  assert.equal(isAcpAdapterType(''), false)

  for (const retired of RETIRED_BUILTIN_ADAPTER_TYPES) {
    assert.equal(isRetiredBuiltinAdapterType(retired), true)
  }
  assert.equal(isRetiredBuiltinAdapterType('acp'), false)
})

test('BridgeManager aliases route all built-in CLI ids to shared acp adapter', () => {
  const cases: Array<[string, string]> = [
    ['claude-sdk', 'acp'],
    ['claude-code', 'acp'],
    ['claude', 'acp'],
    ['codex-appserver', 'acp'],
    ['codex', 'acp'],
    ['codex-acp', 'acp'],
    ['gemini-headless', 'acp'],
    ['gemini-cli', 'acp'],
    ['opencode-sdk', 'acp'],
    ['opencode', 'acp'],
    ['grok-build', 'acp'],
    ['qwen-code', 'acp'],
    ['kimi-cli', 'acp'],
    ['github-copilot', 'acp'],
    ['acp', 'acp'],
    ['acp-stdio', 'acp'],
    ['openai-api', 'openai-api'],
  ]

  for (const [input, expected] of cases) {
    assert.equal(normalizeAdapterType(input), expected, `normalize(${input})`)
  }

  // Command-based inference when adapterType empty
  assert.equal(normalizeAdapterType('', { command: 'claude-agent-acp' }), 'acp')
  assert.equal(normalizeAdapterType('', { command: 'codex-acp' }), 'acp')
  assert.equal(normalizeAdapterType('', { command: 'grok' }), 'acp')
  assert.equal(normalizeAdapterType('', { command: 'gemini' }), 'acp')
  assert.equal(normalizeAdapterType('', { command: 'custom-openai-proxy' }), 'openai-api')
})

test('legacy upgrade id list matches the four historical non-ACP builtins', () => {
  assert.deepEqual([...LEGACY_BUILTIN_ACP_UPGRADE_IDS], [
    'claude-code',
    'codex',
    'gemini-cli',
    'opencode',
  ])
  for (const id of LEGACY_BUILTIN_ACP_UPGRADE_IDS) {
    const entry = getBuiltinProviderDefaultById(id)
    assert.ok(entry)
    assert.equal(entry!.adapterType, 'acp')
  }
})

test('executable detection parses command targets and resolves PATH / absolute paths', () => {
  assert.equal(extractExecutableTarget('grok agent stdio'), 'grok')
  assert.equal(extractExecutableTarget('"C:\\\\Tools\\\\grok.exe" agent stdio'), 'C:\\\\Tools\\\\grok.exe')
  assert.equal(extractExecutableTarget(''), '')

  assert.equal(resolveExecutable(process.execPath), true)
  assert.equal(resolveExecutable('definitely-not-a-real-binary-xyz-12345'), false)
})

test('resolveExecutable finds grok under ~/.grok/bin even when PATH is minimal', () => {
  const home = process.env.HOME || ''
  const grokBin = path.join(home, '.grok', 'bin', 'grok')
  if (!existsSync(grokBin)) {
    // CI / machines without Grok installed — skip without failing the suite.
    return
  }

  const previousPath = process.env.PATH
  process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
  try {
    assert.equal(resolveExecutable('grok'), true, 'should resolve via ~/.grok/bin fallback')
  } finally {
    process.env.PATH = previousPath
  }
})

test('Claude / Codex defaults document host-CLI packaging (no packed natives)', () => {
  const claude = getBuiltinProviderDefaultById('claude-code')!
  const codex = getBuiltinProviderDefaultById('codex')!
  assert.match(claude.acpVerification || '', /CLAUDE_CODE_EXECUTABLE|host Claude|PATH/i)
  assert.match(claude.acpVerification || '', /no packed|host/i)
  assert.match(codex.acpVerification || '', /CODEX_PATH|host codex|PATH/i)
  assert.match(codex.acpVerification || '', /no packed|@openai\/codex/i)
})

test('no private per-model runtime adapter strings remain in defaults', () => {
  for (const entry of BUILTIN_PROVIDER_DEFAULTS) {
    assert.equal(entry.adapterType, 'acp')
    assert.doesNotMatch(entry.adapterType, /claude-sdk|codex-appserver|gemini-headless|opencode-sdk/)
  }
})

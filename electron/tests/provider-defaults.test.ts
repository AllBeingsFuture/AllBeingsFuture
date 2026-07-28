import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILTIN_PROVIDER_DEFAULTS,
  buildAcpLaunchConfig,
  builtinProviderSeedRows,
  getAcpBuiltinProviders,
  getBuiltinProviderDefaults,
  isAcpAdapterType,
} from '../services/provider-defaults.js'
import { ProviderCapabilityRegistry } from '../bridge/ProviderCapabilityRegistry.js'
import { extractExecutableTarget, resolveExecutable } from '../services/provider.js'

const REQUIRED_LEGACY_IDS = ['claude-code', 'codex', 'gemini-cli', 'opencode'] as const
const REQUIRED_ACP_IDS = ['grok-build', 'qwen-code', 'kimi-cli', 'github-copilot'] as const

test('builtin defaults retain legacy providers and add verified ACP presets', () => {
  const defaults = getBuiltinProviderDefaults()
  const byId = new Map(defaults.map((entry) => [entry.id, entry]))

  for (const id of REQUIRED_LEGACY_IDS) {
    assert.ok(byId.has(id), `missing legacy provider ${id}`)
    assert.notEqual(byId.get(id)?.adapterType, 'acp')
  }

  for (const id of REQUIRED_ACP_IDS) {
    const entry = byId.get(id)
    assert.ok(entry, `missing ACP provider ${id}`)
    if (!entry) continue
    assert.equal(entry.adapterType, 'acp')
    assert.ok(entry.command.trim(), `${id} must have a command`)
    assert.ok(entry.defaultArgs.trim(), `${id} must declare ACP launch args`)
    assert.ok(entry.acpVerification?.trim(), `${id} must document ACP verification basis`)
    assert.equal(entry.isBuiltin, true)
    assert.equal(entry.isEnabled, true)
  }

  assert.ok(defaults.length >= REQUIRED_LEGACY_IDS.length + REQUIRED_ACP_IDS.length)
  // No private streaming adapters for the new agents
  for (const entry of getAcpBuiltinProviders()) {
    assert.equal(entry.adapterType, 'acp')
  }
})

test('ACP launch configs match verified CLI invocations', () => {
  const expected: Record<string, { command: string; args: string[] }> = {
    'grok-build': { command: 'grok', args: ['agent', 'stdio'] },
    'qwen-code': { command: 'qwen', args: ['--acp', '--experimental-skills'] },
    'kimi-cli': { command: 'kimi', args: ['acp'] },
    'github-copilot': { command: 'copilot', args: ['--acp'] },
  }

  for (const entry of getAcpBuiltinProviders()) {
    const launch = buildAcpLaunchConfig(entry)
    assert.deepEqual(launch, expected[entry.id], `unexpected launch for ${entry.id}`)
  }

  // executablePath overrides command basename
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

  const grok = rows.find((row) => row.id === 'grok-build')
  assert.ok(grok)
  assert.equal(grok!.adapterType, 'acp')
  assert.equal(grok!.defaultArgs, 'agent stdio')
  assert.equal(grok!.command, 'grok')
  assert.equal(grok!.isEnabled, 1)

  const qwen = rows.find((row) => row.id === 'qwen-code')
  assert.equal(qwen?.defaultArgs, '--acp --experimental-skills')
})

test('capability registry registers ACP builtins with native MCP negotiation', () => {
  for (const id of REQUIRED_ACP_IDS) {
    const cap = ProviderCapabilityRegistry.get(id)
    assert.ok(cap, `capability missing for ${id}`)
    assert.equal(cap!.mcpSupport.native, true)
    assert.equal(ProviderCapabilityRegistry.supportsNativeMcp(id), true)
    assert.equal(cap!.skillSupport.systemPrompt, true)
  }
})

test('isAcpAdapterType recognizes shared ACP adapter aliases', () => {
  assert.equal(isAcpAdapterType('acp'), true)
  assert.equal(isAcpAdapterType('acp-stdio'), true)
  assert.equal(isAcpAdapterType('ACP'), true)
  assert.equal(isAcpAdapterType('claude-sdk'), false)
  assert.equal(isAcpAdapterType(''), false)
})

test('executable detection parses command targets and resolves PATH / absolute paths', () => {
  assert.equal(extractExecutableTarget('grok agent stdio'), 'grok')
  assert.equal(extractExecutableTarget('"C:\\\\Tools\\\\grok.exe" agent stdio'), 'C:\\\\Tools\\\\grok.exe')
  assert.equal(extractExecutableTarget(''), '')

  // node itself is always resolvable on the current PATH for this test runner
  assert.equal(resolveExecutable(process.execPath), true)
  assert.equal(resolveExecutable('definitely-not-a-real-binary-xyz-12345'), false)

  // Absolute path to this process binary
  assert.equal(resolveExecutable(process.execPath), true)
})

test('ACP builtin commands use the shared adapter type only', () => {
  for (const entry of BUILTIN_PROVIDER_DEFAULTS) {
    if (REQUIRED_ACP_IDS.includes(entry.id as (typeof REQUIRED_ACP_IDS)[number])) {
      assert.equal(entry.adapterType, 'acp')
      // No per-model runtime adapter strings
      assert.doesNotMatch(entry.adapterType, /grok-sdk|qwen-sdk|kimi-sdk|copilot-sdk/)
    }
  }
})

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  PACKAGING_ASAR_UNPACK_ALLOWED_PREFIXES,
  PACKAGING_ASAR_UNPACK_FORBIDDEN_SUBSTRINGS,
  PACKAGING_NATIVE_CLI_EXCLUDE_GLOBS,
  missingHostCliError,
  resolveClaudeCodeExecutable,
  resolveCodexCliPath,
  resolveGrokCliPath,
  resolveHostCliPath,
} from '../services/cli-path-resolve.js'

// Compiled tests live under .task/allbeingsfuture-backend-tests/tests → repo is 3 levels up.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

test('resolveHostCliPath prefers executablePath then env then search', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'abf-cli-'))
  try {
    const binDir = path.join(root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const binary = path.join(binDir, 'mycli')
    writeFileSync(binary, '#!/bin/sh\n', { mode: 0o755 })

    assert.equal(
      resolveHostCliPath({ commandName: 'mycli', executablePath: binary }),
      binary,
    )

    const prev = process.env.MYCLI_PATH
    process.env.MYCLI_PATH = binary
    try {
      assert.equal(
        resolveHostCliPath({ commandName: 'mycli', envKeys: ['MYCLI_PATH'] }),
        binary,
      )
    } finally {
      if (prev === undefined) delete process.env.MYCLI_PATH
      else process.env.MYCLI_PATH = prev
    }

    assert.equal(
      resolveHostCliPath({
        commandName: 'mycli',
        extraCandidates: [binary],
      }),
      binary,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveHostCliPath ignores ACP wrapper basenames as host CLI', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'abf-cli-wrap-'))
  try {
    const wrapper = path.join(root, 'codex-acp')
    writeFileSync(wrapper, '#!/bin/sh\n', { mode: 0o755 })
    // Unique command name so PATH does not supply a real binary after skipping wrapper.
    assert.equal(
      resolveHostCliPath({
        commandName: 'codex-host-cli-abf-unique-xyz',
        executablePath: wrapper,
      }),
      undefined,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('missingHostCliError messages mention install / env (Grok-level clarity)', () => {
  const codex = missingHostCliError('codex')
  assert.match(codex.message, /CLI not found/i)
  assert.match(codex.message, /CODEX_PATH/)
  assert.match(codex.message, /no longer ships/i)

  const claude = missingHostCliError('claude')
  assert.match(claude.message, /CLAUDE_CODE_EXECUTABLE/)
  assert.match(claude.message, /no longer ships/i)

  const grok = missingHostCliError('grok')
  assert.match(grok.message, /GROK_PATH/)
})

test('resolve* helpers do not throw when binaries are absent', () => {
  // Smoke: pure resolve, no throw
  resolveGrokCliPath('/definitely/missing/grok-binary-xyz')
  resolveCodexCliPath('/definitely/missing/codex-binary-xyz')
  resolveClaudeCodeExecutable('/definitely/missing/claude-binary-xyz')
  assert.equal(resolveHostCliPath({ commandName: 'no-such-cli-abf-xyz-999' }), undefined)
})

test('package.json packaging excludes natives and narrows asarUnpack', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    build?: { files?: string[]; asarUnpack?: string[] }
  }

  assert.ok(!pkg.dependencies?.['@anthropic-ai/claude-agent-sdk'],
    'direct claude-agent-sdk dependency must be removed (host CLI model)')

  const files = pkg.build?.files || []
  for (const glob of PACKAGING_NATIVE_CLI_EXCLUDE_GLOBS) {
    assert.ok(
      files.includes(glob),
      `build.files must include exclude ${glob}`,
    )
  }

  const unpack = pkg.build?.asarUnpack || []
  for (const entry of unpack) {
    for (const forbidden of PACKAGING_ASAR_UNPACK_FORBIDDEN_SUBSTRINGS) {
      assert.ok(
        !entry.includes(forbidden),
        `asarUnpack must not include ${forbidden}: ${entry}`,
      )
    }
    const allowed = PACKAGING_ASAR_UNPACK_ALLOWED_PREFIXES.some((prefix) =>
      entry.startsWith(prefix) || entry.startsWith(prefix.replace(/\/$/, '')),
    )
    assert.ok(allowed, `asarUnpack entry not in allowlist: ${entry}`)
  }

  // Must still unpack thin wrappers
  assert.ok(unpack.some((e) => e.includes('claude-agent-acp')))
  assert.ok(unpack.some((e) => e.includes('codex-acp')))
})

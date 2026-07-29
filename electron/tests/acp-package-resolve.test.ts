import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  assertSpawnableEntrypoint,
  isInsideAsarArchive,
  resolveBundledAcpWrapperEntry,
  toSpawnableFilesystemPath,
} from '../bridge/acp-package-resolve.js'
import { resolveProcessCommand } from '../bridge/runtime.js'

test('isInsideAsarArchive distinguishes asar from unpacked', () => {
  assert.equal(
    isInsideAsarArchive('/App/Contents/Resources/app.asar/node_modules/x/index.js'),
    true,
  )
  assert.equal(
    isInsideAsarArchive('/App/Contents/Resources/app.asar.unpacked/node_modules/x/index.js'),
    false,
  )
  assert.equal(isInsideAsarArchive('/opt/bin/codex-acp'), false)
})

test('toSpawnableFilesystemPath rewrites asar → unpacked when twin exists', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'abf-asar-'))
  try {
    const asarEntry = path.join(root, 'app.asar', 'node_modules', 'pkg', 'index.js')
    const unpackedEntry = path.join(root, 'app.asar.unpacked', 'node_modules', 'pkg', 'index.js')
    mkdirSync(path.dirname(asarEntry), { recursive: true })
    mkdirSync(path.dirname(unpackedEntry), { recursive: true })
    writeFileSync(asarEntry, 'asar-only')
    writeFileSync(unpackedEntry, 'unpacked')

    const resolved = toSpawnableFilesystemPath(asarEntry)
    assert.equal(resolved, unpackedEntry)
    assert.equal(isInsideAsarArchive(resolved!), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('assertSpawnableEntrypoint rejects asar-only paths', () => {
  assert.throws(
    () => assertSpawnableEntrypoint('/App/Contents/Resources/app.asar/node_modules/x.js', 'x'),
    /app\.asar/,
  )
})

test('resolveProcessCommand for codex-acp yields spawnable node + entry (dev workspace)', () => {
  const resolved = resolveProcessCommand('codex-acp', '')
  assert.ok(resolved.shimEntrypoint, 'must expose JS entry')
  assert.equal(isInsideAsarArchive(resolved.shimEntrypoint!), false)
  assert.ok(
    resolved.shimEntrypoint!.includes(`${path.sep}codex-acp${path.sep}`)
      || resolved.shimEntrypoint!.endsWith('index.js'),
  )
  assert.ok(resolved.args[0] === resolved.shimEntrypoint)
  // Runner is a real node/electron binary path or 'node'
  assert.ok(resolved.command)
  assert.equal(resolved.shell, false)
})

test('resolveProcessCommand for claude-agent-acp yields spawnable entry (dev workspace)', () => {
  const resolved = resolveProcessCommand('claude-agent-acp', '')
  assert.ok(resolved.shimEntrypoint)
  assert.equal(isInsideAsarArchive(resolved.shimEntrypoint!), false)
  assert.ok(resolved.shimEntrypoint!.includes('claude-agent-acp'))
})

test('resolveBundledAcpWrapperEntry finds workspace packages', () => {
  const codex = resolveBundledAcpWrapperEntry('codex-acp')
  const claude = resolveBundledAcpWrapperEntry('claude-agent-acp')
  assert.ok(codex && codex.endsWith(`${path.sep}index.js`))
  assert.ok(claude && claude.endsWith(`${path.sep}index.js`))
  assert.equal(isInsideAsarArchive(codex!), false)
  assert.equal(isInsideAsarArchive(claude!), false)
})

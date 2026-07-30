/**
 * Critical security gates: managed worktree removal, file-transfer paths, static contracts.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { GitService, isManagedAbfWorktreePath } from '../services/git.js'
import { FileTransferService } from '../services/file-transfer.js'

const compiledDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(compiledDir, '../../..')

function readSource(rel: string): string {
  return readFileSync(path.join(workspaceRoot, rel), 'utf8')
}

function mkTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

// ---------------------------------------------------------------------------
// isManagedAbfWorktreePath + removeWorktree gate
// ---------------------------------------------------------------------------

test('isManagedAbfWorktreePath accepts only ABF isolation roots', () => {
  const repo = '/Users/me/project'
  assert.equal(
    isManagedAbfWorktreePath(repo, '/Users/me/project/.allbeingsfuture-worktrees/child-1'),
    true,
  )
  assert.equal(
    isManagedAbfWorktreePath(repo, '/Users/me/project/.abf-worktrees/child-2'),
    true,
  )
  assert.equal(isManagedAbfWorktreePath(repo, '/Users/me/project'), false)
  assert.equal(isManagedAbfWorktreePath(repo, '/Users/me/project/src'), false)
  assert.equal(isManagedAbfWorktreePath(repo, '/tmp/evil'), false)
  assert.equal(isManagedAbfWorktreePath(repo, '/Users/me/other/.allbeingsfuture-worktrees/x'), false)
  assert.equal(isManagedAbfWorktreePath('', '/Users/me/project/.allbeingsfuture-worktrees/x'), false)
  assert.equal(isManagedAbfWorktreePath(repo, ''), false)
})

test('removeWorktree rejects main repo and non-managed paths', async () => {
  const git = new GitService()
  const repo = mkTmpDir('abf-sec-repo-')
  try {
    // Main checkout path
    await assert.rejects(
      () => git.removeWorktree(repo, repo),
      /refused|main repository|not an ABF-managed/i,
    )
    // Arbitrary path under repo but not managed
    await assert.rejects(
      () => git.removeWorktree(repo, path.join(repo, 'src')),
      /refused|not an ABF-managed/i,
    )
    // Path outside repo that looks managed under another root
    await assert.rejects(
      () => git.removeWorktree(repo, path.join(os.tmpdir(), '.allbeingsfuture-worktrees', 'x')),
      /refused|not an ABF-managed/i,
    )
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('removeWorktree source calls isManagedAbfWorktreePath before remove/rm', () => {
  const source = readSource('electron/services/git.ts')
  assert.match(source, /export function isManagedAbfWorktreePath/)
  const removeIdx = source.indexOf('async removeWorktree')
  assert.ok(removeIdx > 0)
  const removeBody = source.slice(removeIdx, removeIdx + 1800)
  assert.match(removeBody, /isManagedAbfWorktreePath/)
  const gateIdx = removeBody.indexOf('isManagedAbfWorktreePath')
  const gitRemoveIdx = removeBody.indexOf("worktree', 'remove'")
  const rmIdx = removeBody.indexOf('rm(normalizedWorktreePath')
  assert.ok(gateIdx >= 0 && gitRemoveIdx > gateIdx, 'gate must run before git worktree remove')
  assert.ok(rmIdx > gateIdx, 'gate must run before rm fallback')
})

// ---------------------------------------------------------------------------
// saveDroppedFile path traversal
// ---------------------------------------------------------------------------

test('saveDroppedFile keeps path under allbeingsfuture-drops for traversal names', () => {
  const svc = new FileTransferService()
  const dropsRoot = path.resolve(os.tmpdir(), 'allbeingsfuture-drops')
  const payload = Buffer.from('hello-security').toString('base64')

  const cases = [
    '../../../etc/passwd',
    '..\\..\\windows\\system32\\evil.txt',
    '/etc/passwd',
    'C:\\Windows\\System32\\evil.txt',
    'subdir/nested.txt',
    '....//....//secret',
  ]

  const written: string[] = []
  try {
    for (const name of cases) {
      const out = svc.saveDroppedFile(name, payload)
      written.push(out)
      const normalizedOut = path.resolve(out).replace(/\\/g, '/')
      const normalizedRoot = dropsRoot.replace(/\\/g, '/')
      assert.ok(
        normalizedOut === normalizedRoot || normalizedOut.startsWith(`${normalizedRoot}/`),
        `expected under drops dir, got ${out} for name ${name}`,
      )
      assert.equal(path.basename(out).includes('..'), false)
      assert.ok(fs.existsSync(out))
    }
  } finally {
    for (const f of written) {
      try { fs.unlinkSync(f) } catch { /* ignore */ }
    }
  }
})

// ---------------------------------------------------------------------------
// prepareFile whitelist / size / symlink
// ---------------------------------------------------------------------------

test('prepareFile rejects missing paths and out-of-whitelist paths', () => {
  const svc = new FileTransferService()
  // Restrict roots so we can force rejection of a path under a temp dir we control
  // that is NOT under homedir/tmpdir if we set empty then only add one root.
  const allowedOnly = mkTmpDir('abf-sec-allowed-')
  const outside = mkTmpDir('abf-sec-outside-')
  const outsideFile = path.join(outside, 'secret.txt')
  fs.writeFileSync(outsideFile, 'nope')

  try {
    svc.setAllowedRoots([allowedOnly])

    assert.throws(() => svc.prepareFile(path.join(outside, 'missing.txt')), /not found/i)
    assert.throws(() => svc.prepareFile(outsideFile), /outside allowed roots/i)

    const okFile = path.join(allowedOnly, 'ok.txt')
    fs.writeFileSync(okFile, 'yes')
    const prepared = svc.prepareFile(okFile)
    assert.equal(prepared.filename, 'ok.txt')
    assert.equal(prepared.isDirectory, false)
    assert.ok(prepared.base64Data)

    // Directory metadata under whitelist is allowed
    const dirMeta = svc.prepareFile(allowedOnly)
    assert.equal(dirMeta.isDirectory, true)
    assert.equal(dirMeta.base64Data, '')
  } finally {
    fs.rmSync(allowedOnly, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})

test('prepareFile rejects files over max size', () => {
  const svc = new FileTransferService()
  const dir = mkTmpDir('abf-sec-size-')
  const big = path.join(dir, 'big.bin')
  try {
    svc.setAllowedRoots([dir])
    // 100MB + 1 byte
    const fd = fs.openSync(big, 'w')
    fs.ftruncateSync(fd, 100 * 1024 * 1024 + 1)
    fs.closeSync(fd)

    assert.throws(() => svc.prepareFile(big), /exceeds max allowed/i)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('prepareFile rejects symlink escape outside allowed roots', () => {
  const svc = new FileTransferService()
  const allowed = mkTmpDir('abf-sec-sym-a-')
  const outside = mkTmpDir('abf-sec-sym-b-')
  const target = path.join(outside, 'secret.txt')
  const link = path.join(allowed, 'escape-link')
  fs.writeFileSync(target, 'secret')

  try {
    fs.symlinkSync(target, link)
  } catch (err: any) {
    // Windows may require elevation for symlinks — skip cleanly
    if (err?.code === 'EPERM' || err?.code === 'EACCES' || process.platform === 'win32') {
      fs.rmSync(allowed, { recursive: true, force: true })
      fs.rmSync(outside, { recursive: true, force: true })
      return
    }
    throw err
  }

  try {
    svc.setAllowedRoots([allowed])
    assert.throws(() => svc.prepareFile(link), /outside allowed roots/i)
  } finally {
    fs.rmSync(allowed, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Static contracts: main navigation / openExternal / preload allowlists
// ---------------------------------------------------------------------------

test('main.ts will-navigate defaults to preventDefault for non-app origins', () => {
  const source = readSource('electron/main.ts')
  assert.match(source, /will-navigate/)
  assert.match(source, /preventDefault/)
  assert.match(source, /APP_SCHEME|app:\/\//)
  assert.match(source, /localhost/)
})

test('main.ts openExternal only allows http/https', () => {
  const source = readSource('electron/main.ts')
  assert.match(source, /app:openExternal/)
  assert.match(source, /protocol !== 'http:'/)
  assert.match(source, /protocol !== 'https:'/)
})

test('preload invoke/on/send whitelist unknown channels', () => {
  for (const rel of ['electron/preload.ts', 'electron/preload.cjs']) {
    const source = readSource(rel)
    assert.match(source, /INVOKE_CHANNELS/)
    assert.match(source, /EVENT_CHANNELS/)
    assert.match(source, /SEND_CHANNELS/)
    assert.match(source, /not allowed/)
    assert.match(source, /native-files-dropped/)
    assert.match(source, /chat:update/)
    assert.match(source, /SessionService\.GetAll/)
  }
})

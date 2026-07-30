/**
 * Static contracts: AO-style async spawn + child worktree isolation + prompt wording.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Compiled under .task/.../tests → walk up to repo root (same as supervisor-prompt-inject).
const compiledDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(compiledDir, '../../..')
const electronRoot = path.join(workspaceRoot, 'electron')

function read(rel: string): string {
  return readFileSync(path.join(workspaceRoot, rel), 'utf8')
}

test('agent-api spawn defaults to fire-and-forget (spawnChildSession), wait=true uses AndWait', () => {
  const source = read('electron/services/agent-api.ts')
  assert.match(source, /wait === true/)
  assert.match(source, /spawnChildSessionAndWait/)
  assert.match(source, /spawnChildSession\(/)
  // Default path must not force AndWait without the wait flag
  assert.match(source, /waited:\s*false/)
})

test('agent-api send defaults to deliver-only; wait=true blocks', () => {
  const source = read('electron/services/agent-api.ts')
  assert.match(source, /sendToChildAndWait/)
  assert.match(source, /sendToChild\(/)
  assert.match(source, /delivered:\s*true/)
})

test('MCP spawn_agent / send_to_agent expose wait and default async copy', () => {
  const source = read('electron/embedded-assets/mcps/agent-control/server.mjs')
  assert.match(source, /Does NOT wait for the child/)
  assert.match(source, /args\.wait === true/)
  assert.match(source, /Parent can go idle/)
  assert.match(source, /wait_agent_idle/)
  assert.match(source, /AO-style/)
})

test('child spawn isolates worktree when autoWorktree on; close cleans only child', () => {
  const source = read('electron/services/agent-lifecycle.ts')
  assert.match(source, /tryIsolateChildWorktree/)
  assert.match(source, /cleanupChildWorktree/)
  assert.match(source, /getAutoWorktree/)
  assert.match(source, /createWorktree/)
  assert.match(source, /removeWorktree/)
  assert.match(source, /setWorktreeInfo/)
  assert.match(source, /bootstrapPersistentChild/)
  // Must refuse removing parent paths
  assert.match(source, /Child worktree cleanup refused/)
  assert.match(source, /isManagedAbfWorktreePath/)
  assert.match(source, /cleanupChildWorktree\(parent, child\)/)
})

test('ProcessService wires GitService + SettingsService into AgentLifecycleManager', () => {
  const source = read('electron/services/process.ts')
  assert.match(source, /new GitService\s*\(/)
  assert.match(source, /settingsService/)
  assert.match(source, /AgentLifecycleManager\s*\(/)
})

test('abf-supervisor prompt documents async spawn, parent idle, close safety', () => {
  const source = read('resources/prompts/abf-supervisor.md')
  assert.match(source, /async dispatch/i)
  assert.match(source, /parent (session )?free|keep the parent session free|parent free/i)
  assert.match(source, /wait=true/)
  assert.match(source, /isolated git worktree/i)
  assert.match(source, /close_agent/)
  assert.match(source, /worktree/)
  assert.match(source, /workDir/)
  assert.match(source, /Brevity is mandatory/i)
  // Hard rule: must close after accept/merge; idle is not finished
  assert.match(source, /MUST `close_agent` after accept\/merge|MUST close_agent after accept/i)
  assert.match(source, /idle.*待命|待命.*idle/)
  assert.doesNotMatch(source, /wait for the first turn.*by default/i)
  // Hard ban: never publish worktree-* isolation branches to origin
  assert.match(source, /Never publish session isolation branches/i)
  assert.match(source, /worktree-\*/)
  assert.match(source, /git push origin <base>|push origin <base>/i)
})

test('abf-supervisor Memory requires mempalace_checkpoint for important conclusions', () => {
  const source = read('resources/prompts/abf-supervisor.md')
  assert.match(source, /## Memory \(mempalace\)/)
  assert.match(source, /mempalace_checkpoint/)
  assert.match(source, /items:.*wing.*room.*content|wing.*room.*content/i)
  assert.match(source, /must.*call|you \*\*must\*\* call/i)
  assert.match(source, /Orchestration sessions still file|reusable conclusions/i)
  assert.match(source, /peer lock|retry once/i)
})

test('abf-worker prompt documents worktree isolation, commit, mempalace, must close sons', () => {
  const source = read('resources/prompts/abf-worker.md')
  assert.match(source, /worktree/i)
  assert.match(source, /mempalace/)
  assert.match(source, /mempalace_checkpoint/)
  assert.match(source, /commit/i)
  assert.match(source, /workDir/)
  assert.match(source, /MUST `close_agent`|MUST close_agent/)
  assert.match(source, /Never `git push` isolation branches|Never git push isolation/i)
  // Finish-gate: at least one checkpoint before done
  assert.match(source, /Before finishing.*mempalace_checkpoint|at least once/i)
  assert.match(source, /peer lock|retry once/i)
})

test('git service deletes remote isolation branches on worktree cleanup', () => {
  const source = read('electron/services/git.ts')
  assert.match(source, /export function isAbfIsolationBranch/)
  assert.match(source, /deleteRemoteIsolationBranch/)
  assert.match(source, /push',\s*'origin',\s*'--delete'/)
  assert.match(source, /name\.startsWith\('worktree-'\)/)
})

test('close_agent tool text requires close after accept; handlers expose UI CloseChildSession', () => {
  const mcp = read('electron/embedded-assets/mcps/agent-control/server.mjs')
  assert.match(mcp, /REQUIRED after you accept\/merge/)
  assert.match(mcp, /idle\/待命 is NOT finished/)
  const handlers = read('electron/ipc/handlers.ts')
  assert.match(handlers, /ProcessService\.CloseChildSession/)
  assert.match(handlers, /closeChildSession/)
})
test('trackedAgentToInfo fills workDir from child session', () => {
  const source = read('electron/services/agent-lifecycle.ts')
  assert.match(source, /trackedAgentToInfo/)
  assert.match(source, /session\?\.worktreePath \|\| session\?\.workingDirectory/)
  assert.doesNotMatch(source, /workDir:\s*''/)
})

test('sendToChild interrupts first then marks running then sends without second interrupt', () => {
  const source = read('electron/services/agent-lifecycle.ts')
  const block = source.match(/async sendToChild\([\s\S]*?^  async sendToChildAndWait/m)
  assert.ok(block, 'expected sendToChild method body')
  const body = block[0]
  const interruptAt = body.indexOf('interruptTurn')
  const runningAt = body.indexOf("updatePersistentAgentStatus")
  const sendAt = body.lastIndexOf('sendMessage')
  assert.ok(interruptAt >= 0, 'sendToChild must call interruptTurn')
  assert.ok(runningAt > interruptAt, 'running status must be set after interrupt')
  assert.ok(sendAt > runningAt, 'sendMessage must come after marking running')
  // Must not pass interrupt:true on the send after explicit interruptTurn
  assert.doesNotMatch(body, /sendMessage\([^)]*interrupt:\s*true/)
})

test('interrupt done must not idle-finalize persistent child; sendMessage re-marks running', () => {
  const processSrc = read('electron/services/process.ts')
  assert.match(processSrc, /doneIsFromInterrupt/)
  assert.match(processSrc, /Skipping persistent-child idle finalize after interrupt/)
  assert.match(processSrc, /markPersistentChildRunningIfNeeded/)
  // sendMessage sets streaming then dual-insurance running
  const sendBlock = processSrc.match(/async sendMessage\([\s\S]*?bridgeManager\.sendMessage/)
  assert.ok(sendBlock, 'expected sendMessage body')
  assert.match(sendBlock[0], /markPersistentChildRunningIfNeeded/)
  assert.match(sendBlock[0], /state\.streaming = true/)
})

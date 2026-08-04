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

test('agent-api send defaults to deliver-only; wait=true blocks; interrupt only when true', () => {
  const source = read('electron/services/agent-api.ts')
  assert.match(source, /sendToChildAndWait/)
  assert.match(source, /sendToChild\(/)
  assert.match(source, /delivered:\s*true/)
  assert.match(source, /body\.interrupt === true/)
  assert.match(source, /sendOpts/)
})

test('MCP spawn_agent / send_to_agent expose wait and default async copy', () => {
  const source = read('electron/embedded-assets/mcps/agent-control/server.mjs')
  assert.match(source, /Does NOT wait for the child/)
  assert.match(source, /args\.wait === true/)
  assert.match(source, /Parent can go idle/)
  assert.match(source, /wait_agent_idle/)
  assert.match(source, /AO-style/)
  // send_to_agent: default queue, optional interrupt
  assert.match(source, /queue_after_turn/)
  assert.match(source, /args\.interrupt === true/)
  assert.match(source, /interrupt/)
  assert.doesNotMatch(
    source,
    /Interrupt-then-send: if the child is mid-turn\/streaming, the host cancels/,
  )
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
  // Father should spawn sons for non-trivial; son is leaf (three-gen)
  assert.match(source, /must spawn 儿子|spawn sons for non-trivial/i)
  assert.match(source, /must not.*spawn further|three-generation cap/i)
})

test('abf-supervisor Memory requires mempalace_checkpoint for important conclusions', () => {
  const source = read('resources/prompts/abf-supervisor.md')
  assert.match(source, /## Memory \(mempalace\)/)
  assert.match(source, /mempalace_checkpoint/)
  assert.match(source, /items:.*wing.*room.*content|wing.*room.*content/i)
  assert.match(source, /must.*call|you \*\*must\*\* call/i)
  assert.match(source, /Orchestration sessions still file|reusable conclusions/i)
  assert.match(source, /peer lock|write lock busy/i)
  assert.match(source, /1\s*[–-]\s*2\s*times|retry at most/i)
  assert.match(source, /2\s*min|queues?|do not abandon|still-running/i)
  assert.match(source, /skip checkpoint|report skipped|skip and report/i)
  // Must not reintroduce abandon-early 15–20s guidance (conflicts with ~2min proxy queue)
  assert.doesNotMatch(source, /15\s*[–-]\s*20s/)
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
  assert.match(source, /peer lock|write lock busy/i)
  assert.match(source, /1\s*[–-]\s*2\s*times|retry at most/i)
  assert.match(source, /2\s*min|queues?|do not abandon|still-running/i)
  assert.match(source, /skip checkpoint|report skipped|skip and report/i)
  assert.doesNotMatch(source, /15\s*[–-]\s*20s/)
})

test('abf-worker requires spawn sons for non-trivial when agent-control present', () => {
  const source = read('resources/prompts/abf-worker.md')
  // Must not regress to "prefer implement yourself" for multi-file work
  assert.doesNotMatch(source, /Prefer implementing a single coherent task yourself/)
  assert.match(source, /REQUIRED when agent-control present|orchestration of 儿子 is mandatory/i)
  assert.match(source, /Must spawn 儿子|必须.*spawn_agent/i)
  assert.match(source, /Do it yourself \(trivial only\)|trivial only/i)
  assert.match(source, /Hard ban for 父亲 when agent-control|Hard ban for 父亲/i)
  assert.match(source, /multi-file|多文件/)
  assert.match(source, /Sons are leaves|three-gen cap|Generation cap/i)
  // Father is still implementer/owner — not pure Supervisor hard-ban on all work
  assert.doesNotMatch(source, /# ABF Supervisor/)
  assert.match(source, /ABF Worker|implementation Worker/i)
})

test('agent-lifecycle enforces three-gen spawn cap (nested son cannot spawn)', () => {
  const source = read('electron/services/agent-lifecycle.ts')
  assert.match(source, /resolveAbfSessionRole/)
  assert.match(source, /shouldInjectAgentControl/)
  assert.match(source, /Three-generation cap/)
  assert.match(source, /nested sons cannot spawn/i)
  // Worktree for every child still based on parent branch/workDir
  assert.match(source, /Prefer parent's live branch so nested children/)
})

test('git service deletes remote isolation branches on worktree cleanup', () => {
  const source = read('electron/services/git.ts')
  assert.match(source, /export function isAbfIsolationBranch/)
  assert.match(source, /deleteRemoteIsolationBranch/)
  assert.match(source, /push',\s*'origin',\s*'--delete'/)
  assert.match(source, /name\.startsWith\('worktree-'\)/)
  // Must not block removeWorktree on network: fire-and-forget + timeouts
  assert.match(source, /void this\.deleteRemoteIsolationBranch/)
  assert.match(source, /timeoutMs:\s*8_000|timeoutMs:\s*8000/)
  assert.match(source, /timeoutMs:\s*15_000|timeoutMs:\s*15000/)
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

test('sendToChild default path does not interrupt; interrupt=true only cancels then sends', () => {
  const source = read('electron/services/agent-lifecycle.ts')
  const block = source.match(/async sendToChild\([\s\S]*?^  async sendToChildAndWait/m)
  assert.ok(block, 'expected sendToChild method body')
  const body = block[0]
  // Default is queue_after_turn; interrupt only when opts.interrupt === true
  assert.match(body, /opts\?\.interrupt === true/)
  assert.match(body, /if \(interrupt\)/)
  assert.match(body, /interruptTurn/)
  assert.match(body, /queue_after_turn|streaming/)
  const runningAt = body.indexOf('updatePersistentAgentStatus')
  const sendAt = body.lastIndexOf('sendMessage')
  assert.ok(runningAt >= 0, 'must mark running')
  assert.ok(sendAt > runningAt, 'sendMessage must come after marking running')
  // Must not pass interrupt:true on sendMessage (interrupt is separate, optional)
  assert.doesNotMatch(body, /sendMessage\([^)]*interrupt:\s*true/)
})

test('sendToChildAndWait default waits for idle when streaming; interrupt path cancels first', () => {
  const source = read('electron/services/agent-lifecycle.ts')
  const block = source.match(/async sendToChildAndWait\([\s\S]*?^  async closeChildSession/m)
  assert.ok(block, 'expected sendToChildAndWait method body')
  const body = block[0]
  assert.match(body, /opts\?\.interrupt === true/)
  assert.match(body, /waitAgentIdle/)
  assert.match(body, /childState\?\.streaming/)
  assert.match(body, /interruptTurn/)
  assert.doesNotMatch(body, /sendMessage\([^)]*interrupt:\s*true/)
})

test('stopProcess does not finalize/cancel child agents; disposeSession still does', () => {
  const processSrc = read('electron/services/process.ts')
  const stop = processSrc.match(
    /async stopProcess\(sessionId: string\): Promise<void> \{[\s\S]*?\n  \}/,
  )
  assert.ok(stop, 'expected stopProcess')
  assert.doesNotMatch(
    stop[0],
    /finalizeChildAgents/,
    'stopProcess must not cascade-cancel sub-agents',
  )
  assert.match(stop[0], /Do NOT cascade-cancel|do not cascade/i)

  const dispose = processSrc.match(
    /async disposeSession\(sessionId: string\): Promise<void> \{[\s\S]*?\n  \}/,
  )
  assert.ok(dispose, 'expected disposeSession')
  assert.match(dispose[0], /finalizeChildAgents\(sessionId, 'cancelled'/)
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

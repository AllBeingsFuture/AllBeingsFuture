/**
 * Static contracts: AO-style async spawn + child worktree isolation + prompt wording.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = path.resolve(electronRoot, '..')

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
  assert.match(source, /异步派活/)
  assert.match(source, /父空闲|保持可空闲|进入空闲/)
  assert.match(source, /wait=true/)
  assert.match(source, /独立 git worktree/)
  assert.match(source, /close_agent/)
  assert.match(source, /worktree/)
  assert.match(source, /workDir/)
  assert.doesNotMatch(source, /等待首轮结束.*默认/)
})

test('abf-worker prompt documents worktree isolation, commit, mempalace', () => {
  const source = read('resources/prompts/abf-worker.md')
  assert.match(source, /worktree/i)
  assert.match(source, /mempalace/)
  assert.match(source, /mempalace_checkpoint/)
  assert.match(source, /commit|提交/)
  assert.match(source, /workDir/)
})

test('trackedAgentToInfo fills workDir from child session', () => {
  const source = read('electron/services/agent-lifecycle.ts')
  assert.match(source, /trackedAgentToInfo/)
  assert.match(source, /session\?\.worktreePath \|\| session\?\.workingDirectory/)
  assert.doesNotMatch(source, /workDir:\s*''/)
})

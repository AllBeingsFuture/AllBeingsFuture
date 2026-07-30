/**
 * ABF rule injection must target the agent runtime cwd.
 *
 * When a session uses git worktree isolation:
 *   - agent cwd / config.workDir = worktree under .allbeingsfuture-worktrees/...
 *   - session.worktreeSourceRepo = main repo
 *
 * Inject/cleanup must use the worktree (workDir), never the source repo.
 * Claude already used workDir; CLI providers must match.
 */
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { register } from 'node:module'
import test from 'node:test'

const compiledDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(compiledDir, '../../..')
const electronRoot = path.join(workspaceRoot, 'electron')
const processSourcePath = path.join(electronRoot, 'services/process.ts')
const promptsDir = path.join(workspaceRoot, 'resources', 'prompts')

const AGENTS_INJECT_START = '<!-- ABF:CODEX-RULES:START -->'
const AGENTS_INJECT_END = '<!-- ABF:CODEX-RULES:END -->'

// ---------------------------------------------------------------------------
// Source regression: process.ts must inject CLI rules into workDir only
// ---------------------------------------------------------------------------

test('process.ts CLI inject path uses workDir, not worktreeSourceRepo', () => {
  const source = readFileSync(processSourcePath, 'utf8')

  // The buggy pattern must not reappear
  assert.equal(
    source.includes('session.worktreeSourceRepo || workDir'),
    false,
    'CLI inject must not prefer worktreeSourceRepo over agent workDir',
  )
  assert.equal(
    source.includes('const promptWorkDir = session.worktreeSourceRepo'),
    false,
    'promptWorkDir must not be derived from worktreeSourceRepo',
  )

  // File-only CLI path must inject + track cleanup against workDir (same as Claude)
  assert.match(source, /injectProviderRules\(\s*workDir\s*,\s*provider\.id\s*,\s*providerNames\s*\)/)
  // Both Claude and CLI paths set cleanup tracking to workDir (no source-repo variant)
  const setMatches = [...source.matchAll(/supervisorPromptSessions\.set\(\s*sessionId\s*,\s*(\w+)\s*\)/g)]
  assert.ok(setMatches.length >= 2, 'expected Claude + CLI cleanup tracking sets')
  for (const m of setMatches) {
    assert.equal(m[1], 'workDir', `supervisorPromptSessions.set must track workDir, got ${m[1]}`)
  }
  // No expression that injects into worktreeSourceRepo
  assert.equal(
    /injectProviderRules\(\s*[^)]*worktreeSourceRepo/.test(source),
    false,
    'injectProviderRules must not receive worktreeSourceRepo',
  )
  assert.equal(
    /injectSupervisorPrompt\(\s*[^)]*worktreeSourceRepo/.test(source),
    false,
    'injectSupervisorPrompt must not receive worktreeSourceRepo',
  )
})

test('process.ts Claude inject path uses workDir (no source-repo leak)', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  const claudeBlockMatch = source.match(
    /if \(isClaudeProvider\) \{[\s\S]*?catch \(err: unknown\) \{\s*const errMsg = err instanceof Error \? err\.message : String\(err\)\s*appLog\('warn', `Failed to inject Claude rules files/,
  )
  assert.ok(claudeBlockMatch, 'expected Claude inject block in process.ts')
  const claudeBlock = claudeBlockMatch[0]
  assert.match(claudeBlock, /injectSupervisorPrompt\(\s*workDir\s*,/)
  assert.match(claudeBlock, /supervisorPromptSessions\.set\(\s*sessionId\s*,\s*workDir\s*\)/)
  assert.equal(/worktreeSourceRepo/.test(claudeBlock), false)
})

test('process.ts cleanup tracks the same directory that was injected', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  // Cleanup reads from supervisorPromptSessions map (set to workDir at inject time)
  assert.match(
    source,
    /private cleanupSupervisorPromptForSession\(sessionId: string\): void \{\s*const workDir = this\.supervisorPromptSessions\.get\(sessionId\)/,
  )
  assert.match(source, /cleanupSupervisorPrompt\(workDir\)/)
  // Shared workDir (parent + child) must ref-count before deleting rules files
  assert.match(source, /stillInUse/)
  assert.match(source, /supervisorPromptSessions\.values\(\)/)
})

test('Bug C: stopProcess must NOT cleanup software prompts; disposeSession does', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  // stopProcess body must not call cleanup
  const stopMatch = source.match(
    /async stopProcess\(sessionId: string\): Promise<void> \{[\s\S]*?\n  \}/,
  )
  assert.ok(stopMatch, 'expected stopProcess method')
  assert.equal(
    /cleanupSupervisorPromptForSession\s*\(/.test(stopMatch[0]),
    false,
    'stopProcess must not delete AGENTS.md / rules while session may continue',
  )
  assert.match(stopMatch[0], /Do not remove software-prompt files/)

  // disposeSession is the true teardown path
  assert.match(source, /async disposeSession\(sessionId: string\)/)
  const disposeMatch = source.match(
    /async disposeSession\(sessionId: string\): Promise<void> \{[\s\S]*?\n  \}/,
  )
  assert.ok(disposeMatch, 'expected disposeSession method')
  assert.match(disposeMatch[0], /cleanupSupervisorPromptForSession/)
  assert.match(disposeMatch[0], /destroySession/)

  // error path must not wipe prompts either
  assert.match(source, /Keep software-prompt files on error/)
  // active skip must ensure prompts
  assert.match(source, /ensureSoftwarePromptFiles/)
  assert.match(source, /already active, prompts ensured/)
})

test('Bug C: sendMessage ensures prompts when adapter already active', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  assert.match(source, /ensureSoftwarePromptFiles\(sessionId\)/)
  // both send paths re-ensure when active
  const sendBlocks = [...source.matchAll(
    /if \(!isActive\) \{[\s\S]*?\} else \{[\s\S]*?ensureSoftwarePromptFiles\(sessionId\)[\s\S]*?\}/g,
  )]
  assert.ok(sendBlocks.length >= 1, 'sendMessage should ensure prompts when active')
})

test('process.ts injects worker role for direct children only; supervisor+agent-control for parent and father', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  assert.match(source, /isDirectChild/)
  assert.match(source, /buildWorkerRulesContent\s*\(/)
  assert.match(source, /Injected worker role prompt for direct child session/)
  assert.match(source, /injectWorkerPromptFiles\s*\(/)
  assert.match(source, /Skipped worker prompt \+ agent-control for nested child/)
  // 爷爷 + 父亲 get agent-control via role policy + buildAgentControlMcpConfig
  assert.match(source, /ABF_PARENT_SESSION_ID:\s*sessionId/)
  assert.match(source, /buildAgentControlMcpConfig|resolveSessionMcpServers/)
  assert.match(source, /shouldInjectAgentControl|AGENT_CONTROL_MCP_ID|agent-control/)
  assert.match(source, /getEnabledServerConfigs/)
})

test('process.ts persistent child done injects result to parent (not only non-persistent)', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  const doneChildBlock = source.match(
    /If this is a child session, inject result back to parent[\s\S]*?finalizeChildAgents/,
  )
  assert.ok(doneChildBlock, 'expected child done inject block')
  const block = doneChildBlock[0]
  assert.match(block, /isPersistentChild/)
  assert.match(block, /injectChildResult\s*\(/)
  // persistent path must call inject before/around idle status, not skip it
  const persistentArm = block.match(
    /if \(this\.agentLifecycle\.isPersistentChild[\s\S]*?\} else \{/,
  )
  assert.ok(persistentArm, 'expected persistent vs non-persistent arms')
  assert.match(persistentArm[0], /injectChildResult/)
  assert.match(persistentArm[0], /updatePersistentAgentStatus/)
  // Interrupt-cancelled done must skip idle finalize (二次派发 stuck 待命)
  assert.match(block, /fromInterrupt/)
  assert.match(block, /Skipping persistent-child idle finalize after interrupt|doneIsFromInterrupt/)
})

test('sendToChild: default queue (no forced interrupt); optional interrupt then running then send', () => {
  const lifecyclePath = path.join(electronRoot, 'services/agent-lifecycle.ts')
  const lifecycle = readFileSync(lifecyclePath, 'utf8')
  const block = lifecycle.match(/async sendToChild\([\s\S]*?async sendToChildAndWait/)
  assert.ok(block, 'expected sendToChild body')
  const body = block[0]
  assert.match(body, /opts\?\.interrupt === true/)
  assert.match(body, /if \(interrupt\)/)
  const runningAt = body.indexOf('updatePersistentAgentStatus')
  const sendAt = body.lastIndexOf('sendMessage')
  assert.ok(runningAt >= 0, 'running status')
  assert.ok(sendAt > runningAt, 'send after running')
  assert.doesNotMatch(body, /sendMessage\([^)]*interrupt:\s*true/)
})

test('stopProcess must not finalizeChildAgents cancelled; dispose still finalizes', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  const stopMatch = source.match(
    /async stopProcess\(sessionId: string\): Promise<void> \{[\s\S]*?\n  \}/,
  )
  assert.ok(stopMatch, 'expected stopProcess method')
  assert.doesNotMatch(stopMatch[0], /finalizeChildAgents/)
  assert.match(source, /async disposeSession[\s\S]*?finalizeChildAgents\(sessionId, 'cancelled'/)
})

test('sendMessage dual-insurance marks persistent child running when turn starts', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  assert.match(source, /markPersistentChildRunningIfNeeded/)
  assert.match(source, /doneIsFromInterrupt/)
  const sendBlock = source.match(/async sendMessage\([\s\S]*?bridgeManager\.sendMessage/)
  assert.ok(sendBlock, 'expected sendMessage body')
  assert.match(sendBlock[0], /markPersistentChildRunningIfNeeded/)
  assert.match(sendBlock[0], /state\.streaming = true/)
})

test('injectChildResult includes name and workDir merge hint; close cleans worktree', () => {
  const lifecyclePath = path.join(electronRoot, 'services/agent-lifecycle.ts')
  const lifecycle = readFileSync(lifecyclePath, 'utf8')
  assert.match(lifecycle, /子Agent/)
  assert.match(lifecycle, /workDir/)
  assert.match(lifecycle, /merge\/cherry-pick|close_agent/)
  assert.match(lifecycle, /cleanupChildWorktree/)
  assert.match(lifecycle, /已关闭/)
})

test('closeChildSession removes tracker entry, cleans child worktree, emits removed for UI', () => {
  const lifecyclePath = path.join(electronRoot, 'services/agent-lifecycle.ts')
  const trackerPath = path.join(electronRoot, 'services/agent-tracker.ts')
  const lifecycle = readFileSync(lifecyclePath, 'utf8')
  const tracker = readFileSync(trackerPath, 'utf8')
  assert.match(tracker, /removeByChildSessionId\s*\(/)
  assert.match(lifecycle, /removePersistentAgent\s*\(/)
  assert.match(lifecycle, /updateStatus\(\s*childSessionId\s*,\s*'terminated'\s*\)/)
  assert.match(lifecycle, /emitAgentRemoved|removed:\s*true/)
  assert.match(lifecycle, /Always emit removed even if tracker entry is missing/)
  assert.match(lifecycle, /cleanupChildWorktree/)
})

// ---------------------------------------------------------------------------
// Functional: injectProviderRules / cleanup write under agent workDir only
// ---------------------------------------------------------------------------

let electronMockRegistered = false

function ensureElectronMock(): void {
  if (electronMockRegistered) return
  register(
    `data:text/javascript,${encodeURIComponent(`
      export async function resolve(specifier, context, nextResolve) {
        if (specifier === 'electron') {
          return {
            shortCircuit: true,
            url: 'data:text/javascript,${encodeURIComponent(`
              export const app = {
                isPackaged: false,
                getAppPath() { return ${JSON.stringify(workspaceRoot)} },
              };
            `)}',
          };
        }
        return nextResolve(specifier, context);
      }
    `)}`,
    pathToFileURL(import.meta.url),
  )
  electronMockRegistered = true
}

async function loadSupervisorPrompt() {
  ensureElectronMock()
  // Dynamic import after register so electron resolves to the mock
  return import('../services/supervisor-prompt.js')
}

test('injectProviderRules writes AGENTS.md under worktree, not source repo', async () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'abf-prompt-inject-'))
  const sourceRepo = path.join(tmpRoot, 'main-repo')
  const worktree = path.join(tmpRoot, '.allbeingsfuture-worktrees', 'session-1')
  mkdirSync(sourceRepo, { recursive: true })
  mkdirSync(worktree, { recursive: true })

  // Pre-existing user content in worktree AGENTS.md must be preserved
  writeFileSync(path.join(worktree, 'AGENTS.md'), '# User agents\n\nKeep me.\n', 'utf8')

  try {
    assert.ok(existsSync(path.join(promptsDir, 'abf-supervisor.md')), 'prompt templates must exist')
    assert.ok(existsSync(path.join(promptsDir, 'abf-worker.md')), 'worker prompt template must exist')

    const {
      injectProviderRules,
      cleanupSupervisorPrompt,
      resolveContextFilesForProvider,
    } = await loadSupervisorPrompt()

    // Simulate isolated session: agent cwd = worktree, source = main repo
    const agentWorkDir = worktree
    injectProviderRules(agentWorkDir, 'codex', ['Claude Code', 'Codex'])

    const worktreeAgents = path.join(worktree, 'AGENTS.md')
    const sourceAgents = path.join(sourceRepo, 'AGENTS.md')

    assert.equal(existsSync(worktreeAgents), true, 'AGENTS.md must exist in agent worktree')
    assert.equal(existsSync(sourceAgents), false, 'must not pollute main/source repo')

    const content = readFileSync(worktreeAgents, 'utf8')
    assert.match(content, /# User agents/)
    assert.match(content, new RegExp(AGENTS_INJECT_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(content, new RegExp(AGENTS_INJECT_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(content, /Keep me/)

    // Gemini extras land in the same agent cwd
    injectProviderRules(agentWorkDir, 'gemini-cli', ['Gemini'])
    for (const file of resolveContextFilesForProvider('gemini-cli')) {
      const p = path.join(worktree, file)
      assert.equal(existsSync(p), true, `${file} must be in worktree`)
      assert.equal(existsSync(path.join(sourceRepo, file)), false, `${file} must not be in source repo`)
      assert.match(readFileSync(p, 'utf8'), new RegExp(AGENTS_INJECT_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }

    // Cleanup must remove ABF blocks from the same (worktree) dir only
    cleanupSupervisorPrompt(agentWorkDir)
    const cleaned = readFileSync(worktreeAgents, 'utf8')
    assert.equal(cleaned.includes(AGENTS_INJECT_START), false)
    assert.match(cleaned, /Keep me/)
    assert.equal(existsSync(path.join(worktree, 'GEMINI.md')), false)
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('injectSupervisorPrompt writes Claude rules under worktree cwd', async () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'abf-claude-inject-'))
  const sourceRepo = path.join(tmpRoot, 'main-repo')
  const worktree = path.join(tmpRoot, '.allbeingsfuture-worktrees', 'session-2')
  mkdirSync(sourceRepo, { recursive: true })
  mkdirSync(worktree, { recursive: true })

  try {
    const { injectSupervisorPrompt, cleanupSupervisorPrompt } = await loadSupervisorPrompt()
    injectSupervisorPrompt(worktree, ['Claude Code'])

    const rulesInWorktree = path.join(worktree, '.claude', 'rules', 'abf-supervisor.md')
    const rulesInSource = path.join(sourceRepo, '.claude', 'rules', 'abf-supervisor.md')
    assert.equal(existsSync(rulesInWorktree), true)
    assert.equal(existsSync(rulesInSource), false)
    // 手册类文件不应再注入
    assert.equal(existsSync(path.join(worktree, '.claude', 'rules', 'abf-common.md')), false)
    assert.equal(existsSync(path.join(worktree, '.claude', 'rules', 'abf-providers.md')), false)
    assert.equal(existsSync(path.join(worktree, '.claude', 'rules', 'abf-git-workflow.md')), false)

    cleanupSupervisorPrompt(worktree)
    assert.equal(existsSync(rulesInWorktree), false)
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('resolveContextFilesForProvider covers AGENTS.md plus Gemini/Qwen extras', async () => {
  const { resolveContextFilesForProvider } = await loadSupervisorPrompt()
  assert.deepEqual(resolveContextFilesForProvider('codex'), ['AGENTS.md'])
  assert.deepEqual(resolveContextFilesForProvider('gemini-cli'), ['AGENTS.md', 'GEMINI.md'])
  assert.deepEqual(resolveContextFilesForProvider('qwen-code'), ['AGENTS.md', 'QWEN.md'])
  assert.deepEqual(resolveContextFilesForProvider('opencode'), ['AGENTS.md'])
  assert.deepEqual(resolveContextFilesForProvider('grok'), ['AGENTS.md'])
})

test('injectWorkerRules writes worker body into AGENTS.md (not supervisor scheduling text)', async () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'abf-worker-rules-'))
  const worktree = path.join(tmpRoot, '.allbeingsfuture-worktrees', 'child-1')
  mkdirSync(worktree, { recursive: true })

  try {
    const {
      injectWorkerRules,
      injectWorkerPrompt,
      injectWorkerPromptFiles,
      cleanupSupervisorPrompt,
      buildWorkerPrompt,
    } = await loadSupervisorPrompt()

    const workerBody = buildWorkerPrompt()
    assert.match(workerBody, /ABF Worker|implementation Worker/i)
    // Worker (父亲) may document agent-control for spawning sons; must not be full Supervisor.
    assert.doesNotMatch(workerBody, /# ABF Supervisor/)
    // Non-trivial work must spawn sons when agent-control present (not "prefer solo implement")
    assert.match(workerBody, /Must spawn 儿子|必须.*spawn_agent|REQUIRED when agent-control/i)
    assert.doesNotMatch(workerBody, /Prefer implementing a single coherent task yourself/)

    injectWorkerRules(worktree, 'grok')
    const agentsPath = path.join(worktree, 'AGENTS.md')
    assert.equal(existsSync(agentsPath), true)
    const agentsContent = readFileSync(agentsPath, 'utf8')
    assert.match(agentsContent, new RegExp(AGENTS_INJECT_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(agentsContent, /ABF Worker|implementation Worker/i)
    assert.doesNotMatch(agentsContent, /# ABF Supervisor/)

    // Claude path: abf-worker.md, remove abf-supervisor if present
    mkdirSync(path.join(worktree, '.claude', 'rules'), { recursive: true })
    writeFileSync(path.join(worktree, '.claude', 'rules', 'abf-supervisor.md'), '# fake supervisor\n', 'utf8')
    injectWorkerPrompt(worktree)
    assert.equal(existsSync(path.join(worktree, '.claude', 'rules', 'abf-worker.md')), true)
    assert.equal(existsSync(path.join(worktree, '.claude', 'rules', 'abf-supervisor.md')), false)
    const claudeWorker = readFileSync(path.join(worktree, '.claude', 'rules', 'abf-worker.md'), 'utf8')
    assert.match(claudeWorker, /ABF Worker|implementation Worker/i)

    // injectWorkerPromptFiles dispatches by provider
    const worktree2 = path.join(tmpRoot, '.allbeingsfuture-worktrees', 'child-2')
    mkdirSync(worktree2, { recursive: true })
    injectWorkerPromptFiles(worktree2, 'claude-code')
    assert.equal(existsSync(path.join(worktree2, '.claude', 'rules', 'abf-worker.md')), true)
    assert.equal(existsSync(path.join(worktree2, 'AGENTS.md')), false)

    const worktree3 = path.join(tmpRoot, '.allbeingsfuture-worktrees', 'child-3')
    mkdirSync(worktree3, { recursive: true })
    injectWorkerPromptFiles(worktree3, 'codex')
    assert.equal(existsSync(path.join(worktree3, 'AGENTS.md')), true)
    assert.equal(existsSync(path.join(worktree3, '.claude', 'rules', 'abf-worker.md')), false)

    cleanupSupervisorPrompt(worktree)
    assert.equal(existsSync(path.join(worktree, '.claude', 'rules', 'abf-worker.md')), false)
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('process.ts only injects worker files for direct child isolated worktree (not grandchild)', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  // Direct child gate (optional chaining ok)
  assert.match(source, /isDirectChild/)
  assert.match(source, /!parentSession\?\.parentSessionId|!parentSession\.parentSessionId/)
  // Shared cwd with parent must skip file inject
  assert.match(source, /sameCwd/)
  assert.match(source, /path\.resolve\(workDir\) === path\.resolve\(parentWorkDir\)/)
  // Grandchild / nested son skip
  assert.match(source, /Skipped worker prompt \+ agent-control for nested child/)
  // Worker file inject for direct child
  assert.match(source, /injectWorkerPromptFiles/)
})

test('wrapWorkerTaskPrompt appends mempalace checkpoint reminder for every child task', async () => {
  const {
    wrapWorkerTaskPrompt,
    WORKER_TASK_MEMPALACE_HINT,
    NESTED_CHILD_MEMPALACE_MEMORY_PROMPT,
    enabledMcpsIncludeMempalace,
  } = await loadSupervisorPrompt()

  const wrapped = wrapWorkerTaskPrompt('Implement feature X in foo.ts')
  assert.match(wrapped, /Implement feature X/)
  assert.match(wrapped, /mempalace_checkpoint/)
  assert.match(wrapped, /wing.*room.*content|items:.*wing/i)
  assert.match(wrapped, /peer lock|write lock busy/i)
  assert.match(wrapped, /2\s*min|deadline|exponential backoff/i)
  assert.doesNotMatch(wrapped, /retry once/i)
  assert.ok(wrapped.includes(WORKER_TASK_MEMPALACE_HINT) || wrapped.includes('## Memory (if mempalace MCP is available)'))

  // Idempotent: do not double-append the fixed hint
  const twice = wrapWorkerTaskPrompt(wrapped)
  assert.equal(twice, wrapped)

  // Empty task still gets the memory path
  const emptyWrapped = wrapWorkerTaskPrompt('  ')
  assert.match(emptyWrapped, /mempalace_checkpoint/)

  // Nested-child short system prompt is present and strong (must / before finishing)
  assert.match(NESTED_CHILD_MEMPALACE_MEMORY_PROMPT, /mempalace_checkpoint/)
  assert.match(NESTED_CHILD_MEMPALACE_MEMORY_PROMPT, /must|Before finishing/i)
  assert.match(NESTED_CHILD_MEMPALACE_MEMORY_PROMPT, /wing|room|content/i)
  assert.match(NESTED_CHILD_MEMPALACE_MEMORY_PROMPT, /peer lock|write lock busy/i)
  assert.match(NESTED_CHILD_MEMPALACE_MEMORY_PROMPT, /2\s*min|deadline|exponential backoff/i)
  assert.doesNotMatch(NESTED_CHILD_MEMPALACE_MEMORY_PROMPT, /retry once/i)
  // Must NOT look like full abf-worker handbook
  assert.doesNotMatch(NESTED_CHILD_MEMPALACE_MEMORY_PROMPT, /agent-control|spawn_agent|ABF Worker/)

  assert.equal(enabledMcpsIncludeMempalace({ mempalace: { command: 'node', args: [] } }), true)
  assert.equal(enabledMcpsIncludeMempalace({ custom: { command: 'npx', args: ['-y', 'mempalace'] } }), true)
  assert.equal(enabledMcpsIncludeMempalace({ other: { command: 'echo', args: [] } }), false)
  assert.equal(enabledMcpsIncludeMempalace({}), false)
  assert.equal(enabledMcpsIncludeMempalace(null), false)
})

test('process.ts injects nested-child short Memory prompt when mempalace enabled (no full worker)', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  assert.match(source, /NESTED_CHILD_MEMPALACE_MEMORY_PROMPT/)
  assert.match(source, /enabledMcpsIncludeMempalace/)
  assert.match(source, /mempalaceEnabled/)
  assert.match(source, /Injected short mempalace Memory prompt for nested child/)
  // Still skips full worker + agent-control for sons
  assert.match(source, /Skipped worker prompt \+ agent-control for nested child/)
  // Nested memory inject is gated on mempalaceEnabled, not unconditional full worker
  assert.match(source, /if \(mempalaceEnabled\)/)
  // Must not inject full worker rules content into nested-child arm
  const nestedArm = source.match(/\} else if \(isChild\) \{[\s\S]*?\} else \{/)
  assert.ok(nestedArm, 'expected nested-child branch')
  assert.doesNotMatch(nestedArm[0], /buildWorkerRulesContent\s*\(/)
  assert.doesNotMatch(nestedArm[0], /injectWorkerPromptFiles/)
})

test('hasSupervisorPromptFiles detects missing AGENTS block and re-inject restores it', async () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'abf-ensure-prompt-'))
  const worktree = path.join(tmpRoot, '.allbeingsfuture-worktrees', 'main-session')
  mkdirSync(worktree, { recursive: true })

  try {
    const {
      injectProviderRules,
      cleanupSupervisorPrompt,
      hasSupervisorPromptFiles,
      hasWorkerPromptFiles,
      injectWorkerRules,
    } = await loadSupervisorPrompt()

    assert.equal(hasSupervisorPromptFiles(worktree, 'grok'), false)
    injectProviderRules(worktree, 'grok', ['Grok'])
    assert.equal(hasSupervisorPromptFiles(worktree, 'grok'), true)

    // Simulate the Bug C failure: cleanup wiped AGENTS while session still "alive"
    cleanupSupervisorPrompt(worktree)
    assert.equal(hasSupervisorPromptFiles(worktree, 'grok'), false)
    assert.equal(existsSync(path.join(worktree, 'AGENTS.md')), false)

    // ensure path: re-inject restores discovery files
    injectProviderRules(worktree, 'grok', ['Grok'])
    assert.equal(hasSupervisorPromptFiles(worktree, 'grok'), true)
    const restored = readFileSync(path.join(worktree, 'AGENTS.md'), 'utf8')
    assert.match(restored, /# ABF Supervisor|Supervisor/i)
    assert.match(restored, new RegExp(AGENTS_INJECT_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    // Worker detect
    const childWt = path.join(tmpRoot, '.allbeingsfuture-worktrees', 'child-w')
    mkdirSync(childWt, { recursive: true })
    assert.equal(hasWorkerPromptFiles(childWt, 'grok'), false)
    injectWorkerRules(childWt, 'grok')
    assert.equal(hasWorkerPromptFiles(childWt, 'grok'), true)
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('handlers dispose software prompts on Session Delete/End (not Stop alone)', () => {
  const handlersPath = path.join(electronRoot, 'ipc/handlers.ts')
  const source = readFileSync(handlersPath, 'utf8')
  assert.match(source, /SessionService\.Delete[\s\S]*disposeSession/)
  assert.match(source, /SessionService\.End[\s\S]*disposeSession/)
  // StopProcess channel still exists but dispose is separate
  assert.match(source, /ProcessService\.StopProcess/)
})

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

test('process.ts injects agent-control and ABF rules for child sessions too', () => {
  const source = readFileSync(processSourcePath, 'utf8')
  // Must not gate the whole inject block on parent-only sessions
  assert.equal(
    /if\s*\(\s*!session\.parentSessionId\s*\)\s*\{\s*try\s*\{[\s\S]*?agent-control/.test(source),
    false,
    'agent-control must not be wrapped in if (!session.parentSessionId)',
  )
  assert.match(source, /Inject agent-control \+ ABF rules for ALL sessions/)
  assert.match(source, /ABF_PARENT_SESSION_ID:\s*sessionId/)
})

test('closeChildSession removes tracker entry and emits removed for UI', () => {
  const lifecyclePath = path.join(electronRoot, 'services/agent-lifecycle.ts')
  const trackerPath = path.join(electronRoot, 'services/agent-tracker.ts')
  const lifecycle = readFileSync(lifecyclePath, 'utf8')
  const tracker = readFileSync(trackerPath, 'utf8')
  assert.match(tracker, /removeByChildSessionId\s*\(/)
  assert.match(lifecycle, /removePersistentAgent\s*\(/)
  assert.match(lifecycle, /updateStatus\(\s*childSessionId\s*,\s*'terminated'\s*\)/)
  assert.match(lifecycle, /emitAgentRemoved|removed:\s*true/)
  assert.match(lifecycle, /Always emit removed even if tracker entry is missing/)
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
    assert.ok(existsSync(path.join(promptsDir, 'abf-common.md')), 'prompt templates must exist')

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

    const rulesInWorktree = path.join(worktree, '.claude', 'rules', 'abf-common.md')
    const rulesInSource = path.join(sourceRepo, '.claude', 'rules', 'abf-common.md')
    assert.equal(existsSync(rulesInWorktree), true)
    assert.equal(existsSync(rulesInSource), false)

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

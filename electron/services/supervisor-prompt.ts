/**
 * ABF 规则注入器（极简）
 *
 * 顶层 Supervisor：只注入 abf-supervisor.md（文件 + 可选 append）
 * 直接子 Agent Worker：appendSystemPrompt + 隔离 worktree 上的 worker 文件
 * 孙 Agent：默认不注入软件提示词文件；隔离 worktree 上需剥离继承的 ABF 块
 *   （git worktree checkout 会带上已提交的 AGENTS.md / abf-*.md）
 *
 * 不再注入 common / providers / git / codex 手册。
 *
 * - Claude Supervisor: .claude/rules/abf-supervisor.md
 * - Claude Worker: .claude/rules/abf-worker.md
 * - 多数 CLI: AGENTS.md 注入块（body 为 supervisor 或 worker 角色）
 * - Gemini/Qwen: 额外 GEMINI.md / QWEN.md
 * - openai-api: appendSystemPrompt
 *
 * cleanupSupervisorPrompt / stripInheritedSoftwarePromptFiles：删除 abf-*.md 并剥离
 * AGENTS.md 等文件中的 ABF 注入块。会话销毁清理与 nested-child 隔离 worktree 共用。
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import { app } from 'electron'
import { appLog } from './log.js'

/** Supervisor 角色会写入的规则文件 */
const ABF_SUPERVISOR_RULE = 'abf-supervisor.md' as const
/** Worker 角色会写入的规则文件 */
const ABF_WORKER_RULE = 'abf-worker.md' as const

/** 当前会写入的规则文件 */
const ABF_ACTIVE_RULES = [ABF_SUPERVISOR_RULE, ABF_WORKER_RULE] as const

/** 历史遗留文件：会话清理时一并删除，避免旧手册残留 */
const ABF_LEGACY_RULES = [
  'abf-common.md',
  'abf-providers.md',
  'abf-git-workflow.md',
] as const

const ABF_RULES_FILES = [...ABF_ACTIVE_RULES, ...ABF_LEGACY_RULES] as const

const AGENTS_MD_FILE = 'AGENTS.md'

const PROVIDER_EXTRA_CONTEXT_FILES: Readonly<Record<string, readonly string[]>> = {
  'gemini-cli': ['GEMINI.md'],
  'qwen-code': ['QWEN.md'],
}

const ALL_INJECTABLE_CONTEXT_FILES = Array.from(new Set([
  AGENTS_MD_FILE,
  ...Object.values(PROVIDER_EXTRA_CONTEXT_FILES).flat(),
]))

const AGENTS_INJECT_START = '<!-- ABF:CODEX-RULES:START -->'
const AGENTS_INJECT_END = '<!-- ABF:CODEX-RULES:END -->'

export interface AgentsMdInjectOptions {
  /** @deprecated 已忽略：不再注入 codex 专用手册 */
  includeCodexExtras?: boolean
  /** 是否包含 Supervisor 调度指引（默认 true） */
  includeSupervisor?: boolean
  extraFiles?: string[]
}

const templateCache = new Map<string, string>()

function getPromptsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'prompts')
  }
  return path.join(app.getAppPath(), 'resources', 'prompts')
}

function loadTemplate(filename: string): string {
  const cached = templateCache.get(filename)
  if (cached !== undefined) return cached
  const filePath = path.join(getPromptsDir(), filename)
  const content = fs.readFileSync(filePath, 'utf-8')
  templateCache.set(filename, content)
  return content
}

export function buildSupervisorPrompt(availableProviders: string[]): string {
  const providerList = availableProviders.length > 0
    ? availableProviders.join(', ')
    : 'claude-code'
  return loadTemplate('abf-supervisor.md').replace('{{PROVIDER_LIST}}', providerList)
}

export function buildWorkerPrompt(): string {
  return loadTemplate('abf-worker.md')
}

/** 子 Agent 仅注入 Worker 角色（不塞手册） */
export function buildWorkerRulesContent(): string {
  try {
    return buildWorkerPrompt()
  } catch {
    appLog('warn', '[Supervisor] Failed to load abf-worker.md', 'supervisor-prompt')
    return ''
  }
}

/**
 * Fixed short Memory reminder appended to every child agent initial task.
 * Sons do not get abf-worker.md; this keeps a path to file palace when mempalace MCP is present.
 * Wording aligned with abf-supervisor / abf-worker: when / tool / wing·room·content / lock retry.
 */
export const WORKER_TASK_MEMPALACE_HINT = [
  '## Memory (if mempalace MCP is available)',
  'Before finishing: for **important conclusions / decisions / facts worth reusing**, call `mempalace_checkpoint` with items `[{ wing, room, content }]` (wing=project, default `allbeingsfuture`; room=short topic; content=concrete durable points). Skip if MCP unavailable. Host safe-proxy **queues** concurrent palace writes — a single tools/call may wait up to ~2 minutes; do **not** abandon a still-running call. On **peer lock / write lock busy / `未写入` (not written) / timeout returned by the tool**: retry at most 1–2 times; if still failing, skip and report skipped (busy/timeout). Never claim a write succeeded if the tool did not return success. Do not loop until the user interrupts.',
].join('\n')

/**
 * Extremely short Memory instruction for nested-child (son) appendSystemPrompt.
 * Full abf-worker.md is intentionally NOT injected for sons.
 * Same obligation strength as father/grandpa when mempalace is present.
 */
export const NESTED_CHILD_MEMPALACE_MEMORY_PROMPT = [
  '## Memory (mempalace)',
  'If mempalace MCP is available: for **important conclusions / decisions / facts**, you **must** call `mempalace_checkpoint` with items `[{ wing, room, content }]` (wing default `allbeingsfuture`). **Before finishing**, checkpoint at least once when anything durable exists. Host safe-proxy queues concurrent writes (one tools/call may wait up to ~2 minutes — do not abandon mid-call). On **peer lock / write lock busy / `未写入` (not written) / timeout returned by the tool**: retry at most 1–2 times; if still failing, skip and report skipped (busy/timeout). Never claim a write succeeded if the tool did not return success. Do not loop until the user interrupts.',
].join('\n')

/** True when enabled user MCP configs look like mempalace (by key/command/args). */
export function enabledMcpsIncludeMempalace(
  servers: Record<string, { command?: string; args?: string[] } | undefined> | null | undefined,
): boolean {
  if (!servers) return false
  for (const [key, cfg] of Object.entries(servers)) {
    const command = String(cfg?.command || '')
    const args = Array.isArray(cfg?.args) ? cfg.args.map(String) : []
    const parts = [key, command, ...args].map((p) => p.toLowerCase())
    if (parts.some((p) => p.includes('mempalace'))) return true
  }
  return false
}

/**
 * Wrap child initial task prompt with a fixed short Memory (mempalace) reminder.
 * Does not inject full worker software rules — those are role-gated elsewhere.
 */
export function wrapWorkerTaskPrompt(taskPrompt: string): string {
  const body = (taskPrompt || '').trim()
  const hint = WORKER_TASK_MEMPALACE_HINT.trim()
  if (!body) return hint
  // Avoid double-append if caller already included the same fixed hint.
  if (body.includes(hint) || body.includes('## Memory (if mempalace MCP is available)')) {
    return body
  }
  return `${body}\n\n${hint}`
}

/**
 * 全套规则 = 仅 Supervisor 调度（无 common/providers/git/codex）
 */
export function buildAllRulesContent(
  availableProviders: string[],
  includeSupervisor = true,
): string {
  return buildAgentsMdRulesContent(availableProviders, { includeSupervisor })
}

export function buildAgentsMdRulesContent(
  availableProviders: string[] = [],
  options: AgentsMdInjectOptions = {},
): string {
  if (options.includeSupervisor === false) return ''
  try {
    return buildSupervisorPrompt(availableProviders)
  } catch {
    appLog('warn', '[Supervisor] Failed to load abf-supervisor.md', 'supervisor-prompt')
    return ''
  }
}

function stripInjectedAgentsRules(content: string): string {
  if (!content.includes(AGENTS_INJECT_START)) return content
  const pattern = new RegExp(
    `\\n?${AGENTS_INJECT_START}[\\s\\S]*?${AGENTS_INJECT_END}\\n?`,
    'g',
  )
  return content.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function injectRulesIntoFile(filePath: string, body: string): void {
  const injectedBlock = `${AGENTS_INJECT_START}\n${body}\n${AGENTS_INJECT_END}\n`
  let existing = ''
  try {
    existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : ''
  } catch {
    appLog('warn', `[Supervisor] Failed to read existing context file: ${filePath}`, 'supervisor-prompt')
    existing = ''
  }
  const preserved = stripInjectedAgentsRules(existing)
  const nextContent = preserved ? `${preserved}\n\n${injectedBlock}` : injectedBlock
  fs.writeFileSync(filePath, nextContent, 'utf-8')
}

function cleanupInjectedFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return
  const existing = fs.readFileSync(filePath, 'utf-8')
  const cleaned = stripInjectedAgentsRules(existing)
  if (cleaned.trim()) {
    fs.writeFileSync(filePath, `${cleaned}\n`, 'utf-8')
  } else {
    fs.unlinkSync(filePath)
  }
}

function ensureRulesDir(workDir: string): void {
  const rulesDir = path.join(workDir, '.claude', 'rules')
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true })
  }
}

/** 删除历史手册规则文件，避免与新注入并存 */
function removeLegacyRuleFiles(rulesDir: string): void {
  for (const filename of ABF_LEGACY_RULES) {
    try {
      const filePath = path.join(rulesDir, filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      // ignore
    }
  }
}

/**
 * Claude：只写 abf-supervisor.md，并清掉旧手册文件 / worker 规则（避免角色混淆）
 */
export function injectSupervisorPrompt(
  workDir: string,
  availableProviders: string[],
): string {
  ensureRulesDir(workDir)
  const rulesDir = path.join(workDir, '.claude', 'rules')
  removeLegacyRuleFiles(rulesDir)
  // Supervisor cwd must not keep a worker-only rule file
  try {
    const workerPath = path.join(rulesDir, ABF_WORKER_RULE)
    if (fs.existsSync(workerPath)) fs.unlinkSync(workerPath)
  } catch {
    // ignore
  }

  const filePath = path.join(rulesDir, ABF_SUPERVISOR_RULE)
  fs.writeFileSync(filePath, buildSupervisorPrompt(availableProviders), 'utf-8')

  appLog('info', `[Supervisor] Injected abf-supervisor.md to: ${rulesDir}`, 'supervisor-prompt')
  return filePath
}

/**
 * Claude Worker：写 abf-worker.md，并清掉会误导的 supervisor 规则 / 旧手册
 */
export function injectWorkerPrompt(workDir: string): string {
  ensureRulesDir(workDir)
  const rulesDir = path.join(workDir, '.claude', 'rules')
  removeLegacyRuleFiles(rulesDir)
  try {
    const supervisorPath = path.join(rulesDir, ABF_SUPERVISOR_RULE)
    if (fs.existsSync(supervisorPath)) fs.unlinkSync(supervisorPath)
  } catch {
    // ignore
  }

  const body = buildWorkerPrompt()
  const filePath = path.join(rulesDir, ABF_WORKER_RULE)
  fs.writeFileSync(filePath, body, 'utf-8')

  appLog('info', `[Worker] Injected abf-worker.md to: ${rulesDir}`, 'supervisor-prompt')
  return filePath
}

/**
 * CLI Worker：把 abf-worker.md 正文写入 AGENTS.md（及 Gemini/Qwen 额外文件）ABF 块。
 * body 必须是 worker 角色，禁止 supervisor 调度文案。
 */
export function injectWorkerRules(workDir: string, providerId: string = ''): void {
  const body = buildWorkerRulesContent()
  if (!body.trim()) {
    appLog('warn', '[Worker] Empty worker rules; skip AGENTS.md inject', 'supervisor-prompt')
    return
  }
  const files = resolveContextFilesForProvider(providerId)
  for (const filename of files) {
    injectRulesIntoFile(path.join(workDir, filename), body)
  }
  appLog(
    'info',
    `[Worker] Injected worker rules for '${providerId || 'default'}' into: `
      + files.map(f => path.join(workDir, f)).join(', '),
    'supervisor-prompt',
  )
}

/**
 * 按 provider 在 workDir 写入 worker 软件提示词文件（Claude rules 和/或 AGENTS 块）。
 * 用于主 agent 的直接子 agent 隔离 worktree。
 */
export function injectWorkerPromptFiles(workDir: string, providerId: string = ''): void {
  const isClaude = providerId === 'claude-code'
  if (isClaude) {
    injectWorkerPrompt(workDir)
  } else {
    injectWorkerRules(workDir, providerId)
  }
}

export function resolveContextFilesForProvider(providerId: string, extraFiles: string[] = []): string[] {
  const extras = PROVIDER_EXTRA_CONTEXT_FILES[providerId] || []
  return Array.from(new Set([AGENTS_MD_FILE, ...extras, ...extraFiles]))
}

export function injectProviderRules(
  workDir: string,
  providerId: string,
  availableProviders: string[] = [],
): void {
  const body = buildAgentsMdRulesContent(availableProviders, { includeSupervisor: true })
  const files = resolveContextFilesForProvider(providerId)
  for (const filename of files) {
    injectRulesIntoFile(path.join(workDir, filename), body)
  }
  appLog(
    'info',
    `[Supervisor] Injected provider rules for '${providerId}' into: `
      + files.map(f => path.join(workDir, f)).join(', '),
    'supervisor-prompt',
  )
}

/**
 * Whether supervisor/CLI software-prompt files are present under workDir.
 * Used to re-ensure AGENTS.md / Claude rules after accidental cleanup while the session lives.
 */
export function hasSupervisorPromptFiles(workDir: string, providerId: string = ''): boolean {
  if (!workDir) return false
  if (providerId === 'claude-code') {
    return fs.existsSync(path.join(workDir, '.claude', 'rules', ABF_SUPERVISOR_RULE))
  }
  const agentsPath = path.join(workDir, AGENTS_MD_FILE)
  if (!fs.existsSync(agentsPath)) return false
  try {
    return fs.readFileSync(agentsPath, 'utf-8').includes(AGENTS_INJECT_START)
  } catch {
    return false
  }
}

/** Whether worker software-prompt files are present under an isolated child workDir. */
export function hasWorkerPromptFiles(workDir: string, providerId: string = ''): boolean {
  if (!workDir) return false
  if (providerId === 'claude-code') {
    return fs.existsSync(path.join(workDir, '.claude', 'rules', ABF_WORKER_RULE))
  }
  const agentsPath = path.join(workDir, AGENTS_MD_FILE)
  if (!fs.existsSync(agentsPath)) return false
  try {
    const content = fs.readFileSync(agentsPath, 'utf-8')
    return content.includes(AGENTS_INJECT_START)
      && /ABF Worker|implementation Worker/i.test(content)
  } catch {
    return false
  }
}

/**
 * Remove ABF software-prompt files/blocks under workDir:
 * - delete .claude/rules/abf-*.md (active + legacy)
 * - strip <!-- ABF:CODEX-RULES --> blocks from AGENTS.md / GEMINI.md / QWEN.md
 *
 * Used for session teardown cleanup, and to clear inherited Supervisor/Worker
 * rules checked out into a nested-child (儿子) isolated git worktree.
 */
export function cleanupSupervisorPrompt(workDir: string): void {
  const rulesDir = path.join(workDir, '.claude', 'rules')
  for (const filename of ABF_RULES_FILES) {
    try {
      const filePath = path.join(rulesDir, filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      // ignore
    }
  }

  for (const filename of ALL_INJECTABLE_CONTEXT_FILES) {
    try {
      cleanupInjectedFile(path.join(workDir, filename))
    } catch {
      // ignore
    }
  }

  appLog('info', `[Supervisor] Cleaned up rule files from: ${workDir}`, 'supervisor-prompt')
}

/** Alias: strip inherited ABF software prompts from nested-child isolated worktrees. */
export const stripInheritedSoftwarePromptFiles = cleanupSupervisorPrompt

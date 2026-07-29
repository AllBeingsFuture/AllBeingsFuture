/**
 * ABF 规则注入器（极简）
 *
 * 顶层 Supervisor：只注入 abf-supervisor.md
 * 子 Agent Worker：process.ts 经 appendSystemPrompt 注入 abf-worker.md
 *
 * 不再注入 common / providers / git / codex 手册。
 *
 * - Claude: .claude/rules/abf-supervisor.md
 * - 多数 CLI: AGENTS.md 注入块
 * - Gemini/Qwen: 额外 GEMINI.md / QWEN.md
 * - openai-api: appendSystemPrompt
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import { app } from 'electron'
import { appLog } from './log.js'

/** 当前会写入的规则文件 */
const ABF_ACTIVE_RULES = ['abf-supervisor.md'] as const

/** 历史遗留文件：会话清理时一并删除，避免旧手册残留 */
const ABF_LEGACY_RULES = [
  'abf-common.md',
  'abf-worker.md',
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

export function wrapWorkerTaskPrompt(taskPrompt: string): string {
  return (taskPrompt || '').trim()
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

/** @deprecated 与 buildAllRulesContent 相同，不再附带 codex 手册 */
export function buildCodexRulesContent(availableProviders: string[] = []): string {
  return buildAllRulesContent(availableProviders, true)
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
 * Claude：只写 abf-supervisor.md，并清掉旧手册文件
 */
export function injectSupervisorPrompt(
  workDir: string,
  availableProviders: string[],
): string {
  ensureRulesDir(workDir)
  const rulesDir = path.join(workDir, '.claude', 'rules')
  removeLegacyRuleFiles(rulesDir)

  const filePath = path.join(rulesDir, 'abf-supervisor.md')
  fs.writeFileSync(filePath, buildSupervisorPrompt(availableProviders), 'utf-8')

  appLog('info', `[Supervisor] Injected abf-supervisor.md to: ${rulesDir}`, 'supervisor-prompt')
  return filePath
}

export function resolveContextFilesForProvider(providerId: string, extraFiles: string[] = []): string[] {
  const extras = PROVIDER_EXTRA_CONTEXT_FILES[providerId] || []
  return Array.from(new Set([AGENTS_MD_FILE, ...extras, ...extraFiles]))
}

export function injectAgentsMd(
  workDir: string,
  availableProviders: string[] = [],
  options: AgentsMdInjectOptions = {},
): void {
  const body = buildAgentsMdRulesContent(availableProviders, options)
  const files = resolveContextFilesForProvider('', options.extraFiles || [])
  for (const filename of files) {
    injectRulesIntoFile(path.join(workDir, filename), body)
  }
  appLog(
    'info',
    `[Supervisor] Injected rules into: ${files.map(f => path.join(workDir, f)).join(', ')}`,
    'supervisor-prompt',
  )
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

/** @deprecated 使用 injectProviderRules */
export function injectCodexAgentsMd(workDir: string, availableProviders: string[] = []): void {
  injectProviderRules(workDir, 'codex', availableProviders)
}

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

/**
 * ABF 规则注入器
 *
 * 按 Provider 差异化注入规则：
 * - Claude:     写 .claude/rules/abf-*.md（顶层 Supervisor 会话）
 * - Codex 等多数 CLI: 写 AGENTS.md（行业通用，OpenCode / Grok / Kimi / Copilot 等默认读取）
 * - Gemini:     额外写 GEMINI.md（默认上下文文件是 GEMINI.md，不是 AGENTS.md）
 * - Qwen:       额外写 QWEN.md（默认上下文文件是 QWEN.md）
 * - openai-api: 无文件发现，由 process.ts 走 appendSystemPrompt
 * - 子 Agent（Worker）：不写共享 workDir 规则文件（避免污染父会话），
 *   由 process.ts 通过 appendSystemPrompt 注入 abf-worker.md
 *
 * Codex 额外：AGENTS.md 内附带 codex-agents.md 专有配置
 *
 * 模板文件位于 resources/prompts/ 目录下，打包后通过 extraResources 分发。
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import { app } from 'electron'
import { appLog } from './log.js'

/** Claude: ABF 注入的规则文件名（会话结束时统一清理） */
const ABF_RULES_FILES = [
  'abf-common.md',
  'abf-supervisor.md',
  'abf-worker.md',
  'abf-providers.md',
  'abf-git-workflow.md',
] as const

/** 通用：AGENTS.md（Codex / OpenCode / Grok / Kimi / Copilot 等） */
const AGENTS_MD_FILE = 'AGENTS.md'

/**
 * 部分 Provider 默认不读 AGENTS.md，需写入其原生上下文文件。
 * key = provider.id，value = 除 AGENTS.md 外额外注入的文件名。
 */
const PROVIDER_EXTRA_CONTEXT_FILES: Readonly<Record<string, readonly string[]>> = {
  'gemini-cli': ['GEMINI.md'],
  'qwen-code': ['QWEN.md'],
}

/** 会话清理时需要检查的全部可注入 markdown 文件 */
const ALL_INJECTABLE_CONTEXT_FILES = Array.from(new Set([
  AGENTS_MD_FILE,
  ...Object.values(PROVIDER_EXTRA_CONTEXT_FILES).flat(),
]))

/** 保持历史标记名，避免已有仓库内残留块无法被清理/更新 */
const AGENTS_INJECT_START = '<!-- ABF:CODEX-RULES:START -->'
const AGENTS_INJECT_END = '<!-- ABF:CODEX-RULES:END -->'

export interface AgentsMdInjectOptions {
  /** 是否附带 Codex 专用 codex-agents.md（默认 false） */
  includeCodexExtras?: boolean
  /** 是否包含 Supervisor 调度指引（默认 true） */
  includeSupervisor?: boolean
  /**
   * 额外要写入的上下文文件名（相对 workDir）。
   * 默认仅 AGENTS.md；Gemini/Qwen 等通过 injectProviderRules 自动附加。
   */
  extraFiles?: string[]
}

// ==================== 模板加载 ====================

/** 模板缓存，避免重复读取文件 */
const templateCache = new Map<string, string>()

/**
 * 获取 resources/prompts/ 目录的路径
 * 兼容开发模式和打包模式
 */
function getPromptsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'prompts')
  }
  // 开发模式：项目根目录/resources/prompts/
  return path.join(app.getAppPath(), 'resources', 'prompts')
}

/**
 * 从 resources/prompts/ 读取模板文件（带缓存）
 * @param filename - 模板文件名（如 'abf-supervisor.md'）
 * @returns 模板文件内容
 */
function loadTemplate(filename: string): string {
  const cached = templateCache.get(filename)
  if (cached !== undefined) {
    return cached
  }
  const filePath = path.join(getPromptsDir(), filename)
  const content = fs.readFileSync(filePath, 'utf-8')
  templateCache.set(filename, content)
  return content
}

// ==================== Prompt 构建 ====================

/**
 * 构建 Supervisor 引导 Prompt
 * @param availableProviders - 可用的 AI Provider 名称列表
 */
export function buildSupervisorPrompt(availableProviders: string[]): string {
  const providerList = availableProviders.length > 0
    ? availableProviders.join(', ')
    : 'claude-code'

  const template = loadTemplate('abf-supervisor.md')
  return template.replace('{{PROVIDER_LIST}}', providerList)
}

/**
 * 构建子 Agent（Worker）角色 Prompt。
 * 用于 child session 的 appendSystemPrompt；只注入这一小段，不塞 common/providers/git。
 */
export function buildWorkerPrompt(): string {
  return loadTemplate('abf-worker.md')
}

/**
 * 子 Agent 规则：仅 Worker 角色（刻意极简，避免上下文膨胀）。
 */
export function buildWorkerRulesContent(): string {
  try {
    return buildWorkerPrompt()
  } catch {
    appLog('warn', '[Supervisor] Failed to load abf-worker.md', 'supervisor-prompt')
    return ''
  }
}

/**
 * 派给 Worker 的任务文本：只做 trim，不再二次包装（角色约束已在 worker prompt 里）。
 */
export function wrapWorkerTaskPrompt(taskPrompt: string): string {
  return (taskPrompt || '').trim()
}

// ==================== 静态规则内容 ====================

function buildProviderRules(): string {
  return loadTemplate('abf-providers.md')
}

function buildGitWorkflowRules(): string {
  return loadTemplate('abf-git-workflow.md')
}

// ==================== 规则内容构建 ====================

/**
 * 构建全套 ABF 规则内容（字符串拼接）
 * 用于 HTTP API 的 appendSystemPrompt，以及 markdown 文件注入块。
 *
 * @param availableProviders - 可用的 AI Provider 名称列表
 * @param includeSupervisor - 是否包含 Supervisor 调度指引（默认 true）
 */
export function buildAllRulesContent(
  availableProviders: string[],
  includeSupervisor = true,
): string {
  return buildAgentsMdRulesContent(availableProviders, {
    includeCodexExtras: false,
    includeSupervisor,
  })
}

/**
 * 构建写入上下文 markdown 的规则正文。
 */
export function buildAgentsMdRulesContent(
  availableProviders: string[] = [],
  options: AgentsMdInjectOptions = {},
): string {
  const includeCodexExtras = options.includeCodexExtras === true
  const includeSupervisor = options.includeSupervisor !== false

  const parts: string[] = []
  try {
    parts.push(loadTemplate('abf-common.md'))
  } catch {
    appLog('warn', '[Supervisor] Failed to load abf-common.md', 'supervisor-prompt')
  }

  if (includeCodexExtras) {
    try {
      parts.push(loadTemplate('codex-agents.md'))
    } catch {
      appLog('warn', '[Supervisor] Failed to load codex-agents.md', 'supervisor-prompt')
    }
  }

  if (includeSupervisor) {
    parts.push(buildSupervisorPrompt(availableProviders))
  }

  try {
    parts.push(buildProviderRules())
  } catch {
    appLog('warn', '[Supervisor] Failed to load abf-providers.md', 'supervisor-prompt')
  }

  try {
    parts.push(buildGitWorkflowRules())
  } catch {
    appLog('warn', '[Supervisor] Failed to load abf-git-workflow.md', 'supervisor-prompt')
  }

  return parts.join('\n\n---\n\n')
}

/**
 * 构建 Codex 专用规则内容（含 codex-agents.md）。
 */
export function buildCodexRulesContent(availableProviders: string[] = []): string {
  return buildAgentsMdRulesContent(availableProviders, {
    includeCodexExtras: true,
    includeSupervisor: true,
  })
}

function stripInjectedAgentsRules(content: string): string {
  if (!content.includes(AGENTS_INJECT_START)) return content
  const pattern = new RegExp(
    `\\n?${AGENTS_INJECT_START}[\\s\\S]*?${AGENTS_INJECT_END}\\n?`,
    'g',
  )
  return content.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/**
 * 将 ABF 注入块写入单个 markdown 上下文文件（保留原有内容）。
 */
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
  const nextContent = preserved
    ? `${preserved}\n\n${injectedBlock}`
    : injectedBlock

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

// ==================== 文件操作 ====================

/**
 * 确保 .claude/rules/ 目录存在
 */
function ensureRulesDir(workDir: string): void {
  const rulesDir = path.join(workDir, '.claude', 'rules')
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true })
  }
}

/**
 * 注入全套 ABF 规则到工作目录
 * 写入 .claude/rules/abf-*.md，Claude Code 启动时自动加载
 *
 * @param workDir - 会话工作目录
 * @param availableProviders - 可用的 AI Provider 名称列表
 * @returns 写入的 supervisor 规则文件路径（兼容旧调用方）
 */
export function injectSupervisorPrompt(
  workDir: string,
  availableProviders: string[],
): string {
  ensureRulesDir(workDir)
  const rulesDir = path.join(workDir, '.claude', 'rules')

  // 构建规则文件内容（common + supervisor + providers + git）
  const rulesMap: Record<string, string> = {
    'abf-common.md': loadTemplate('abf-common.md'),
    'abf-supervisor.md': buildSupervisorPrompt(availableProviders),
    'abf-providers.md': buildProviderRules(),
    'abf-git-workflow.md': buildGitWorkflowRules(),
  }

  // 批量写入
  for (const [filename, content] of Object.entries(rulesMap)) {
    const filePath = path.join(rulesDir, filename)
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  appLog('info', `[Supervisor] Injected ${Object.keys(rulesMap).length} rule files to: ${rulesDir}`, 'supervisor-prompt')
  return path.join(rulesDir, 'abf-supervisor.md')
}

/**
 * 解析某 Provider 应注入的上下文文件列表。
 * 始终包含 AGENTS.md；Gemini/Qwen 等附加原生文件。
 */
export function resolveContextFilesForProvider(providerId: string, extraFiles: string[] = []): string[] {
  const extras = PROVIDER_EXTRA_CONTEXT_FILES[providerId] || []
  return Array.from(new Set([AGENTS_MD_FILE, ...extras, ...extraFiles]))
}

/**
 * 将 ABF 规则注入到工作目录的上下文 markdown 文件。
 * 默认 AGENTS.md；可通过 options.extraFiles 或 injectProviderRules 附加原生文件。
 */
export function injectAgentsMd(
  workDir: string,
  availableProviders: string[] = [],
  options: AgentsMdInjectOptions = {},
): void {
  const body = buildAgentsMdRulesContent(availableProviders, options)
  const files = resolveContextFilesForProvider('', options.extraFiles || [])
  // resolve with empty providerId only yields AGENTS.md + explicit extras
  for (const filename of files) {
    const filePath = path.join(workDir, filename)
    injectRulesIntoFile(filePath, body)
  }
  appLog(
    'info',
    `[Supervisor] Injected rules into: ${files.map(f => path.join(workDir, f)).join(', ')}`
      + (options.includeCodexExtras ? ' (with Codex extras)' : ''),
    'supervisor-prompt',
  )
}

/**
 * 按 Provider 写入其原生会自动加载的规则文件（无 system prompt 双通道）。
 */
export function injectProviderRules(
  workDir: string,
  providerId: string,
  availableProviders: string[] = [],
): void {
  const includeCodexExtras = providerId === 'codex'
  const body = buildAgentsMdRulesContent(availableProviders, {
    includeCodexExtras,
    includeSupervisor: true,
  })
  const files = resolveContextFilesForProvider(providerId)
  for (const filename of files) {
    injectRulesIntoFile(path.join(workDir, filename), body)
  }
  appLog(
    'info',
    `[Supervisor] Injected provider rules for '${providerId}' into: `
      + files.map(f => path.join(workDir, f)).join(', ')
      + (includeCodexExtras ? ' (with Codex extras)' : ''),
    'supervisor-prompt',
  )
}

/**
 * @deprecated 使用 injectProviderRules(workDir, 'codex', ...) 或 injectAgentsMd(..., { includeCodexExtras: true })
 */
export function injectCodexAgentsMd(workDir: string, availableProviders: string[] = []): void {
  injectProviderRules(workDir, 'codex', availableProviders)
}

/**
 * 清理所有 ABF 规则文件（会话结束时调用）
 *
 * @param workDir - 会话工作目录
 */
export function cleanupSupervisorPrompt(workDir: string): void {
  // 清理 .claude/rules/abf-*.md
  const rulesDir = path.join(workDir, '.claude', 'rules')
  for (const filename of ABF_RULES_FILES) {
    try {
      const filePath = path.join(rulesDir, filename)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // Ignore cleanup errors — file may already be gone
    }
  }

  for (const filename of ALL_INJECTABLE_CONTEXT_FILES) {
    try {
      cleanupInjectedFile(path.join(workDir, filename))
    } catch {
      // Ignore cleanup errors
    }
  }

  appLog('info', `[Supervisor] Cleaned up rule files from: ${workDir}`, 'supervisor-prompt')
}

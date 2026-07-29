/**
 * ABF 规则注入器
 *
 * 按 Provider 差异化注入规则：
 * - Claude:  写 .claude/rules/abf-*.md（自动发现，不用 appendSystemPrompt）
 * - 其他 CLI/Agent（含 Codex、Gemini、OpenCode、Grok 等）:
 *     1) 将 ABF 规则注入/合并到 AGENTS.md（文件发现链路）
 *     2) 同时通过 appendSystemPrompt 双通道注入（兼容不读 AGENTS.md 的 Agent）
 * - Codex 额外：AGENTS.md 内附带 codex-agents.md 专有配置
 *
 * 共享规则（abf-common.md）：中文要求、Windows 环境、开发规范
 * 所有 Provider 共享：providers 适配 + git-workflow + supervisor 调度指引
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
  'abf-providers.md',
  'abf-git-workflow.md',
] as const

/** 通用：AGENTS.md（Codex / 多数 coding agent 的文件发现入口） */
const AGENTS_MD_FILE = 'AGENTS.md'
/** 保持历史标记名，避免已有仓库内残留块无法被清理/更新 */
const AGENTS_INJECT_START = '<!-- ABF:CODEX-RULES:START -->'
const AGENTS_INJECT_END = '<!-- ABF:CODEX-RULES:END -->'

export interface AgentsMdInjectOptions {
  /** 是否附带 Codex 专用 codex-agents.md（默认 false） */
  includeCodexExtras?: boolean
  /** 是否包含 Supervisor 调度指引（默认 true） */
  includeSupervisor?: boolean
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
 * 用于 appendSystemPrompt，以及非 Codex 的 AGENTS.md 注入块。
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
 * 构建写入 AGENTS.md / 双通道注入用的规则正文。
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
 * @deprecated 优先使用 buildAgentsMdRulesContent({ includeCodexExtras: true })
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
 * 将 ABF 规则注入到工作目录的 AGENTS.md。
 * 若仓库已有 AGENTS.md，保留原内容，只追加/更新 ABF 注入块。
 * 适用于 Codex 以及 Gemini / OpenCode / Grok 等支持文件发现的 Agent。
 */
export function injectAgentsMd(
  workDir: string,
  availableProviders: string[] = [],
  options: AgentsMdInjectOptions = {},
): void {
  const agentsPath = path.join(workDir, AGENTS_MD_FILE)
  const body = buildAgentsMdRulesContent(availableProviders, options)
  const injectedBlock = `${AGENTS_INJECT_START}\n${body}\n${AGENTS_INJECT_END}\n`

  let existing = ''
  try {
    existing = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf-8') : ''
  } catch {
    appLog('warn', '[Supervisor] Failed to read existing AGENTS.md', 'supervisor-prompt')
    existing = ''
  }

  const preserved = stripInjectedAgentsRules(existing)
  const nextContent = preserved
    ? `${preserved}\n\n${injectedBlock}`
    : injectedBlock

  fs.writeFileSync(agentsPath, nextContent, 'utf-8')
  appLog(
    'info',
    `[Supervisor] Injected AGENTS.md rules into: ${agentsPath}`
      + (options.includeCodexExtras ? ' (with Codex extras)' : ''),
    'supervisor-prompt',
  )
}

/**
 * @deprecated 使用 injectAgentsMd(..., { includeCodexExtras: true })
 * 保留别名，兼容旧调用方。
 */
export function injectCodexAgentsMd(workDir: string, availableProviders: string[] = []): void {
  injectAgentsMd(workDir, availableProviders, {
    includeCodexExtras: true,
    includeSupervisor: true,
  })
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

  try {
    const agentsPath = path.join(workDir, AGENTS_MD_FILE)
    if (fs.existsSync(agentsPath)) {
      const existing = fs.readFileSync(agentsPath, 'utf-8')
      const cleaned = stripInjectedAgentsRules(existing)
      if (cleaned.trim()) {
        fs.writeFileSync(agentsPath, `${cleaned}\n`, 'utf-8')
      } else {
        fs.unlinkSync(agentsPath)
      }
    }
  } catch {
    // Ignore cleanup errors
  }

  appLog('info', `[Supervisor] Cleaned up rule files from: ${workDir}`, 'supervisor-prompt')
}

/**
 * ABF 规则注入器
 *
 * 为 Claude Code 会话注入全套 ABF 规则文件：
 * - abf-supervisor.md  — Supervisor 调度指引（动态，含可用 Provider 列表）
 * - abf-architecture.md — 项目架构规则
 * - abf-providers.md    — Provider 适配规则
 * - abf-testing.md      — 测试规则
 * - abf-git-workflow.md — Git 与代码推送流程
 *
 * 注入方式：写入 {workDir}/.claude/rules/abf-*.md
 * （Claude Code 官方规则发现路径，会话启动时自动加载）
 * 会话结束后自动清理，不影响用户自己的规则文件
 *
 * 模板文件位于 resources/prompts/ 目录下，打包后通过 extraResources 分发。
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import { app } from 'electron'
import { appLog } from './log.js'

/** Claude: ABF 注入的规则文件名（会话结束时统一清理） */
const ABF_RULES_FILES = [
  'abf-supervisor.md',
  'abf-providers.md',
  'abf-git-workflow.md',
] as const

/** Codex: AGENTS.md 文件名 */
const CODEX_AGENTS_FILE = 'AGENTS.md'

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

function buildArchitectureRules(): string {
  return loadTemplate('abf-architecture.md')
}

function buildProviderRules(): string {
  return loadTemplate('abf-providers.md')
}

function buildTestingRules(): string {
  return loadTemplate('abf-testing.md')
}

function buildGitWorkflowRules(): string {
  return loadTemplate('abf-git-workflow.md')
}

// ==================== 规则内容构建（供 system prompt 注入） ====================

/**
 * 构建全套 ABF 规则内容（字符串拼接，供注入到 system prompt）
 *
 * @param availableProviders - 可用的 AI Provider 名称列表
 * @param includeSupervisor - 是否包含 Supervisor 调度指引（默认 true）
 * @returns 拼接后的规则文本
 */
/**
 * 构建 ABF 规则内容（仅用于非 Claude/Codex 的 Provider 的 appendSystemPrompt 注入）
 * Claude 和 Codex 各自通过文件发现机制获取规则，不需要 appendSystemPrompt。
 */
export function buildAllRulesContent(
  availableProviders: string[],
  includeSupervisor = true,
): string {
  const parts: string[] = []
  if (includeSupervisor) {
    parts.push(buildSupervisorPrompt(availableProviders))
  }
  // 只保留 providers 和 git-workflow（去掉 architecture 和 testing）
  parts.push(buildProviderRules())
  parts.push(buildGitWorkflowRules())
  return parts.join('\n\n---\n\n')
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

  // 构建规则文件内容（去掉 architecture 和 testing，减少 token 消耗）
  const rulesMap: Record<string, string> = {
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
 * 注入 Codex AGENTS.md 到工作目录
 * Codex CLI 启动时自动读取项目根目录的 AGENTS.md
 *
 * @param workDir - 会话工作目录
 * @param availableProviders - 可用的 AI Provider 名称列表
 */
export function injectCodexAgentsMd(
  workDir: string,
  availableProviders: string[],
): void {
  const agentsPath = path.join(workDir, CODEX_AGENTS_FILE)

  // 读取 Codex 专用模板
  let codexTemplate = ''
  try {
    const promptsDir = getPromptsDir()
    codexTemplate = fs.readFileSync(path.join(promptsDir, 'codex-agents.md'), 'utf-8')
  } catch {
    appLog('warn', '[Supervisor] Failed to read codex-agents.md template', 'supervisor-prompt')
    return
  }

  // 拼接 ABF 规则（providers + git-workflow，不含 supervisor 调度指引）
  const abfRules = [
    buildProviderRules(),
    buildGitWorkflowRules(),
  ].join('\n\n---\n\n')

  const content = `${codexTemplate}\n\n---\n\n${abfRules}`
  fs.writeFileSync(agentsPath, content, 'utf-8')
  appLog('info', `[Supervisor] Injected AGENTS.md to: ${agentsPath}`, 'supervisor-prompt')
}

/**
 * 清理所有 ABF 规则文件（会话结束时调用）
 *
 * @param workDir - 会话工作目录
 * @param cleanAgentsMd - 是否同时清理 AGENTS.md（Codex 会话）
 */
export function cleanupSupervisorPrompt(workDir: string, cleanAgentsMd = false): void {
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

  // 清理 Codex AGENTS.md
  if (cleanAgentsMd) {
    try {
      const agentsPath = path.join(workDir, CODEX_AGENTS_FILE)
      if (fs.existsSync(agentsPath)) {
        fs.unlinkSync(agentsPath)
      }
    } catch {
      // Ignore
    }
  }

  // 同时清理旧版 architecture/testing 规则文件（如果存在）
  for (const oldFile of ['abf-architecture.md', 'abf-testing.md']) {
    try {
      const oldPath = path.join(rulesDir, oldFile)
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath)
      }
    } catch {}
  }

  appLog('info', `[Supervisor] Cleaned up rule files from: ${workDir}`, 'supervisor-prompt')
}

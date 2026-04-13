/**
 * Claude Code v2.x 专属输出解析规则 + 规则聚合
 */

import type { ParserRule } from './types.js'
import { GENERIC_RULES } from './genericRules.js'
import { CODEX_RULES } from './codexRules.js'
import { GEMINI_RULES } from './geminiRules.js'
import { OPENCODE_RULES } from './opencodeRules.js'

/**
 * Claude Code 专属规则
 */
const CLAUDE_RULES: ParserRule[] = [
  // ---- Claude 特有等待确认 ----
  {
    type: 'waiting_confirmation',
    priority: 20,
    providerId: 'claude-code',
    patterns: [
      /Allow\s+.+\?\s*\(y\)/i,
      /Press Enter to continue/i
    ],
    extractDetail: (line: string): string => {
      const allowMatch = line.match(/Allow\s+(.+)\?\s*\(y\)/i)
      if (allowMatch) return `等待确认: ${allowMatch[1]}`
      return '等待用户确认'
    }
  },

  // ---- 上下文压缩 ----
  {
    type: 'context_summary',
    priority: 17,
    providerId: 'claude-code',
    patterns: [
      /context\s+(?:window\s+)?compact/i,
      /conversation\s+(?:is\s+)?(?:being\s+)?compress/i,
      /Auto-compact/i,
      /summariz(?:ing|ed)\s+(?:the\s+)?conversation/i,
      /context\s+(?:limit|length)\s+(?:reached|exceeded)/i
    ],
    extractDetail: (line: string): string => {
      if (/auto.compact/i.test(line)) return '自动压缩上下文'
      if (/compress/i.test(line)) return '压缩对话上下文'
      if (/summariz/i.test(line)) return '摘要对话上下文'
      return '上下文压缩'
    }
  },

  // ---- Claude Code 工具调用: ⏺ ToolName(args) ----

  // 读取文件
  {
    type: 'file_read',
    priority: 15,
    providerId: 'claude-code',
    patterns: [
      /[⏺●]\s*Read\s*\(?([^\s)]+)/,
    ],
    extractDetail: (line: string): string => {
      const readMatch = line.match(/[⏺●]\s*Read\s*\(?([^\s)]+)/)
      if (readMatch) return `读取文件: ${readMatch[1]}`
      return '读取文件'
    }
  },

  // 写入/创建/编辑文件
  {
    type: 'file_write',
    priority: 15,
    providerId: 'claude-code',
    patterns: [
      /[⏺●]\s*Write\s*\(?([^\s)]+)/,
      /[⏺●]\s*Edit\s*\(?([^\s)]+)/,
      /[⏺●]\s*NotebookEdit\s*\(?([^\s)]+)/,
    ],
    extractDetail: (line: string): string => {
      const writeMatch = line.match(/[⏺●]\s*Write\s*\(?([^\s)]+)/)
      if (writeMatch) return `写入文件: ${writeMatch[1]}`

      const editMatch = line.match(/[⏺●]\s*Edit\s*\(?([^\s)]+)/)
      if (editMatch) return `编辑文件: ${editMatch[1]}`

      const nbMatch = line.match(/[⏺●]\s*NotebookEdit\s*\(?([^\s)]+)/)
      if (nbMatch) return `编辑笔记本: ${nbMatch[1]}`

      return '写入文件'
    }
  },

  // 执行命令
  {
    type: 'command_execute',
    priority: 14,
    providerId: 'claude-code',
    patterns: [
      /[⏺●]\s*Bash\s*\(?(.+)\)?/,
    ],
    extractDetail: (line: string): string => {
      const bashMatch = line.match(/[⏺●]\s*Bash\s*\(?(.+?)\)?$/)
      if (bashMatch) return `执行命令: ${bashMatch[1].slice(0, 80)}`
      return '执行命令'
    }
  },

  // 搜索文件/内容
  {
    type: 'search',
    priority: 14,
    providerId: 'claude-code',
    patterns: [
      /[⏺●]\s*Glob\s*\(?([^\s)]+)/,
      /[⏺●]\s*Grep\s*\(?([^\s)]+)/,
      /[⏺●]\s*WebSearch\s*\(?(.+)\)?/,
      /[⏺●]\s*WebFetch\s*\(?(.+)\)?/,
    ],
    extractDetail: (line: string): string => {
      const globMatch = line.match(/[⏺●]\s*Glob\s*\(?([^\s)]+)/)
      if (globMatch) return `搜索文件: ${globMatch[1]}`

      const grepMatch = line.match(/[⏺●]\s*Grep\s*\(?([^\s)]+)/)
      if (grepMatch) return `搜索内容: ${grepMatch[1]}`

      const wsMatch = line.match(/[⏺●]\s*WebSearch\s*\(?(.+?)\)?$/)
      if (wsMatch) return `网络搜索: ${wsMatch[1].slice(0, 60)}`

      const wfMatch = line.match(/[⏺●]\s*WebFetch\s*\(?(.+?)\)?$/)
      if (wfMatch) return `获取网页: ${wfMatch[1].slice(0, 60)}`

      return '搜索'
    }
  },

  // 子任务/Agent/MCP/Skill
  {
    type: 'tool_use',
    priority: 13,
    providerId: 'claude-code',
    patterns: [
      /[⏺●]\s*Task\s*\(?(.+)\)?/,
      /[⏺●]\s*TodoRead/,
      /[⏺●]\s*TodoWrite/,
      /[⏺●]\s*mcp__(\w+)__(\w+)/,
      /[⏺●]\s*Skill\s*\(?(.+)\)?/,
      /[⏺●]\s*AskUserQuestion/,
      /[⏺●]\s*EnterPlanMode/,
      /[⏺●]\s*ExitPlanMode/
    ],
    extractDetail: (line: string): string => {
      const taskMatch = line.match(/[⏺●]\s*Task\s*\(?(.+?)\)?$/)
      if (taskMatch) return `子任务: ${taskMatch[1].slice(0, 80)}`

      if (/TodoRead/.test(line)) return '读取待办事项'
      if (/TodoWrite/.test(line)) return '更新待办事项'

      const mcpMatch = line.match(/[⏺●]\s*mcp__(\w+)__(\w+)/)
      if (mcpMatch) return `MCP 工具: ${mcpMatch[1]}.${mcpMatch[2]}`

      const skillMatch = line.match(/[⏺●]\s*Skill\s*\(?(.+?)\)?$/)
      if (skillMatch) return `技能: ${skillMatch[1].slice(0, 60)}`

      if (/AskUserQuestion/.test(line)) return '向用户提问'
      if (/EnterPlanMode/.test(line)) return '进入规划模式'
      if (/ExitPlanMode/.test(line)) return '退出规划模式'

      return '工具调用'
    }
  },

  // ---- Claude Token 用量统计行 ----
  {
    type: 'context_summary',
    priority: 8,
    providerId: 'claude-code',
    patterns: [
      /(\d[\d,]+)\s+input\s+.*?(\d[\d,]+)\s+output\s+token/i,
    ],
    extractDetail: (line: string): string => {
      const tokenMatch = line.match(/(\d[\d,]+)\s+input\s+.*?(\d[\d,]+)\s+output/i)
      if (tokenMatch) {
        return `Token 统计: ${tokenMatch[1]} 输入 / ${tokenMatch[2]} 输出`
      }
      return 'Token 用量统计'
    }
  },
]

/**
 * 合并后的完整规则列表
 */
export const PARSER_RULES: ParserRule[] = [
  ...CLAUDE_RULES,
  ...CODEX_RULES,
  ...GEMINI_RULES,
  ...OPENCODE_RULES,
  ...GENERIC_RULES,
].sort((a, b) => b.priority - a.priority)

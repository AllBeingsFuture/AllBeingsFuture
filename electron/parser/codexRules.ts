/**
 * OpenAI Codex CLI 专属输出解析规则
 * providerId: 'codex'
 */

import type { ParserRule } from './types.js'

export const CODEX_RULES: ParserRule[] = [
  // ---- Codex 审批提示 ----
  {
    type: 'waiting_confirmation',
    priority: 20,
    providerId: 'codex',
    patterns: [
      /approve|reject/i,
      /permission.*(?:allow|deny)/i,
      /Do you want to (?:run|execute|apply)/i,
    ],
    extractDetail: (line: string): string => {
      if (/approve|reject/i.test(line)) return '等待审批操作'
      if (/permission/i.test(line)) return '等待权限确认'
      return '等待用户确认'
    }
  },

  // ---- Codex 文件变更 ----
  {
    type: 'file_write',
    priority: 15,
    providerId: 'codex',
    patterns: [
      /file_change.*"path"\s*:\s*"([^"]+)"/,
      /apply_patch.*?([^\s"]+\.\w+)/i,
      /(?:Created|Modified|Deleted)\s+(?:file\s+)?["']?([^\s"']+)/i,
    ],
    extractDetail: (line: string): string => {
      const pathMatch = line.match(/"path"\s*:\s*"([^"]+)"/)
      if (pathMatch) return `文件变更: ${pathMatch[1]}`

      const patchMatch = line.match(/apply_patch.*?([^\s"]+\.\w+)/i)
      if (patchMatch) return `应用补丁: ${patchMatch[1]}`

      const fileMatch = line.match(/(?:Created|Modified|Deleted)\s+(?:file\s+)?["']?([^\s"']+)/i)
      if (fileMatch) return `文件操作: ${fileMatch[1]}`

      return '文件变更'
    }
  },

  // ---- Codex 命令执行 ----
  {
    type: 'command_execute',
    priority: 14,
    providerId: 'codex',
    patterns: [
      /command_execution.*"command"\s*:\s*"([^"]+)"/,
      /!\s+(.{3,})/,
      /exit_code[:\s]+(\d+)/i,
    ],
    extractDetail: (line: string): string => {
      const cmdMatch = line.match(/"command"\s*:\s*"([^"]+)"/)
      if (cmdMatch) return `执行命令: ${cmdMatch[1].slice(0, 80)}`

      const bangMatch = line.match(/!\s+(.+)/)
      if (bangMatch) return `执行命令: ${bangMatch[1].slice(0, 80)}`

      const exitMatch = line.match(/exit_code[:\s]+(\d+)/i)
      if (exitMatch) return `命令退出: code ${exitMatch[1]}`

      return '执行命令'
    }
  },

  // ---- Codex 搜索/网络 ----
  {
    type: 'search',
    priority: 13,
    providerId: 'codex',
    patterns: [
      /web_search.*"query"\s*:\s*"([^"]+)"/,
      /mcp_tool_call/,
    ],
    extractDetail: (line: string): string => {
      const searchMatch = line.match(/"query"\s*:\s*"([^"]+)"/)
      if (searchMatch) return `网络搜索: ${searchMatch[1].slice(0, 60)}`

      if (/mcp_tool_call/.test(line)) return 'MCP 工具调用'

      return '搜索'
    }
  },

  // ---- Codex Agent 消息 ----
  {
    type: 'assistant_message',
    priority: 10,
    providerId: 'codex',
    patterns: [
      /agent_message.*"text"\s*:\s*"([^"]{5,})"/,
    ],
    extractDetail: (line: string): string => {
      const msgMatch = line.match(/"text"\s*:\s*"([^"]+)"/)
      if (msgMatch) return `回复: ${msgMatch[1].slice(0, 80)}`
      return '助手回复'
    }
  },

  // ---- Codex Token 统计 ----
  {
    type: 'context_summary',
    priority: 8,
    providerId: 'codex',
    patterns: [
      /input_tokens[:\s]+(\d[\d,]+)/i,
      /output_tokens[:\s]+(\d[\d,]+)/i,
      /total_tokens[:\s]+(\d[\d,]+)/i,
    ],
    extractDetail: (line: string): string => {
      const inputMatch = line.match(/input_tokens[:\s]+(\d[\d,]+)/i)
      const outputMatch = line.match(/output_tokens[:\s]+(\d[\d,]+)/i)
      if (inputMatch && outputMatch) {
        return `Token 统计: ${inputMatch[1]} 输入 / ${outputMatch[1]} 输出`
      }
      const totalMatch = line.match(/total_tokens[:\s]+(\d[\d,]+)/i)
      if (totalMatch) return `Token 总计: ${totalMatch[1]}`
      return 'Token 用量统计'
    }
  },

  // ---- Codex 日志级别错误 ----
  {
    type: 'error',
    priority: 18,
    providerId: 'codex',
    patterns: [
      /\[ERROR\]\s*(.+)/i,
      /turn\.failed/,
      /"type"\s*:\s*"error"/,
    ],
    extractDetail: (line: string): string => {
      const errMatch = line.match(/\[ERROR\]\s*(.+)/i)
      if (errMatch) return `错误: ${errMatch[1].slice(0, 80)}`

      if (/turn\.failed/.test(line)) return '回合执行失败'

      return '发生错误'
    }
  },

  // ---- Codex 思考/推理 ----
  {
    type: 'thinking',
    priority: 5,
    providerId: 'codex',
    patterns: [
      /reasoning/i,
      /\[INFO\]\s*Processing/i,
    ],
    extractDetail: (): string => '正在思考...'
  },
]

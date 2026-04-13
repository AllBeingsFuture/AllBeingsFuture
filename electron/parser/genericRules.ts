/**
 * 通用兜底解析规则（适用于所有 CLI Provider）
 */

import type { ParserRule } from './types.js'

export const GENERIC_RULES: ParserRule[] = [
  // ---- 通用等待确认 ----
  {
    type: 'waiting_confirmation',
    priority: 19,
    patterns: [
      /\(Y\/n\)/,
      /\(y\/N\)/,
      /\[Y\/n\]/i,
      /\[y\/N\]/i,
      /\(yes\/no\)/i,
    ],
    extractDetail: (): string => '等待用户确认'
  },

  // ---- 通用错误 ----
  {
    type: 'error',
    priority: 18,
    patterns: [
      /✗\s+(.+)/,
      /\bERROR:\s*(.{5,})/i,
      /^\s*\[ERROR\]\s*(.{5,})/i,
      /^\s*Failed to\s+(.{5,})/i,
      /APIError[:\s]+(.+)/i,
      /403\s+Forbidden/i,
      /401\s+Unauthorized/i,
      /rate.?limit/i,
      /ENOENT[:\s]/,
      /EACCES[:\s]/,
      /EPERM[:\s]/,
      /Cannot find module/i,
      /SyntaxError[:\s]/i,
      /\bException:\s*(.{5,})/i,
      /Traceback\s+\(most recent/i,
    ],
    extractDetail: (line: string): string => {
      const m1 = line.match(/✗\s+(.+)/)
      if (m1) return `失败: ${m1[1].slice(0, 80)}`

      const m2 = line.match(/\bERROR:\s*(.+)/i) || line.match(/^\s*\[ERROR\]\s*(.+)/i)
      if (m2) return `错误: ${m2[1].slice(0, 80)}`

      const m3 = line.match(/^\s*Failed to\s+(.+)/i)
      if (m3) return `失败: ${m3[1].slice(0, 80)}`

      const m4 = line.match(/APIError[:\s]+(.+)/i)
      if (m4) return `API 错误: ${m4[1].slice(0, 80)}`

      const m5 = line.match(/\bException:\s*(.+)/i)
      if (m5) return `异常: ${m5[1].slice(0, 80)}`

      if (/403\s+Forbidden/i.test(line)) return '错误: 403 未授权'
      if (/rate.?limit/i.test(line)) return '错误: 速率限制'
      if (/ENOENT/.test(line)) return '错误: 文件不存在'
      if (/EACCES|EPERM/.test(line)) return '错误: 权限不足'
      if (/Cannot find module/i.test(line)) return '错误: 模块未找到'
      if (/SyntaxError/i.test(line)) return '错误: 语法错误'
      if (/Traceback/i.test(line)) return '错误: Python 异常'

      return '发生错误'
    }
  },

  // ---- 通用文件读取 ----
  {
    type: 'file_read',
    priority: 12,
    patterns: [
      /Reading\s+["'`]?([^\s"'`]{5,})/,
      /read(?:ing)?\s+file[:\s]+["'`]?([^\s"'`]+)/i,
      /cat\s+["']?([^\s"']+)/,
    ],
    extractDetail: (line: string): string => {
      const m = line.match(/(?:Reading|read(?:ing)?\s+file[:\s]+|cat\s+)["'`]?([^\s"'`]+)/i)
      if (m) return `读取文件: ${m[1]}`
      return '读取文件'
    }
  },

  // ---- 通用文件写入 ----
  {
    type: 'file_write',
    priority: 12,
    patterns: [
      /Writ(?:ing|e|ten)\s+(?:to\s+)?["'`]?([^\s"'`]{5,})/i,
      /Wrote\s+(?:to\s+)?["'`]?([^\s"'`]{5,})/i,
      /Creat(?:ing|ed?)\s+(?:file\s+)?["'`]?([^\s"'`]{5,})/i,
      /Sav(?:ing|ed?)\s+(?:to\s+)?["'`]?([^\s"'`]{5,})/i,
      /Updat(?:ing|ed?)\s+["'`]?([^\s"'`]{5,})/i,
    ],
    extractDetail: (line: string): string => {
      const m = line.match(/(?:Writ(?:ing|e|ten)|Wrote|Creat(?:ing|ed?)|Sav(?:ing|ed?)|Updat(?:ing|ed?))\s+(?:to\s+|file\s+)?["'`]?([^\s"'`]+)/i)
      if (m) return `写入文件: ${m[1]}`
      return '写入文件'
    }
  },

  // ---- 通用命令执行 ----
  {
    type: 'command_execute',
    priority: 11,
    patterns: [
      /Running\s+[`"](.{3,})[`"]/i,
      /Executing[:\s]+["'`]?(.{3,})/i,
      /❯\s+(.{3,})/,
      /\$\s+(.{3,})/,
    ],
    extractDetail: (line: string): string => {
      const m = line.match(/(?:Running|Executing)[:\s]+[`"']?(.+?)[`"']?\s*$/i)
        || line.match(/[❯$]\s+(.+)/)
      if (m) return `执行命令: ${m[1].slice(0, 80)}`
      return '执行命令'
    }
  },

  // ---- 通用搜索 ----
  {
    type: 'search',
    priority: 11,
    patterns: [
      /Searching\s+(?:for\s+)?["'`]?(.{3,})/i,
      /Looking\s+(?:for|up)\s+["'`]?(.{3,})/i,
    ],
    extractDetail: (line: string): string => {
      const m = line.match(/(?:Searching|Looking)\s+(?:for\s+|up\s+)?["'`]?(.+)/i)
      if (m) return `搜索: ${m[1].slice(0, 60)}`
      return '搜索'
    }
  },

  // ---- 通用任务完成 ----
  {
    type: 'task_complete',
    priority: 10,
    patterns: [
      /✓\s+(.{3,})/,
      /✔\s+(.{3,})/,
      /Successfully\s+(.{5,})/i,
      /Done[!.]\s*$/i,
      /Complete[d]?[!.]\s*$/i,
    ],
    extractDetail: (line: string): string => {
      const m = line.match(/[✓✔]\s+(.+)/)
      if (m) return `完成: ${m[1].slice(0, 80)}`

      const sMatch = line.match(/Successfully\s+(.+)/i)
      if (sMatch) return `完成: ${sMatch[1].slice(0, 80)}`

      return '任务完成'
    }
  },

  // ---- 通用用量/费用统计 ----
  {
    type: 'context_summary',
    priority: 8,
    patterns: [
      /Total\s+(?:cost|tokens?)[:\s]+/i,
      /Token\s+usage[:\s]+/i,
      /Usage[:\s]+\$[\d.]+/i,
    ],
    extractDetail: (line: string): string => {
      const costMatch = line.match(/(?:Total\s+cost|Usage)[:\s]+\$?([\d.]+)/i)
      if (costMatch) return `费用统计: $${costMatch[1]}`
      return '用量统计'
    }
  },

  // ---- 通用思考状态 ----
  {
    type: 'thinking',
    priority: 3,
    patterns: [
      /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s/,
      /Thinking\.{2,}/i,
      /Processing\.{2,}/i,
    ],
    extractDetail: (): string => '正在思考...'
  }
]

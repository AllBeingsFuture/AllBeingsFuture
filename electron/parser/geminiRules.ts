/**
 * Google Gemini CLI 专属输出解析规则
 * providerId: 'gemini-cli'
 */

import type { ParserRule } from './types.js'

export const GEMINI_RULES: ParserRule[] = [
  // ---- Gemini 等待确认 ----
  {
    type: 'waiting_confirmation',
    priority: 20,
    providerId: 'gemini-cli',
    patterns: [
      /Approve\?\s*\(Y\/n\)/i,
      /Approve\?\s*\(y\/n\/always\)/i,
      /Do you want to (?:continue|proceed|run)/i,
    ],
    extractDetail: (line: string): string => {
      if (/always/i.test(line)) return '等待确认（可选始终允许）'
      return '等待用户确认'
    }
  },

  // ---- Gemini 文件读取 ----
  {
    type: 'file_read',
    priority: 15,
    providerId: 'gemini-cli',
    patterns: [
      /ReadFile\s+["']?([^\s"']+)/,
      /File:\s+([^\s]+)/,
    ],
    extractDetail: (line: string): string => {
      const readMatch = line.match(/ReadFile\s+["']?([^\s"']+)/)
        || line.match(/File:\s+([^\s]+)/)
      if (readMatch) return `读取文件: ${readMatch[1]}`
      return '读取文件'
    }
  },

  // ---- Gemini 文件编辑/写入 ----
  {
    type: 'file_write',
    priority: 15,
    providerId: 'gemini-cli',
    patterns: [
      /Edit\s+\(replace\)/i,
      /WriteFile\s+["']?([^\s"']+)/,
      /replace.*old_string/i,
    ],
    extractDetail: (line: string): string => {
      const writeMatch = line.match(/WriteFile\s+["']?([^\s"']+)/)
      if (writeMatch) return `写入文件: ${writeMatch[1]}`

      if (/Edit\s+\(replace\)/i.test(line)) return '编辑文件 (替换)'

      return '文件编辑'
    }
  },

  // ---- Gemini Shell 命令执行 ----
  {
    type: 'command_execute',
    priority: 14,
    providerId: 'gemini-cli',
    patterns: [
      /Shell command exited with code\s+(\d+)/i,
      /shell_exec(?:ute)?\s+["']?(.{3,})/i,
    ],
    extractDetail: (line: string): string => {
      const exitMatch = line.match(/Shell command exited with code\s+(\d+)/i)
      if (exitMatch) return `命令退出: code ${exitMatch[1]}`

      const cmdMatch = line.match(/shell_exec(?:ute)?\s+["']?(.+)/i)
      if (cmdMatch) return `执行命令: ${cmdMatch[1].slice(0, 80)}`

      return '执行命令'
    }
  },

  // ---- Gemini 搜索 ----
  {
    type: 'search',
    priority: 14,
    providerId: 'gemini-cli',
    patterns: [
      /GoogleSearch\s+(.+)/i,
      /FindFiles\s+\(glob\)/i,
      /Search results for\s+["'](.+?)["']/i,
      /codebase_investigator/i,
    ],
    extractDetail: (line: string): string => {
      const searchMatch = line.match(/GoogleSearch\s+(?:Searching.*?for:\s*)?["']?(.+?)["']?\s*$/i)
      if (searchMatch) return `Google 搜索: ${searchMatch[1].slice(0, 60)}`

      const resultMatch = line.match(/Search results for\s+["'](.+?)["']/i)
      if (resultMatch) return `搜索结果: ${resultMatch[1].slice(0, 60)}`

      if (/FindFiles/i.test(line)) return '文件搜索 (glob)'
      if (/codebase_investigator/i.test(line)) return '代码库分析'

      return '搜索'
    }
  },

  // ---- Gemini MCP 服务器状态 ----
  {
    type: 'tool_use',
    priority: 13,
    providerId: 'gemini-cli',
    patterns: [
      /🟢\s+(\w+).*?Ready\s*\((\d+)\s+tools?\)/i,
      /🔴\s+(\w+).*?(?:Error|Failed)/i,
    ],
    extractDetail: (line: string): string => {
      const readyMatch = line.match(/🟢\s+(\w+).*?Ready\s*\((\d+)\s+tools?\)/i)
      if (readyMatch) return `MCP: ${readyMatch[1]} 就绪 (${readyMatch[2]} 工具)`

      const failMatch = line.match(/🔴\s+(\w+)/)
      if (failMatch) return `MCP: ${failMatch[1]} 失败`

      return 'MCP 服务器'
    }
  },

  // ---- Gemini 文件编辑失败 ----
  {
    type: 'error',
    priority: 18,
    providerId: 'gemini-cli',
    patterns: [
      /Failed to edit,?\s+(.+)/i,
      /Cannot display content of binary file/i,
      /FatalAuthenticationError/i,
      /FatalInputError/i,
      /FatalConfigError/i,
    ],
    extractDetail: (line: string): string => {
      const editFail = line.match(/Failed to edit,?\s+(.+)/i)
      if (editFail) return `编辑失败: ${editFail[1].slice(0, 60)}`

      if (/binary file/i.test(line)) return '错误: 无法显示二进制文件'
      if (/AuthenticationError/i.test(line)) return '错误: 认证失败'
      if (/InputError/i.test(line)) return '错误: 输入无效'
      if (/ConfigError/i.test(line)) return '错误: 配置错误'

      return '发生错误'
    }
  },

  // ---- Gemini 目录列表 ----
  {
    type: 'file_read',
    priority: 10,
    providerId: 'gemini-cli',
    patterns: [
      /Directory listing for\s+(.+)/i,
      /\[DIR\]\s+(\S+)/,
    ],
    extractDetail: (line: string): string => {
      const dirMatch = line.match(/Directory listing for\s+(.+)/i)
      if (dirMatch) return `目录列表: ${dirMatch[1]}`
      return '浏览目录'
    }
  },

  // ---- Gemini 思考/规划 ----
  {
    type: 'thinking',
    priority: 5,
    providerId: 'gemini-cli',
    patterns: [
      /Thinking|Planning/i,
      /Generating Response/i,
    ],
    extractDetail: (line: string): string => {
      if (/Planning/i.test(line)) return '正在规划...'
      if (/Generating/i.test(line)) return '正在生成回复...'
      return '正在思考...'
    }
  },

  // ---- Gemini Token/统计 ----
  {
    type: 'context_summary',
    priority: 8,
    providerId: 'gemini-cli',
    patterns: [
      /prompt[:\s]+(\d[\d,]+)\s+tokens?/i,
      /candidates?[:\s]+(\d[\d,]+)\s+tokens?/i,
      /cached[:\s]+(\d[\d,]+)\s+tokens?/i,
    ],
    extractDetail: (line: string): string => {
      const promptMatch = line.match(/prompt[:\s]+(\d[\d,]+)/i)
      const candMatch = line.match(/candidates?[:\s]+(\d[\d,]+)/i)
      if (promptMatch && candMatch) {
        return `Token: ${promptMatch[1]} prompt / ${candMatch[1]} 输出`
      }
      const cachedMatch = line.match(/cached[:\s]+(\d[\d,]+)/i)
      if (cachedMatch) return `缓存 Token: ${cachedMatch[1]}`
      return 'Token 统计'
    }
  },
]

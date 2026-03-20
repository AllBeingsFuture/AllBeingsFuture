/**
 * SDK 工具名 → ActivityEventType 映射
 * 将各 Provider 的工具调用统一映射为活动事件类型
 */

// ---- Types ----
// Keep in sync with frontend/src/types/activityTypes.ts

export type ActivityEventType =
  | 'session_start'
  | 'thinking'
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'file_create'
  | 'file_delete'
  | 'command_execute'
  | 'command_output'
  | 'search'
  | 'tool_use'
  | 'error'
  | 'waiting_confirmation'
  | 'user_input'
  | 'turn_complete'
  | 'task_complete'
  | 'context_summary'
  | 'assistant_message'
  | 'idle'
  | 'unknown_activity'

// ---- Claude Code SDK 工具映射 ----

const CLAUDE_TOOL_MAP: Record<string, ActivityEventType> = {
  'Read': 'file_read',
  'Write': 'file_write',
  'Edit': 'file_edit',
  'Glob': 'search',
  'Grep': 'search',
  'WebSearch': 'search',
  'WebFetch': 'search',
  'Bash': 'command_execute',
  'Task': 'tool_use',
  'LSP': 'tool_use',
  'NotebookEdit': 'file_write',
  'TodoRead': 'tool_use',
  'TodoWrite': 'tool_use',
}

// ---- Codex App Server 事件映射 ----

const CODEX_ITEM_MAP: Record<string, ActivityEventType> = {
  'localShellCall': 'command_execute',
  'local_shell_call': 'command_execute',
  'functionCall': 'tool_use',
  'function_call': 'tool_use',
  'agentMessage': 'assistant_message',
  'commandExecution': 'command_execute',
  'shell': 'command_execute',
  'fileChange': 'file_write',
  'fileRead': 'file_read',
  'codeExecution': 'command_execute',
}

// ---- Gemini Headless 事件映射 ----

const GEMINI_ACTION_MAP: Record<string, ActivityEventType> = {
  'shell': 'command_execute',
  'editFile': 'file_write',
  'readFile': 'file_read',
  'searchFiles': 'search',
  'webSearch': 'search',
}

// ---- OpenCode 工具映射 ----

const OPENCODE_TOOL_MAP: Record<string, ActivityEventType> = {
  'read': 'file_read',
  'list': 'file_read',
  'write': 'file_write',
  'edit': 'file_edit',
  'patch': 'file_write',
  'grep': 'search',
  'glob': 'search',
  'websearch': 'search',
  'bash': 'command_execute',
  'webfetch': 'tool_use',
  'lsp': 'tool_use',
  'todowrite': 'tool_use',
  'todoread': 'tool_use',
  'question': 'tool_use',
  'skill': 'tool_use',
}

// ---- iFlow CLI ACP 工具映射 ----

const IFLOW_TOOL_MAP: Record<string, ActivityEventType> = {
  'read_file': 'file_read',
  'image_read': 'file_read',
  'read_many_files': 'file_read',
  'todo_read': 'tool_use',
  'replace': 'file_edit',
  'write_file': 'file_write',
  'multi_edit': 'file_edit',
  'xml_escape': 'tool_use',
  'save_memory': 'tool_use',
  'list_directory': 'search',
  'search_file_content': 'search',
  'glob': 'search',
  'web_search': 'search',
  'web_fetch': 'search',
  'run_shell_command': 'command_execute',
  'task': 'tool_use',
  'Skill': 'tool_use',
  'todo_write': 'tool_use',
  'ReadCommandOutput': 'tool_use',
  'exit_plan_mode': 'tool_use',
  'ask_user_questions': 'tool_use',
}

/**
 * 根据工具名获取 ActivityEventType
 */
export function mapToolToActivityType(
  toolName: string,
  providerId: string = 'claude-code',
): ActivityEventType {
  switch (providerId) {
    case 'claude-code':
      return CLAUDE_TOOL_MAP[toolName] || 'tool_use'
    case 'codex':
      return CODEX_ITEM_MAP[toolName] || 'tool_use'
    case 'gemini-cli':
      return GEMINI_ACTION_MAP[toolName] || 'tool_use'
    case 'iflow':
      return IFLOW_TOOL_MAP[toolName] || 'tool_use'
    case 'opencode':
      return OPENCODE_TOOL_MAP[toolName] || 'tool_use'
    default:
      return 'tool_use'
  }
}

/**
 * 从工具调用中提取 detail 文本
 */
export function extractToolDetail(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  switch (toolName) {
    // ---- Claude Code ----
    case 'Read':
      return `读取: ${toolInput.file_path || toolInput.path || '(unknown)'}`
    case 'Write':
      return `写入: ${toolInput.file_path || toolInput.path || '(unknown)'}`
    case 'Edit':
      return `编辑: ${toolInput.file_path || toolInput.path || '(unknown)'}`
    case 'Bash':
      return `执行: ${truncate(String(toolInput.command || ''), 100)}`
    case 'Glob':
      return `搜索文件: ${toolInput.pattern || ''}`
    case 'Grep':
      return `搜索内容: ${toolInput.pattern || ''}`
    case 'WebSearch':
      return `搜索: ${toolInput.query || ''}`
    case 'AskUserQuestion': {
      const questions = toolInput.questions as Array<{ question: string; header?: string }> | undefined
      if (Array.isArray(questions) && questions.length > 0) {
        const qTexts = questions.map(q => q.header || q.question).join(' / ')
        return `提问: ${truncate(qTexts, 100)}`
      }
      return 'AskUserQuestion: 向用户提问'
    }
    case 'ExitPlanMode': {
      const allowedPrompts = toolInput.allowedPrompts as Array<{ tool?: string; prompt?: string }> | undefined
      if (Array.isArray(allowedPrompts) && allowedPrompts.length > 0) {
        return `退出计划模式 (${allowedPrompts.length} 个操作待执行)`
      }
      const firstVal = Object.values(toolInput)[0]
      if (typeof firstVal === 'string' && firstVal.length > 0) {
        return `退出计划模式: ${truncate(firstVal, 60)}`
      }
      return '退出计划模式'
    }
    case 'Task':
      return `子任务: ${truncate(String(toolInput.description || toolInput.prompt || ''), 80)}`
    case 'LSP':
      return `LSP ${toolInput.operation || ''}: ${toolInput.filePath || ''}`

    // ---- iFlow CLI ----
    case 'read_file':
      return `读取: ${toolInput.path || toolInput.file_path || toolInput.title || '(unknown)'}`
    case 'image_read':
      return `读取图片: ${toolInput.path || toolInput.title || '(unknown)'}`
    case 'read_many_files':
      return `批量读取: ${toolInput.title || '(unknown)'}`
    case 'write_file':
      return `写入: ${toolInput.path || toolInput.file_path || toolInput.title || '(unknown)'}`
    case 'replace':
      return `编辑: ${toolInput.path || toolInput.file_path || toolInput.title || '(unknown)'}`
    case 'multi_edit':
      return `多文件编辑: ${toolInput.title || '(unknown)'}`
    case 'run_shell_command':
      return `执行: ${truncate(String(toolInput.command || toolInput.title || ''), 100)}`
    case 'search_file_content':
      return `搜索内容: ${toolInput.pattern || toolInput.query || toolInput.title || ''}`
    case 'glob':
      return `搜索文件: ${toolInput.pattern || toolInput.title || ''}`
    case 'list_directory':
      return `列目录: ${toolInput.path || toolInput.title || ''}`
    case 'web_search':
      return `搜索: ${toolInput.query || toolInput.title || ''}`
    case 'web_fetch':
      return `抓取: ${toolInput.url || toolInput.title || ''}`
    case 'task':
      return `子任务: ${truncate(String(toolInput.description || toolInput.title || ''), 80)}`

    // ---- OpenCode ----
    case 'read':
      return `读取文件: ${toolInput.filePath || toolInput.path || '(unknown)'}`
    case 'write':
    case 'edit':
    case 'patch':
      return `写入文件: ${toolInput.filePath || toolInput.path || '(unknown)'}`
    case 'bash':
      return `执行命令: ${String(toolInput.command || '').slice(0, 60)}`
    case 'grep':
      return `搜索: ${toolInput.pattern || ''}`
    case 'list':
      return `读取文件: ${toolInput.filePath || toolInput.path || '(unknown)'}`
    case 'webfetch':
      return `抓取: ${toolInput.url || toolInput.filePath || ''}`
    case 'websearch':
      return `搜索: ${toolInput.query || ''}`
    case 'lsp':
      return 'lsp'
    case 'todowrite':
      return 'todowrite'
    case 'todoread':
      return 'todoread'
    case 'question':
      return 'question'
    case 'skill':
      return 'skill'

    // ---- Codex CLI ----
    case 'shell':
    case 'localShellCall':
    case 'local_shell_call':
      return `执行: ${truncate(String(toolInput.command || ''), 100)}`
    case 'functionCall':
    case 'function_call': {
      const fnName = toolInput.name || toolInput.function_name || ''
      if (fnName) return `调用: ${fnName}`
      const firstValue = Object.values(toolInput)[0]
      return `调用: ${truncate(String(firstValue || ''), 80)}`
    }

    default: {
      if (toolInput.title) return `${toolName}: ${truncate(String(toolInput.title), 80)}`
      const firstValue = Object.values(toolInput)[0]
      return `${toolName}: ${truncate(String(firstValue || ''), 80)}`
    }
  }
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

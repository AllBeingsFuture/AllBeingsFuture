import React, { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ConversationMessage } from '../../types/conversationTypes'
import ToolUseCard, { type ToolOperationCardData } from './ToolUseCard'

interface ToolOperationGroupProps {
  messages: ConversationMessage[]
  isActive: boolean
}

const TOOL_ICONS: Record<string, string> = {
  Read: '📖', Write: '✍️', Edit: '📝', Bash: '💻', Glob: '📂', Grep: '🔎',
  read_file: '📖', write_file: '✍️', edit_file: '📝', bash: '💻', glob: '📂', grep: '🔎',
  shell: '💻', localShellCall: '💻', local_shell_call: '💻',
  functionCall: '🧩', function_call: '🧩',
  Agent: '🤖',
  ToolSearch: '🔍',
  TodoWrite: '📋',
}

const AGENT_TOOLS = new Set(['Agent'])

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function aggregateOperations(messages: ConversationMessage[]): ToolOperationCardData[] {
  const operations: ToolOperationCardData[] = []
  const operationsByUseId = new Map<string, ToolOperationCardData>()
  let pendingUnkeyedOperation: ToolOperationCardData | undefined

  for (const message of messages) {
    if (message.toolUseId) {
      let operation = operationsByUseId.get(message.toolUseId)
      if (!operation) {
        operation = { id: message.toolUseId, toolUseId: message.toolUseId }
        operationsByUseId.set(message.toolUseId, operation)
        operations.push(operation)
      }
      assignMessage(operation, message)
      pendingUnkeyedOperation = undefined
      continue
    }

    if (message.role === 'tool_use') {
      const operation: ToolOperationCardData = { id: message.id, toolUse: message }
      operations.push(operation)
      pendingUnkeyedOperation = operation
      continue
    }

    if (message.role === 'tool_result' && pendingUnkeyedOperation) {
      assignMessage(pendingUnkeyedOperation, message)
      if (!message.isDelta) pendingUnkeyedOperation = undefined
      continue
    }

    operations.push({
      id: message.id,
      liveResult: message.role === 'tool_result' && message.isDelta ? message : undefined,
      result: message.role === 'tool_result' && !message.isDelta ? message : undefined,
    })
  }

  return operations
}

function assignMessage(operation: ToolOperationCardData, message: ConversationMessage): void {
  if (message.role === 'tool_use') { operation.toolUse = message; return }
  if (message.isDelta) { operation.liveResult = message; return }
  operation.result = message
}

function getOperationName(operation: ToolOperationCardData): string {
  return operation.result?.toolName || operation.liveResult?.toolName || operation.toolUse?.toolName || 'Tool'
}

function getOperationSummary(operation: ToolOperationCardData): string {
  const message = operation.result || operation.liveResult || operation.toolUse
  if (!message) return ''

  const toolName = getOperationName(operation)
  const toolInput = {
    ...(operation.toolUse?.toolInput || {}),
    ...(operation.liveResult?.toolInput || {}),
    ...(operation.result?.toolInput || {}),
  }

  // Agent 工具专用摘要
  if (AGENT_TOOLS.has(toolName)) {
    const desc = getText(toolInput.description)
    return desc || 'Agent'
  }

  const command = getText(toolInput.command)
  const filePath = getText(toolInput.file_path) || getText(toolInput.path)
  const pattern = getText(toolInput.pattern)

  if (command) {
    const prefix = operation.liveResult && !operation.result
      ? '执行中'
      : operation.result?.isError ? '执行失败' : operation.result ? '执行完成' : '已发起'
    return `${prefix} · ${truncateInline(command, 96)}`
  }

  if (filePath) return filePath
  if (pattern) return `pattern: ${pattern}`
  if (message.toolResult) return firstMeaningfulLine(message.toolResult)
  if (message.content) return truncateInline(message.content, 96)
  return getOperationName(operation)
}

function firstMeaningfulLine(value: string): string {
  const line = value.split(/\r?\n/).find(item => item.trim().length > 0)
  return truncateInline(line || value, 96)
}

function truncateInline(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function getText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value.map(item => (typeof item === 'string' ? item.trim() : String(item ?? '')).trim()).filter(Boolean).join(' ')
  }
  return ''
}

const ToolOperationGroup: React.FC<ToolOperationGroupProps> = ({ messages, isActive }) => {
  const [expanded, setExpanded] = useState(false)

  const operations = useMemo(() => aggregateOperations(messages), [messages])
  const toolCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const operation of operations) {
      const name = getOperationName(operation)
      counts[name] = (counts[name] || 0) + 1
    }
    return counts
  }, [operations])

  const toolCount = operations.length
  const lastOperation = operations[operations.length - 1]
  const lastSummary = useMemo(() => getOperationSummary(lastOperation), [lastOperation])
  const hasError = operations.some(operation => operation.result?.isError)
  const hasLiveOutput = operations.some(operation => operation.liveResult && !operation.result)

  // 提取 Agent 操作列表（带 description）
  const agentOperations = useMemo(() => {
    return operations
      .filter(op => AGENT_TOOLS.has(getOperationName(op)))
      .map(op => {
        const input = {
          ...(op.toolUse?.toolInput || {}),
          ...(op.liveResult?.toolInput || {}),
          ...(op.result?.toolInput || {}),
        }
        const desc = getText(input.description)
        const subagentType = getText(input.subagent_type) || getText(input.subagentType)
        const bg = Boolean(input.run_in_background || input.runInBackground)
        const isDone = Boolean(op.result)
        const isRunning = Boolean(op.liveResult && !op.result) || Boolean(op.toolUse && !op.result)
        return { id: op.id, description: desc, subagentType, background: bg, isDone, isRunning, isError: op.result?.isError }
      })
  }, [operations])
  const hasAgents = agentOperations.length > 0

  const completedDuration = useMemo(() => {
    if (isActive || messages.length < 2) return null
    const start = new Date(messages[0].timestamp).getTime()
    const end = new Date(messages[messages.length - 1].timestamp).getTime()
    const ms = end - start
    if (ms < 100) return null
    return formatDuration(ms)
  }, [isActive, messages])

  const [activeDurationSecs, setActiveDurationSecs] = useState(0)
  useEffect(() => {
    if (!isActive || messages.length === 0) return
    const start = new Date(messages[0].timestamp).getTime()
    const update = () => setActiveDurationSecs(Math.floor((Date.now() - start) / 1000))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [isActive, messages])

  return (
    <div
      className={`my-2 mx-2 rounded-xl overflow-hidden border-l-[3px] transition-colors ${
        isActive
          ? 'border-purple-500 bg-purple-500/[0.04]'
          : hasError
            ? 'border-red-400/40 bg-red-400/[0.03]'
            : 'border-purple-500/20 bg-white/[0.02]'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-[10px] text-gray-500 flex-shrink-0">
          {expanded ? '▼' : '▶'}
        </span>

        {isActive && (
          <span className="inline-block w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        )}

        <span className="text-xs flex-shrink-0">🧰</span>

        <span className="text-xs font-medium text-gray-100 flex-shrink-0">
          {isActive
            ? <>正在执行<span className="text-gray-500 font-normal">（{toolCount} 个操作{activeDurationSecs > 0 && <> · {activeDurationSecs}s</>}）</span></>
            : <>执行了 {toolCount} 个操作{completedDuration && <span className="text-gray-500 font-normal"> · {completedDuration}</span>}</>
          }
        </span>

        <span className="flex items-center gap-1.5 flex-shrink-0">
          {Object.entries(toolCounts).map(([name, count]) => (
            <span
              key={name}
              className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded font-mono"
            >
              {TOOL_ICONS[name] || '🧰'}{name}({count})
            </span>
          ))}
        </span>

        {hasLiveOutput && (
          <span className="text-[10px] text-purple-400 font-bold flex-shrink-0">LIVE</span>
        )}

        {hasError && (
          <span className="text-[10px] text-red-400 font-bold flex-shrink-0">ERROR</span>
        )}
      </button>

      {/* Agent 操作：始终显示子 Agent 列表 */}
      {hasAgents && (
        <div className="px-3 pb-2 -mt-0.5 space-y-1">
          {agentOperations.map(agent => (
            <div
              key={agent.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                agent.isError
                  ? 'border-red-500/20 bg-red-500/[0.06]'
                  : agent.isDone
                    ? 'border-green-500/15 bg-green-500/[0.04]'
                    : agent.isRunning
                      ? 'border-indigo-500/20 bg-indigo-500/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02]'
              }`}
            >
              {agent.isRunning && !agent.isDone && (
                <span className="inline-block w-2.5 h-2.5 border border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              {agent.isDone && !agent.isError && (
                <span className="text-green-400 flex-shrink-0">✓</span>
              )}
              {agent.isError && (
                <span className="text-red-400 flex-shrink-0">✗</span>
              )}
              <span className="text-gray-200 truncate flex-1">
                {agent.description || 'Agent 任务'}
              </span>
              {agent.subagentType && (
                <span className="text-[10px] text-indigo-400/70 bg-indigo-500/10 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                  {agent.subagentType}
                </span>
              )}
              {agent.background && (
                <span className="text-[10px] text-gray-500 flex-shrink-0">后台</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 非 Agent 操作的最近摘要 */}
      {!expanded && !hasAgents && lastSummary && (
        <div className="px-3 pb-2 -mt-1">
          <span className="text-[11px] text-gray-500/70 font-mono truncate block">
            最近：{lastSummary}
          </span>
        </div>
      )}

      <AnimatePresence>
        {expanded && operations.length > 0 && (
          <motion.div
            className="border-t border-white/[0.06] overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {operations.map(operation => (
              <ToolUseCard key={operation.id} operation={operation} compact />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

ToolOperationGroup.displayName = 'ToolOperationGroup'
export default React.memo(ToolOperationGroup)

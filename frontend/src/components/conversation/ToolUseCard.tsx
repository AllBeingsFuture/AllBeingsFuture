import React, { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileJson,
  ClipboardList,
  ExternalLink,
  FolderOpen,
  Terminal,
} from 'lucide-react'
import type { ConversationMessage, ToolResultStream, ToolStreamOutput } from '../../types/conversationTypes'
import ContextMenu from '../common/ContextMenu'
import type { MenuItem } from '../common/ContextMenu'
import { useFileManagerStore } from '../../stores/fileManagerStore'

const TOOL_STYLES: Record<string, { icon: string; color: string; label: string }> = {
  Read: { icon: '📖', color: 'text-blue-400', label: 'Read' },
  Write: { icon: '✍️', color: 'text-green-400', label: 'Write' },
  Edit: { icon: '📝', color: 'text-yellow-400', label: 'Edit' },
  Bash: { icon: '💻', color: 'text-purple-400', label: 'Bash' },
  Glob: { icon: '📂', color: 'text-blue-400', label: 'Glob' },
  Grep: { icon: '🔎', color: 'text-blue-400', label: 'Grep' },
  read_file: { icon: '📖', color: 'text-blue-400', label: 'Read' },
  write_file: { icon: '✍️', color: 'text-green-400', label: 'Write' },
  edit_file: { icon: '📝', color: 'text-yellow-400', label: 'Edit' },
  bash: { icon: '💻', color: 'text-purple-400', label: 'Shell' },
  glob: { icon: '📂', color: 'text-blue-400', label: 'Glob' },
  grep: { icon: '🔎', color: 'text-blue-400', label: 'Grep' },
  shell: { icon: '💻', color: 'text-purple-400', label: 'Shell' },
  localShellCall: { icon: '💻', color: 'text-purple-400', label: 'Shell' },
  local_shell_call: { icon: '💻', color: 'text-purple-400', label: 'Shell' },
  functionCall: { icon: '🧩', color: 'text-yellow-400', label: 'Function' },
  function_call: { icon: '🧩', color: 'text-yellow-400', label: 'Function' },
  send_sticker: { icon: '😄', color: 'text-yellow-400', label: 'Sticker' },
  Agent: { icon: '🤖', color: 'text-indigo-400', label: 'Agent' },
  ToolSearch: { icon: '🔍', color: 'text-cyan-400', label: 'ToolSearch' },
  TodoWrite: { icon: '📋', color: 'text-emerald-400', label: 'TodoWrite' },
}

const DEFAULT_STYLE = { icon: '🧰', color: 'text-gray-400', label: 'Tool' }
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'Glob', 'Grep', 'read_file', 'write_file', 'edit_file', 'glob', 'grep'])

export interface ToolOperationCardData {
  id: string
  toolUseId?: string
  toolUse?: ConversationMessage
  liveResult?: ConversationMessage
  result?: ConversationMessage
}

interface ToolUseCardProps {
  message?: ConversationMessage
  operation?: ToolOperationCardData
  compact?: boolean
}

const ToolUseCard: React.FC<ToolUseCardProps> = ({ message, operation, compact = false }) => {
  const [expanded, setExpanded] = useState(() => Boolean(operation?.liveResult && !operation?.result))
  const [ctxMenu, setCtxMenu] = useState({ visible: false, x: 0, y: 0 })
  const openFileInTab = useFileManagerStore(s => s.openFileInTab)

  const resolvedOperation = useMemo(() => normalizeOperation(message, operation), [message, operation])
  const primaryMessage = resolvedOperation.result || resolvedOperation.liveResult || resolvedOperation.toolUse || message

  const effectiveToolName =
    resolvedOperation.result?.toolName ||
    resolvedOperation.liveResult?.toolName ||
    resolvedOperation.toolUse?.toolName ||
    primaryMessage?.toolName ||
    ''

  const effectiveToolInput = useMemo(
    () => mergeToolInputs(
      resolvedOperation.toolUse?.toolInput,
      resolvedOperation.liveResult?.toolInput,
      resolvedOperation.result?.toolInput,
      primaryMessage?.toolInput,
    ),
    [primaryMessage?.toolInput, resolvedOperation.liveResult?.toolInput, resolvedOperation.result?.toolInput, resolvedOperation.toolUse?.toolInput],
  )

  const effectiveToolResult =
    resolvedOperation.result?.toolResult ||
    resolvedOperation.liveResult?.toolResult ||
    primaryMessage?.toolResult ||
    ''

  const effectiveOutputs =
    resolvedOperation.liveResult?.toolOutputs ||
    resolvedOperation.result?.toolOutputs ||
    primaryMessage?.toolOutputs ||
    []

  const isStreamingResult = Boolean(resolvedOperation.liveResult && !resolvedOperation.result)
  const isPending = Boolean(resolvedOperation.toolUse && !resolvedOperation.liveResult && !resolvedOperation.result)
  const isResult = Boolean(resolvedOperation.result) || primaryMessage?.role === 'tool_result'
  const isError = resolvedOperation.result?.isError ?? primaryMessage?.isError
  const style = TOOL_STYLES[effectiveToolName] || DEFAULT_STYLE
  const filePath = FILE_TOOLS.has(effectiveToolName)
    ? getDisplayText(effectiveToolInput.file_path) || getDisplayText(effectiveToolInput.path)
    : undefined
  const command = getCommandText(effectiveToolInput.command)
  const cwd = getDisplayText(effectiveToolInput.cwd)
  const shell = getDisplayText(effectiveToolInput.shell)
  const summary = useMemo(
    () => buildSummary({
      toolName: effectiveToolName,
      toolInput: effectiveToolInput,
      toolResult: effectiveToolResult,
      content: primaryMessage?.content,
      isStreamingResult,
      isPending,
      isError,
    }),
    [effectiveToolInput, effectiveToolName, effectiveToolResult, isError, isPending, isStreamingResult, primaryMessage?.content],
  )
  const displayResult = useMemo(
    () => truncateResult(effectiveToolResult, isStreamingResult ? 16000 : 12000),
    [effectiveToolResult, isStreamingResult],
  )
  const streamSections = useMemo(() => groupOutputsByStream(effectiveOutputs), [effectiveOutputs])
  const latestStream = effectiveOutputs[effectiveOutputs.length - 1]?.stream
  const hasCommandContext = Boolean(command || cwd || shell)
  const hasLiveOutput = isStreamingResult && (streamSections.stdout || streamSections.stderr || displayResult)
  const hasFinalResult = Boolean(!isStreamingResult && isResult && displayResult)
  const inputPreview = useMemo(() => formatToolInput(effectiveToolInput), [effectiveToolInput])

  useEffect(() => {
    if (isStreamingResult) {
      setExpanded(true)
    }
  }, [isStreamingResult])

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [
      {
        key: 'toggle',
        label: expanded ? '收起详情' : '展开详情',
        icon: expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />,
        onClick: () => setExpanded(v => !v),
      },
      { key: 'div1', type: 'divider' },
      {
        key: 'copy-name',
        label: '复制工具名',
        icon: <Copy size={14} />,
        onClick: () => navigator.clipboard.writeText(effectiveToolName || ''),
      },
      {
        key: 'copy-input',
        label: '复制输入参数',
        icon: <FileJson size={14} />,
        disabled: Object.keys(effectiveToolInput).length === 0,
        onClick: () => navigator.clipboard.writeText(JSON.stringify(effectiveToolInput, null, 2)),
      },
      {
        key: 'copy-result',
        label: '复制执行结果',
        icon: <ClipboardList size={14} />,
        disabled: !effectiveToolResult,
        onClick: () => navigator.clipboard.writeText(effectiveToolResult || ''),
      },
    ]

    if (filePath) {
      items.push({ key: 'div2', type: 'divider' })
      items.push({
        key: 'open-file',
        label: '在编辑器中打开文件',
        icon: <ExternalLink size={14} />,
        onClick: () => openFileInTab(filePath),
      })
      items.push({
        key: 'copy-path',
        label: '复制文件路径',
        icon: <FolderOpen size={14} />,
        onClick: () => navigator.clipboard.writeText(filePath),
      })
    }

    if (command) {
      items.push({ key: 'div3', type: 'divider' })
      items.push({
        key: 'copy-cmd',
        label: '复制命令',
        icon: <Terminal size={14} />,
        onClick: () => navigator.clipboard.writeText(command),
      })
    }

    return items
  }, [command, effectiveToolInput, effectiveToolName, effectiveToolResult, expanded, filePath, openFileInTab])

  if (!primaryMessage) {
    return null
  }

  return (
    <div className={compact ? 'my-0.5 mx-1' : 'my-1 mx-2'}>
      <button
        onClick={() => setExpanded(!expanded)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setCtxMenu({ visible: true, x: e.clientX, y: e.clientY })
        }}
        className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${getHeaderClass({ isStreamingResult, isPending, isResult, isError })}`}
      >
        <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
        <span>{style.icon}</span>
        <span className={`font-semibold ${style.color}`}>
          {effectiveToolName || style.label}
        </span>
        <span className="text-gray-400 truncate flex-1">
          {summary}
        </span>
        {latestStream && isStreamingResult && (
          <span className={`text-[10px] font-bold ${latestStream === 'stderr' ? 'text-red-400' : 'text-purple-400'}`}>
            {latestStream.toUpperCase()}
          </span>
        )}
        {isStreamingResult && (
          <span className="text-[10px] font-bold text-purple-400">LIVE</span>
        )}
        {isPending && !isStreamingResult && (
          <span className="text-[10px] font-bold text-gray-500">RUN</span>
        )}
        {isResult && isError && (
          <span className="text-[10px] font-bold text-red-400">ERROR</span>
        )}
      </button>

      {expanded && (
        <div className="mt-1 mx-1 p-2 rounded bg-gray-900/60 text-xs font-mono border border-white/10 overflow-auto max-h-[420px]">
          {hasCommandContext && (
            <div className="mb-3">
              <div className="text-gray-500 mb-1">命令上下文</div>
              <div className="space-y-1 text-gray-300 whitespace-pre-wrap break-all">
                {command && <div>{`Command: ${command}`}</div>}
                {cwd && <div>{`Cwd: ${cwd}`}</div>}
                {shell && <div>{`Shell: ${shell}`}</div>}
              </div>
            </div>
          )}

          {!hasCommandContext && Object.keys(effectiveToolInput).length > 0 && (
            <div className="mb-3">
              <div className="text-gray-500 mb-1">输入参数</div>
              <pre className="text-gray-300 whitespace-pre-wrap break-all">
                {inputPreview}
              </pre>
            </div>
          )}

          {hasLiveOutput && (
            <div className="mb-3">
              <div className="text-gray-500 mb-1">实时输出</div>
              <div className="space-y-2">
                {streamSections.stdout && (
                  <OutputBlock stream="stdout" value={streamSections.stdout} />
                )}
                {streamSections.stderr && (
                  <OutputBlock stream="stderr" value={streamSections.stderr} />
                )}
                {!streamSections.stdout && !streamSections.stderr && displayResult && (
                  <pre className="whitespace-pre-wrap break-all text-gray-300">
                    {displayResult}
                  </pre>
                )}
              </div>
            </div>
          )}

          {hasFinalResult && (
            <div>
              <div className="text-gray-500 mb-1">最终结果</div>
              <pre className={`whitespace-pre-wrap break-all ${isError ? 'text-red-400' : 'text-gray-300'}`}>
                {displayResult}
              </pre>
            </div>
          )}

          {isPending && !hasLiveOutput && !hasFinalResult && (
            <div className="text-gray-500">工具已发起，等待执行输出…</div>
          )}
        </div>
      )}

      <ContextMenu
        visible={ctxMenu.visible}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={menuItems}
        onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
      />
    </div>
  )
}

interface OutputBlockProps {
  stream: ToolResultStream
  value: string
}

const OutputBlock: React.FC<OutputBlockProps> = ({ stream, value }) => {
  const isStdErr = stream === 'stderr'

  return (
    <div className={`rounded border px-2 py-1.5 ${isStdErr ? 'border-red-400/30 bg-red-400/5' : 'border-white/10 bg-gray-800/40'}`}>
      <div className={`mb-1 text-[10px] uppercase tracking-wide ${isStdErr ? 'text-red-400' : 'text-gray-500'}`}>
        {stream}
      </div>
      <pre className={`whitespace-pre-wrap break-all ${isStdErr ? 'text-red-400' : 'text-gray-300'}`}>
        {truncateResult(value, 12000)}
      </pre>
    </div>
  )
}

function normalizeOperation(
  message?: ConversationMessage,
  operation?: ToolOperationCardData,
): ToolOperationCardData {
  if (operation) return operation
  if (!message) return { id: 'empty' }

  if (message.role === 'tool_use') {
    return { id: message.id, toolUseId: message.toolUseId, toolUse: message }
  }

  if (message.role === 'tool_result') {
    return {
      id: message.id,
      toolUseId: message.toolUseId,
      liveResult: message.isDelta ? message : undefined,
      result: message.isDelta ? undefined : message,
    }
  }

  return { id: message.id }
}

function mergeToolInputs(...inputs: Array<Record<string, unknown> | undefined>): Record<string, unknown> {
  return inputs.reduce<Record<string, unknown>>((merged, current) => {
    if (!current) return merged
    return { ...merged, ...current }
  }, {})
}

function buildSummary({
  toolName,
  toolInput,
  toolResult,
  content,
  isStreamingResult,
  isPending,
  isError,
}: {
  toolName?: string
  toolInput: Record<string, unknown>
  toolResult?: string
  content?: string
  isStreamingResult: boolean
  isPending: boolean
  isError?: boolean
}): string {
  // Agent 专用摘要
  if (toolName === 'Agent') {
    const desc = getDisplayText(toolInput.description)
    const subType = getDisplayText(toolInput.subagent_type) || getDisplayText(toolInput.subagentType)
    const parts: string[] = []
    if (desc) parts.push(desc)
    if (subType) parts.push(`[${subType}]`)
    if (toolInput.run_in_background || toolInput.runInBackground) parts.push('(后台)')
    if (parts.length > 0) return parts.join(' ')
    return 'Agent 任务'
  }

  const command = getCommandText(toolInput.command)
  const filePath = getDisplayText(toolInput.file_path) || getDisplayText(toolInput.path)
  const pattern = getDisplayText(toolInput.pattern)

  if (command) {
    const commandText = truncateInline(command.trim(), 120)
    if (isStreamingResult) return `执行中 · ${commandText}`
    if (isPending) return `已发起 · ${commandText}`
    if (isError) return `执行失败 · ${commandText}`
    return `执行完成 · ${commandText}`
  }

  if (filePath) return filePath.trim()
  if (pattern) return `pattern: ${pattern.trim()}`

  if (typeof toolResult === 'string' && toolResult.trim().length > 0) {
    return firstMeaningfulLine(toolResult)
  }

  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim()
  }

  return toolName || ''
}

function truncateResult(result: string | undefined, maxLength: number): string {
  if (!result) return ''
  if (result.length <= maxLength) return result
  return `${result.slice(0, maxLength)}\n... (truncated)`
}

function truncateInline(result: string, maxLength: number): string {
  if (result.length <= maxLength) return result
  return `${result.slice(0, maxLength)}...`
}

function firstMeaningfulLine(value: string): string {
  const line = value.split(/\r?\n/).find(item => item.trim().length > 0)
  return truncateInline(line || value, 120)
}

function getHeaderClass({
  isStreamingResult,
  isPending,
  isResult,
  isError,
}: {
  isStreamingResult: boolean
  isPending: boolean
  isResult: boolean
  isError?: boolean
}): string {
  if (isStreamingResult) return 'bg-purple-500/10 text-gray-100 border border-purple-500/30'
  if (isPending) return 'bg-gray-800/60 text-gray-100 hover:bg-gray-700/60 border border-white/10'
  if (isResult) {
    return isError
      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
      : 'bg-gray-900/40 text-gray-400 border border-white/10'
  }
  return 'bg-gray-800/60 text-gray-100 hover:bg-gray-700/60 border border-white/10'
}

function formatToolInput(input: Record<string, unknown>): string {
  const formattedCommand = getCommandText(input.command)
  if (formattedCommand) return formattedCommand
  if (input.file_path) return String(input.file_path)
  if (input.pattern) return `pattern: ${input.pattern}`
  return JSON.stringify(input, null, 2)
}

function getDisplayText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return undefined
}

function getCommandText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (Array.isArray(value)) {
    const parts = value
      .map(item => (typeof item === 'string' ? item.trim() : String(item ?? '')).trim())
      .filter(Boolean)
    if (parts.length > 0) return parts.join(' ')
  }

  return undefined
}

function groupOutputsByStream(outputs: ToolStreamOutput[]): Record<ToolResultStream, string> {
  return outputs.reduce<Record<ToolResultStream, string>>(
    (grouped, output) => {
      grouped[output.stream] = `${grouped[output.stream] || ''}${output.text}`
      return grouped
    },
    { stdout: '', stderr: '' },
  )
}

ToolUseCard.displayName = 'ToolUseCard'
export default React.memo(ToolUseCard)

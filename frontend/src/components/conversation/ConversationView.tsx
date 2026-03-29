import React, { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, ChevronDown, ChevronRight, Sparkles, Users } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { Session } from '../../../bindings/allbeingsfuture/internal/models/models'
import type { ChatMessage } from '../../../bindings/allbeingsfuture/internal/models/models'
import { useSessionStore, type ChatUpdateEvent, type ChatPatchEvent, type AgentUpdateEvent } from '../../stores/sessionStore'
import { useIpcEvent } from '../../hooks/useIpcEvent'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import SessionToolbar from './SessionToolbar'
import ToolOperationGroup from './ToolOperationGroup'
import FileChangeCard from './FileChangeCard'
import StickerCard from './StickerCard'
import ShellTerminalView from '../terminal/ShellTerminalView'
import { usePanelStore } from '../../stores/panelStore'
import type { ConversationMessage, FileChangeInfo } from '../../types/conversationTypes'
import { useVirtualizedList } from './useVirtualizedList'
import { resolveProviderDisplayInfo } from '../../utils/providerDisplay'

interface Props {
  session: Session
}

/** Convert backend ChatMessage to ConversationMessage for tool components */
function toConversationMessage(msg: ChatMessage, index: number, sessionId: string): ConversationMessage {
  return {
    id: `${sessionId}-${index}`,
    sessionId,
    role: (msg.role as ConversationMessage['role']) || 'assistant',
    content: msg.content || '',
    timestamp: (msg as any).timestamp || new Date().toISOString(),
    toolName: (msg as any).toolName,
    toolInput: (msg as any).toolInput as Record<string, unknown> | undefined,
    isThinking: (msg as any).isThinking,
    thinkingText: (msg as any).isThinking ? msg.content : undefined,
    usage: (msg as any).usage,
  }
}

interface MessageGroup {
  type: 'message' | 'tool_group' | 'thinking' | 'child_agent'
  messages: ChatMessage[]
  convMessages?: ConversationMessage[]
  index: number
  /** For child_agent groups: the child session ID */
  childSessionId?: string
  /** For child_agent groups: the display name */
  childAgentName?: string
}

const VIRTUALIZATION_GROUP_THRESHOLD = 30
const VIRTUALIZATION_HEIGHT_MULTIPLIER = 3
const VIRTUALIZATION_OVERSCAN_PX = 600
const DEFAULT_COMPOSER_HEIGHT = 96
const COMPOSER_BOTTOM_GAP = 12

function groupMessages(messages: ChatMessage[], sessionId: string): MessageGroup[] {
  const groups: MessageGroup[] = []
  let currentToolGroup: ChatMessage[] | null = null
  let currentToolConvMsgs: ConversationMessage[] | null = null
  let toolGroupStartIndex = 0
  let currentChildGroup: ChatMessage[] | null = null
  let currentChildId: string | null = null
  let currentChildName: string | null = null
  let childGroupStartIndex = 0

  /** Flush any accumulated tool group into the groups array */
  const flushToolGroup = () => {
    if (currentToolGroup) {
      groups.push({
        type: 'tool_group',
        messages: currentToolGroup,
        convMessages: currentToolConvMsgs!,
        index: toolGroupStartIndex,
      })
      currentToolGroup = null
      currentToolConvMsgs = null
    }
  }

  /** Flush any accumulated child agent group */
  const flushChildGroup = () => {
    if (currentChildGroup) {
      groups.push({
        type: 'child_agent',
        messages: currentChildGroup,
        index: childGroupStartIndex,
        childSessionId: currentChildId!,
        childAgentName: currentChildName || undefined,
      })
      currentChildGroup = null
      currentChildId = null
      currentChildName = null
    }
  }

  /** Push a tool_use message into the current tool group (or start a new one) */
  const pushToolMsg = (msg: ChatMessage, index: number) => {
    if (!currentToolGroup) {
      currentToolGroup = []
      currentToolConvMsgs = []
      toolGroupStartIndex = index
    }
    currentToolGroup.push(msg)
    currentToolConvMsgs!.push(toConversationMessage(msg, index, sessionId))
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const msgAny = msg as any
    const childSid = msgAny.childSessionId as string | undefined

    // If this message belongs to a child agent, fold it into a child_agent group
    if (childSid) {
      flushToolGroup()
      if (currentChildId === childSid) {
        currentChildGroup!.push(msg)
      } else {
        flushChildGroup()
        currentChildGroup = [msg]
        currentChildId = childSid
        currentChildName = msgAny.childAgentName || null
        childGroupStartIndex = i
      }
      continue
    }

    // Not a child message — flush any open child group
    flushChildGroup()

    // New format: explicit tool_use role messages
    if (msg.role === 'tool_use') {
      pushToolMsg(msg, i)
      continue
    }

    // Old format: assistant message with toolUse array — flatten into virtual tool_use messages
    if (msg.role === 'assistant' && msgAny.toolUse && msgAny.toolUse.length > 0) {
      for (let t = 0; t < msgAny.toolUse.length; t++) {
        const tool = msgAny.toolUse[t]
        const virtualMsg = {
          role: 'tool_use',
          content: '',
          timestamp: msgAny.timestamp || new Date().toISOString(),
          toolName: tool.name || 'unknown',
          toolInput: tool.input || {},
        } as unknown as ChatMessage
        pushToolMsg(virtualMsg, i)
      }
      // If the assistant message also has text content, emit it as a separate message
      if (msg.content?.trim()) {
        flushToolGroup()
        groups.push({ type: 'message', messages: [msg], index: i })
      }
      continue
    }

    flushToolGroup()

    if (msg.role === 'thinking' || (msg as any).isThinking) {
      // Merge consecutive thinking messages into a single group
      const prev = groups[groups.length - 1]
      if (prev?.type === 'thinking') {
        prev.messages.push(msg)
      } else {
        groups.push({ type: 'thinking', messages: [msg], index: i })
      }
    } else {
      groups.push({ type: 'message', messages: [msg], index: i })
    }
  }

  flushToolGroup()
  flushChildGroup()
  return groups
}

function getGroupKey(group: MessageGroup): string {
  if (group.type === 'child_agent') {
    return `${group.type}-${group.childSessionId || 'unknown'}-${group.index}`
  }
  return `${group.type}-${group.index}`
}

function estimateMessageGroupHeight(group: MessageGroup): number {
  const totalContentLength = group.messages.reduce((sum, message) => sum + (message.content?.length || 0), 0)
  const newlineCount = group.messages.reduce((sum, message) => sum + ((message.content?.match(/\n/g) || []).length), 0)

  if (group.type === 'thinking') {
    return Math.min(320, 72 + Math.ceil(totalContentLength / 7) * 10 + newlineCount * 8)
  }

  if (group.type === 'tool_group') {
    return 48 + group.messages.length * 68
  }

  if (group.type === 'child_agent') {
    return 72 + Math.min(120, group.messages.length * 18)
  }

  return Math.min(420, 68 + Math.ceil(totalContentLength / 9) * 16 + newlineCount * 10)
}

/** Detect file-editing tool names (MCP allbeingsfuture tools + native Edit/Write) */
function normalizeToolName(toolName: string): string {
  const parts = toolName.split('__').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : toolName
}

function detectFileChangeType(toolName: string): FileChangeInfo['changeType'] | null {
  const normalized = normalizeToolName(toolName)
  if (normalized === 'apply_patch') return 'edit'
  if (normalized.includes('edit_file') || normalized === 'Edit') return 'edit'
  if (normalized.includes('create_file')) return 'create'
  if (normalized.includes('write_file') || normalized === 'Write') return 'write'
  if (normalized.includes('delete_file')) return 'delete'
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  }
  return ''
}

function countDiffStats(diffText: string): Pick<FileChangeInfo, 'additions' | 'deletions'> {
  let additions = 0
  let deletions = 0

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('***')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }

  return { additions, deletions }
}

function inferChangeType(rawType: string): FileChangeInfo['changeType'] | null {
  const normalized = rawType.toLowerCase()
  if (!normalized) return null
  if (/(create|add|new)/.test(normalized)) return 'create'
  if (/(delete|remove)/.test(normalized)) return 'delete'
  if (/(write|overwrite)/.test(normalized)) return 'write'
  if (/(edit|update|modify|patch|rename|move)/.test(normalized)) return 'edit'
  return null
}

function buildDiffFromBody(
  filePath: string,
  changeType: FileChangeInfo['changeType'],
  bodyText: string,
  originalPath?: string,
): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedOriginalPath = (originalPath || filePath).replace(/\\/g, '/')
  const body = bodyText.trim()

  if (body.startsWith('diff ') || body.startsWith('--- ')) {
    return body
  }

  if (changeType === 'create') {
    const additions = body.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).length
    return body
      ? `--- /dev/null\n+++ b/${normalizedPath}\n@@ -0,0 +1,${Math.max(additions, 1)} @@\n${body}`
      : `--- /dev/null\n+++ b/${normalizedPath}`
  }

  if (changeType === 'delete') {
    return body
      ? `--- a/${normalizedOriginalPath}\n+++ /dev/null\n${body}`
      : `--- a/${normalizedOriginalPath}\n+++ /dev/null`
  }

  return body
    ? `--- a/${normalizedOriginalPath}\n+++ b/${normalizedPath}\n${body}`
    : `--- a/${normalizedOriginalPath}\n+++ b/${normalizedPath}`
}

function buildDiffFromContents(
  filePath: string,
  changeType: FileChangeInfo['changeType'],
  nextContent: string,
  previousContent = '',
): string {
  const normalizedPath = filePath.replace(/\\/g, '/')

  if (changeType === 'create' || changeType === 'write') {
    const nextLines = nextContent ? nextContent.split('\n').map(line => `+${line}`).join('\n') : ''
    const additions = nextContent ? nextContent.split('\n').length : 0
    return nextLines
      ? `--- /dev/null\n+++ b/${normalizedPath}\n@@ -0,0 +1,${Math.max(additions, 1)} @@\n${nextLines}`
      : `--- /dev/null\n+++ b/${normalizedPath}`
  }

  if (changeType === 'delete') {
    return `--- a/${normalizedPath}\n+++ /dev/null`
  }

  const previousLines = previousContent ? previousContent.split('\n').map(line => `-${line}`).join('\n') : ''
  const nextLines = nextContent ? nextContent.split('\n').map(line => `+${line}`).join('\n') : ''
  const deletions = previousContent ? previousContent.split('\n').length : 0
  const additions = nextContent ? nextContent.split('\n').length : 0
  const diffBody = [previousLines, nextLines].filter(Boolean).join('\n')

  return diffBody
    ? `--- a/${normalizedPath}\n+++ b/${normalizedPath}\n@@ -1,${Math.max(deletions, 1)} +1,${Math.max(additions, 1)} @@\n${diffBody}`
    : `--- a/${normalizedPath}\n+++ b/${normalizedPath}`
}

function parseApplyPatchText(patchText: string): FileChangeInfo[] {
  const results: FileChangeInfo[] = []
  const lines = patchText.split(/\r?\n/)
  let current: {
    filePath: string
    originalPath: string
    changeType: FileChangeInfo['changeType']
    bodyLines: string[]
  } | null = null

  const flushCurrent = () => {
    if (!current) return
    const operationDiff = buildDiffFromBody(
      current.filePath,
      current.changeType,
      current.bodyLines.join('\n'),
      current.originalPath,
    )
    const { additions, deletions } = countDiffStats(operationDiff)
    results.push({
      filePath: current.filePath,
      changeType: current.changeType,
      operationDiff,
      additions,
      deletions,
    })
    current = null
  }

  for (const line of lines) {
    if (!line || line === '*** Begin Patch' || line === '*** End Patch') continue

    const fileMatch = line.match(/^\*\*\* (Update|Add|Delete) File: (.+)$/)
    if (fileMatch) {
      flushCurrent()
      const filePath = fileMatch[2].trim()
      current = {
        filePath,
        originalPath: filePath,
        changeType: fileMatch[1] === 'Add' ? 'create' : fileMatch[1] === 'Delete' ? 'delete' : 'edit',
        bodyLines: [],
      }
      continue
    }

    if (!current) continue

    if (line.startsWith('*** Move to: ')) {
      current.filePath = line.slice('*** Move to: '.length).trim()
      continue
    }

    current.bodyLines.push(line)
  }

  flushCurrent()
  return results
}

function parseApplyPatchChanges(changes: unknown): FileChangeInfo[] {
  if (!changes) return []

  if (typeof changes === 'string') {
    return parseApplyPatchText(changes)
  }

  if (Array.isArray(changes)) {
    return changes.flatMap(change => parseApplyPatchChanges(change))
  }

  if (!isRecord(changes)) {
    return []
  }

  if (Array.isArray(changes.operations) || isRecord(changes.operations)) {
    const nested = parseApplyPatchChanges(changes.operations)
    if (nested.length > 0) return nested
  }

  if (Array.isArray(changes.operation) || isRecord(changes.operation)) {
    const nested = parseApplyPatchChanges(changes.operation)
    if (nested.length > 0) return nested
  }

  if (typeof changes.changes === 'string' || Array.isArray(changes.changes) || isRecord(changes.changes)) {
    const nested = parseApplyPatchChanges(changes.changes)
    if (nested.length > 0) return nested
  }

  const diffText = pickFirstText(changes.diff, changes.patch, changes.operationDiff, changes.text)
  if (diffText.includes('*** Begin Patch')) {
    return parseApplyPatchText(diffText)
  }

  const filePath = pickFirstText(
    changes.path,
    changes.filePath,
    changes.filename,
    changes.file,
    changes.newPath,
    changes.afterPath,
    changes.targetPath,
    changes.to,
  )
  if (!filePath) return []

  const originalPath = pickFirstText(
    changes.oldPath,
    changes.beforePath,
    changes.sourcePath,
    changes.from,
  ) || filePath
  const explicitType = inferChangeType(
    pickFirstText(changes.changeType, changes.type, changes.status, changes.kind, changes.action, changes.operation),
  )
  const changeType = explicitType || (diffText ? 'edit' : null) || 'edit'
  const nextContent = pickFirstText(changes.content, changes.newContent, changes.after)
  const previousContent = pickFirstText(changes.oldContent, changes.previousContent, changes.before)
  const operationDiff = diffText
    ? buildDiffFromBody(filePath, changeType, diffText, originalPath)
    : buildDiffFromContents(filePath, changeType, nextContent, previousContent)
  const { additions, deletions } = countDiffStats(operationDiff)

  return [{
    filePath,
    changeType,
    operationDiff,
    additions,
    deletions,
  }]
}

/** Extract FileChangeInfo from tool_use messages that modify files */
export function extractFileChanges(convMessages: ConversationMessage[]): ConversationMessage[] {
  const results: ConversationMessage[] = []
  for (const msg of convMessages) {
    if (msg.role !== 'tool_use' || !msg.toolName) continue
    const input = msg.toolInput || {}
    const normalizedToolName = normalizeToolName(msg.toolName)

    if (normalizedToolName === 'apply_patch') {
      const patchChanges = parseApplyPatchChanges(input.changes ?? input.operation ?? input.operations ?? input)
      for (const fileChange of patchChanges) {
        results.push({
          ...msg,
          fileChange,
        })
      }
      continue
    }

    const changeType = detectFileChangeType(msg.toolName)
    if (!changeType) continue

    const filePath = (input.file_path as string)
      || (input.path as string)
      || (input.filePath as string)
      || (input.targetPath as string)
      || (input.newPath as string)
      || ''
    if (!filePath) continue

    let additions = 0
    let deletions = 0
    let operationDiff = ''

    if (changeType === 'edit') {
      const oldStr = (input.old_string as string) || ''
      const newStr = (input.new_string as string) || ''
      deletions = oldStr ? oldStr.split('\n').length : 0
      additions = newStr ? newStr.split('\n').length : 0
      const oldLines = oldStr.split('\n').map((line) => `-${line}`).join('\n')
      const newLines = newStr.split('\n').map((line) => `+${line}`).join('\n')
      operationDiff = `--- a/${filePath.split(/[/\\]/).pop()}\n+++ b/${filePath.split(/[/\\]/).pop()}\n@@ -1,${deletions} +1,${additions} @@\n${oldLines}\n${newLines}`
    } else if (changeType === 'create' || changeType === 'write') {
      const content = (input.content as string) || ''
      additions = content ? content.split('\n').length : 0
      if (content) {
        const newLines = content.split('\n').map(l => `+${l}`).join('\n')
        const fileName = filePath.split(/[/\\]/).pop()
        operationDiff = `--- /dev/null\n+++ b/${fileName}\n@@ -0,0 +1,${additions} @@\n${newLines}`
      }
    }

    results.push({
      ...msg,
      fileChange: { filePath, changeType, operationDiff, additions, deletions },
    })
  }
  return results
}

const TOOL_ICONS: Record<string, string> = {
  Read: '📖', Write: '✍️', Edit: '📝', Bash: '💻', Glob: '📂', Grep: '🔎',
  apply_patch: '🩹',
  Agent: '🤖', WebSearch: '🌐', WebFetch: '🌐', ToolSearch: '🔍',
}

/** Collapsible thinking block — defaults to expanded */
const ThinkingBlock = memo(function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="my-1 mx-2 rounded-xl border border-dashed border-purple-500/20 bg-purple-500/[0.03] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-purple-400/60 hover:text-purple-300 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Sparkles size={11} />
        <span>思考过程</span>
        {content && <span className="text-gray-600">({content.length} 字符)</span>}
      </button>
      <AnimatePresence>
        {expanded && content && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="border-t border-purple-500/10 px-3 py-2 max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono text-xs text-text-muted/60"
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

/** Collapsible block for child agent activity — defaults to collapsed */
const ChildAgentBlock = memo(function ChildAgentBlock({ name, messages, childSessionId, isActive }: {
  name?: string
  messages: ChatMessage[]
  childSessionId: string
  isActive: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const selectSession = useSessionStore((state) => state.select)

  // Count operations by type
  const toolCount = messages.filter(m => m.role === 'tool_use').length
  const thinkingCount = messages.filter(m => m.role === 'thinking' || (m as any).isThinking).length
  const textMsgs = messages.filter(m => m.role === 'assistant' && m.content?.trim())

  const displayName = name || '子Agent'
  const summary = [
    toolCount > 0 ? `${toolCount} 个操作` : null,
    thinkingCount > 0 ? `${thinkingCount} 次思考` : null,
  ].filter(Boolean).join('，')

  // Get the last meaningful text output from the child
  const lastText = textMsgs.length > 0 ? textMsgs[textMsgs.length - 1].content : ''
  const previewText = lastText.length > 120 ? lastText.slice(0, 120) + '...' : lastText

  return (
    <div className="my-1 mx-2 rounded-xl border border-dashed border-blue-500/20 bg-blue-500/[0.03] overflow-hidden">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 items-center gap-1.5 px-3 py-2 text-xs text-blue-400/70 hover:text-blue-300 transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Users size={11} />
          <span className="font-medium">{displayName}</span>
          {summary && <span className="text-gray-600">({summary})</span>}
          {isActive && (
            <span className="flex gap-0.5 ml-1">
              <span className="h-1 w-1 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: '0ms' }} />
              <span className="h-1 w-1 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: '150ms' }} />
              <span className="h-1 w-1 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </button>
        <button
          onClick={() => selectSession(childSessionId)}
          className="px-3 py-2 text-[10px] text-blue-400/50 hover:text-blue-300 transition-colors"
          title="查看子Agent完整会话"
        >
          查看详情 →
        </button>
      </div>
      {!expanded && previewText && (
        <div className="border-t border-blue-500/10 px-3 py-1.5 text-[11px] text-text-muted/50 truncate">
          {previewText}
        </div>
      )}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="border-t border-blue-500/10 px-3 py-2 max-h-[300px] overflow-y-auto space-y-1"
          >
            {messages.map((msg, idx) => {
              if (msg.role === 'thinking' || (msg as any).isThinking) {
                return (
                  <div key={idx} className="text-[10px] text-purple-400/40 font-mono truncate">
                    💭 {msg.content.slice(0, 200)}
                  </div>
                )
              }
              if (msg.role === 'tool_use') {
                const icon = TOOL_ICONS[(msg as any).toolName] || '🧰'
                return (
                  <div key={idx} className="text-[10px] text-gray-500 font-mono truncate">
                    {icon} {(msg as any).toolName}
                    {(msg as any).toolInput?.command && ` → ${(msg as any).toolInput.command.slice(0, 80)}`}
                    {(msg as any).toolInput?.file_path && ` → ${(msg as any).toolInput.file_path}`}
                    {(msg as any).toolInput?.pattern && ` → ${(msg as any).toolInput.pattern}`}
                  </div>
                )
              }
              if (msg.role === 'assistant' && msg.content?.trim()) {
                return (
                  <div key={idx} className="text-[11px] text-gray-400 whitespace-pre-wrap line-clamp-3">
                    {msg.content}
                  </div>
                )
              }
              return null
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}, (prev, next) => (
  prev.name === next.name
  && prev.messages === next.messages
  && prev.childSessionId === next.childSessionId
  && prev.isActive === next.isActive
))

/** Streaming indicator that shows tool operations when available */
function StreamingIndicator({ messages, providerId }: { messages: ChatMessage[]; providerId?: string }) {
  const lastMsg = messages[messages.length - 1]
  const toolUse = lastMsg?.role === 'assistant' ? (lastMsg as any).toolUse as Array<{ name: string; input?: any }> | undefined : undefined
  const thinking = lastMsg?.role === 'assistant' ? (lastMsg as any).thinking as string | undefined : undefined
  const latestTool = toolUse?.[toolUse.length - 1]
  const providerLabel = resolveProviderDisplayInfo(providerId).label

  let statusText = '正在思考...'
  let statusDetail = ''

  if (latestTool) {
    const icon = TOOL_ICONS[latestTool.name] || '🧰'
    statusText = `${icon} ${latestTool.name}`
    if (latestTool.input?.command) {
      statusDetail = latestTool.input.command.length > 60
        ? latestTool.input.command.slice(0, 60) + '...'
        : latestTool.input.command
    } else if (latestTool.input?.file_path || latestTool.input?.path) {
      statusDetail = latestTool.input.file_path || latestTool.input.path
    } else if (latestTool.input?.pattern) {
      statusDetail = latestTool.input.pattern
    } else if (latestTool.input?.description) {
      statusDetail = latestTool.input.description.length > 60
        ? latestTool.input.description.slice(0, 60) + '...'
        : latestTool.input.description
    }
  } else if (thinking) {
    statusText = '💭 思考中...'
  }

  return (
    <motion.div
      className="flex gap-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(30,41,59,0.72),rgba(15,23,42,0.96))] text-slate-100 shadow-[0_10px_28px_rgba(2,6,23,0.22)]">
        <Bot size={15} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
        <div className="flex items-center gap-2 text-[11px] text-slate-400/88">
          <span className="font-medium tracking-[0.01em] text-slate-100/92">{providerLabel}</span>
          <span className="h-1 w-1 rounded-full bg-slate-300/70" />
          <span>{statusText}</span>
          {toolUse && toolUse.length > 1 && (
            <span className="text-[10px] text-slate-500">({toolUse.length} 个操作)</span>
          )}
        </div>
        <div className="border-l border-white/[0.08] pl-4">
          {statusDetail ? (
            <span className="block max-w-[540px] truncate font-mono text-[12px] text-slate-400/78">{statusDetail}</span>
          ) : (
            <span className="flex gap-1.5 py-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300/75" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300/75" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300/75" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function ConversationView({ session }: Props) {
  const {
    messages,
    streaming,
    chatError,
    sendMessage,
    pollChat,
    initProcess,
    handleChatUpdate,
    handleChatPatch,
    handleAgentUpdate,
    stopProcess,
    childToParent,
  } = useSessionStore(useShallow((state) => ({
    messages: state.messages,
    streaming: state.streaming,
    chatError: state.chatError,
    sendMessage: state.sendMessage,
    pollChat: state.pollChat,
    initProcess: state.initProcess,
    handleChatUpdate: state.handleChatUpdate,
    handleChatPatch: state.handleChatPatch,
    handleAgentUpdate: state.handleAgentUpdate,
    stopProcess: state.stopProcess,
    childToParent: state.childToParent,
  })))

  // Child agent sessions are managed by the parent — don't auto-init a bridge adapter for them
  const isChildSession = !!(childToParent?.[session.id] || (session as any).parentSessionId)

  const [ready, setReady] = useState(false)
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, viewportHeight: 0 })
  const [composerHeight, setComposerHeight] = useState(0)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollMetricsFrameRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const isNearBottomRef = useRef(true)
  const prevMsgCountRef = useRef(0)
  const lastEventTimeRef = useRef(0)
  const forceScrollUntilRef = useRef(0)

  const commitScrollMetrics = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    setScrollMetrics((prev) => {
      const next = {
        scrollTop: el.scrollTop,
        viewportHeight: el.clientHeight,
      }
      return prev.scrollTop === next.scrollTop && prev.viewportHeight === next.viewportHeight
        ? prev
        : next
    })
  }, [])

  const syncScrollMetrics = useCallback(() => {
    if (typeof requestAnimationFrame !== 'function') {
      commitScrollMetrics()
      return
    }
    if (scrollMetricsFrameRef.current !== null) return
    scrollMetricsFrameRef.current = requestAnimationFrame(() => {
      scrollMetricsFrameRef.current = null
      commitScrollMetrics()
    })
  }, [commitScrollMetrics])

  const cancelPendingAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
  }, [])

  const scrollToBottom = useCallback((afterPaint = false) => {
    const applyScroll = () => {
      autoScrollFrameRef.current = null
      const el = scrollContainerRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
      isNearBottomRef.current = true
      commitScrollMetrics()
    }

    cancelPendingAutoScroll()

    if (afterPaint && typeof requestAnimationFrame === 'function') {
      autoScrollFrameRef.current = requestAnimationFrame(applyScroll)
      return
    }

    applyScroll()
  }, [cancelPendingAutoScroll, commitScrollMetrics])

  const measureComposerHeight = useCallback(() => {
    const el = composerRef.current
    if (!el) {
      setComposerHeight((prev) => (prev === 0 ? prev : 0))
      return
    }

    const nextHeight = Math.ceil(Math.max(el.offsetHeight, el.getBoundingClientRect().height || 0))
    setComposerHeight((prev) => (prev === nextHeight ? prev : nextHeight))
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const threshold = 150
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    syncScrollMetrics()
  }, [syncScrollMetrics])

  useIpcEvent<ChatUpdateEvent>('chat:update', (event) => {
    lastEventTimeRef.current = Date.now()
    handleChatUpdate(event)
  })

  useIpcEvent<ChatPatchEvent>('chat:patch', (event) => {
    lastEventTimeRef.current = Date.now()
    handleChatPatch(event)
  })

  useIpcEvent<AgentUpdateEvent>('agent:update', (event) => {
    handleAgentUpdate(event)
  })

  useEffect(() => {
    return () => {
      if (scrollMetricsFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(scrollMetricsFrameRef.current)
        scrollMetricsFrameRef.current = null
      }
      cancelPendingAutoScroll()
    }
  }, [cancelPendingAutoScroll])

  useLayoutEffect(() => {
    prevMsgCountRef.current = 0
    isNearBottomRef.current = true
    forceScrollUntilRef.current = Date.now() + 3000
  }, [session.id])

  useLayoutEffect(() => {
    if (messages.length === 0) return
    if (Date.now() >= forceScrollUntilRef.current) return
    scrollToBottom()
  }, [messages, scrollToBottom, session.id])

  useEffect(() => {
    commitScrollMetrics()

    const el = scrollContainerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      syncScrollMetrics()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [commitScrollMetrics, session.id, syncScrollMetrics])

  // Initialize session on first mount / session switch.
  // IMPORTANT: Do NOT depend on session.status here — status changes frequently
  // during streaming (idle ↔ running) and would toggle `ready`, disabling the
  // textarea and stealing focus from the user's input.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    const boot = async () => {
      try {
        await initProcess(session.id)
      } catch {
        // initProcess may throw if session is already active — that's fine
      }
      if (!cancelled) setReady(true)
    }
    void boot()
    return () => { cancelled = true }
  }, [initProcess, session.id])

  useEffect(() => {
    void pollChat(session.id)
    const timer = setInterval(() => {
      if (Date.now() - lastEventTimeRef.current < 5000) return
      void pollChat(session.id)
    }, 3000)
    return () => clearInterval(timer)
  }, [pollChat, session.id])

  useEffect(() => {
    const previousCount = prevMsgCountRef.current
    prevMsgCountRef.current = messages.length
    const forceScroll = Date.now() < forceScrollUntilRef.current

    if (forceScroll && messages.length > 0) {
      scrollToBottom(true)
      return
    }

    if (!isNearBottomRef.current) return

    if (messages.length > previousCount) {
      scrollToBottom()
      return
    }

    // 流式输出期间，消息内容通过 chat:patch (upsert_last) 持续更新，
    // messages 引用变化但 length 不变，需要持续滚动到底部
    if (streaming && messages.length > 0) {
      scrollToBottom(true)
    }
  }, [messages, scrollToBottom, streaming])

  const shellPanelVisible = usePanelStore((state) => state.shellPanelVisible)
  const isEnded = ['completed', 'terminated', 'error'].includes(session.status)
  const hasComposer = !isEnded || isChildSession
  const composerClearance = hasComposer
    ? Math.max(composerHeight, DEFAULT_COMPOSER_HEIGHT) + COMPOSER_BOTTOM_GAP
    : 0
  const deferredMessages = useDeferredValue(messages)
  const groupedMessagesSource = deferredMessages.length === 0 && messages.length <= 1
    ? messages
    : deferredMessages
  const messageGroups = useMemo(() => groupMessages(groupedMessagesSource, session.id), [groupedMessagesSource, session.id])
  const estimatedConversationHeight = useMemo(
    () => messageGroups.reduce((sum, group) => sum + estimateMessageGroupHeight(group), 0),
    [messageGroups],
  )
  const shouldVirtualize = scrollMetrics.viewportHeight > 0 && (
    messageGroups.length >= VIRTUALIZATION_GROUP_THRESHOLD
    || estimatedConversationHeight >= scrollMetrics.viewportHeight * VIRTUALIZATION_HEIGHT_MULTIPLIER
  )
  const virtualization = useVirtualizedList({
    items: messageGroups,
    enabled: shouldVirtualize,
    getItemKey: getGroupKey,
    estimateSize: estimateMessageGroupHeight,
    overscanPx: VIRTUALIZATION_OVERSCAN_PX,
    scrollTop: scrollMetrics.scrollTop,
    viewportHeight: scrollMetrics.viewportHeight,
  })
  const handleSend = useCallback((text: string, images?: Array<{data: string; mimeType: string}>) => (
    sendMessage(session.id, text, images)
  ), [sendMessage, session.id])
  const handleStop = useCallback(() => {
    void stopProcess(session.id)
  }, [session.id, stopProcess])
  const inputPlaceholder = ready ? '输入消息，Enter 发送' : '正在初始化...'

  useLayoutEffect(() => {
    if (!hasComposer) {
      setComposerHeight(0)
      return
    }

    measureComposerHeight()
  }, [hasComposer, measureComposerHeight, session.id])

  useEffect(() => {
    if (!hasComposer) return

    const el = composerRef.current
    if (!el) return

    measureComposerHeight()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      measureComposerHeight()
    })
    observer.observe(el)

    return () => observer.disconnect()
  }, [hasComposer, measureComposerHeight, session.id])

  useLayoutEffect(() => {
    if (!hasComposer || composerClearance === 0) return
    if (!isNearBottomRef.current && Date.now() >= forceScrollUntilRef.current) return
    scrollToBottom(true)
  }, [composerClearance, hasComposer, scrollToBottom])

  const renderMessageGroup = useCallback((group: MessageGroup) => {
    if (group.type === 'tool_group' && group.convMessages) {
      const isLastGroup = group.index + group.messages.length >= groupedMessagesSource.length
      const fileOps = extractFileChanges(group.convMessages)
      const fileOpMessageIds = new Set(fileOps.map((operation) => operation.id))
      const stickerMsgs = group.convMessages.filter(
        (m) => m.toolName === 'send_sticker' && m.toolInput?.mood,
      )
      const nonStickerMsgs = group.convMessages.filter(
        (m) => m.toolName !== 'send_sticker' && !fileOpMessageIds.has(m.id),
      )
      return (
        <React.Fragment key={`tool-${group.index}`}>
          {nonStickerMsgs.length > 0 && (
            <ToolOperationGroup
              messages={nonStickerMsgs}
              isActive={streaming && isLastGroup}
            />
          )}
          {fileOps.map((operation, index) => (
            <FileChangeCard key={`fc-${group.index}-${index}`} message={operation} />
          ))}
          {stickerMsgs.map((msg, index) => (
            <StickerCard
              key={`sticker-${group.index}-${index}`}
              mood={msg.toolInput!.mood as string}
              cacheKey={msg.id}
            />
          ))}
        </React.Fragment>
      )
    }

    if (group.type === 'child_agent' && group.childSessionId) {
      const isLastGroup = group.index + group.messages.length >= groupedMessagesSource.length
      return (
        <ChildAgentBlock
          key={`child-${group.childSessionId}-${group.index}`}
          name={group.childAgentName}
          messages={group.messages}
          childSessionId={group.childSessionId}
          isActive={streaming && isLastGroup}
        />
      )
    }

    if (group.type === 'thinking') {
      const merged = group.messages.map(m => m.content).join('')
      return (
        <ThinkingBlock key={`think-${group.index}`} content={merged} />
      )
    }

    return group.messages.map((msg, index) => (
      <MessageBubble
        key={`msg-${group.index}-${index}`}
        message={msg}
        isStreaming={streaming}
        providerId={session.providerId}
      />
    ))
  }, [groupedMessagesSource.length, session.providerId, streaming])

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="conversation-view">
      <SessionToolbar session={session} />

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        data-scroll-container
        className="flex-1 overflow-y-auto px-5 py-5"
        style={{ overflowAnchor: 'none', scrollPaddingBottom: `${composerClearance}px` }}
      >
        <div
          className="mx-auto flex max-w-4xl flex-col gap-3"
          style={{ paddingBottom: composerClearance > 0 ? `${composerClearance}px` : undefined }}
        >
          {!ready && messages.length === 0 ? (
            /* Shimmer skeleton while session is initializing */
            <div className="animate-fade-in space-y-4">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8">
                <div className="shimmer h-3 w-24 rounded-md" />
                <div className="shimmer mt-4 h-5 w-48 rounded-md" />
                <div className="shimmer mt-3 h-3 w-64 rounded-md" />
              </div>
            </div>
          ) : messages.length === 0 && !streaming ? (
            <div className="animate-scale-in rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-sm text-gray-300">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-gray-600">{isChildSession ? 'Sub-Agent' : 'Conversation'}</p>
              <h3 className="mt-3 text-lg font-semibold text-white">{session.name}</h3>
              <p className="mt-2 leading-7 text-gray-500">
                {isChildSession ? '子Agent执行记录将显示在这里。' : '会话已经就绪，输入消息开始对话。'}
              </p>
            </div>
          ) : (
            virtualization.enabled ? (
              <div
                className="relative w-full"
                style={{ height: Math.max(virtualization.totalHeight, 1) }}
              >
                {virtualization.virtualItems.map((virtualItem) => (
                  <div
                    key={virtualItem.key}
                    ref={virtualization.measureElement(virtualItem.key)}
                    className="absolute left-0 right-0 top-0"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    {renderMessageGroup(virtualItem.item)}
                  </div>
                ))}
                <div
                  ref={bottomRef}
                  className="absolute left-0 w-px"
                  style={{ top: Math.max(virtualization.totalHeight - 1, 0), height: 1 }}
                />
              </div>
            ) : (
              <>
                {messageGroups.map((group) => renderMessageGroup(group))}
                <div ref={bottomRef} />
              </>
            )
          )}

          <AnimatePresence>
            {(streaming || ['starting', 'running'].includes(session.status)) && (messages.length === 0 || messages[messages.length - 1]?.role === 'user' || (messages[messages.length - 1]?.role === 'assistant' && !(messages[messages.length - 1] as any)?.content?.trim())) && (
              <StreamingIndicator messages={messages} providerId={session.providerId} />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {chatError && (
              <motion.div
                className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                {chatError}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {hasComposer && (
        <div ref={composerRef} data-message-input-shell>
          <MessageInput
            key={session.id}
            sessionId={session.id}
            disabled={!ready}
            streaming={streaming}
            placeholder={inputPlaceholder}
            onSend={handleSend}
            onStop={handleStop}
          />
        </div>
      )}

      {shellPanelVisible && (
        <div className="h-[200px] shrink-0 border-t border-white/10">
          <ShellTerminalView />
        </div>
      )}
    </section>
  )
}

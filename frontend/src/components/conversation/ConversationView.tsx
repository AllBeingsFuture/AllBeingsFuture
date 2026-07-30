import React, { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { Session } from '../../../bindings/allbeingsfuture/internal/models/models'
import type { ChatMessage } from '../../../bindings/allbeingsfuture/internal/models/models'
import { workbenchApi } from '../../app/api/workbench'
import { useSessionStore } from '../../stores/sessionStore'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import SessionToolbar from './SessionToolbar'
import ToolOperationGroup from './ToolOperationGroup'
import FileChangeCard from './FileChangeCard'
import StickerCard from './StickerCard'
import type { ConversationMessage, FileChangeInfo } from '../../types/conversationTypes'
import { useConversationScroll } from './useConversationScroll'
import { useVirtualizedList } from './useVirtualizedList'
import { resolveProviderDisplayInfo } from '../../utils/providerDisplay'
import AgentActivityPanel from './AgentActivityPanel'

interface Props {
  session: Session
}

/** Convert backend ChatMessage to ConversationMessage for tool components */
function toConversationMessage(
  msg: ChatMessage,
  index: number,
  sessionId: string,
  idSuffix?: string,
): ConversationMessage {
  const anyMsg = msg as any
  // Agent stream uses toolUseId; legacy process path stores toolCallId.
  const toolUseId = anyMsg.toolUseId || anyMsg.toolCallId
  return {
    id: `${sessionId}-${index}${idSuffix ? `-${idSuffix}` : ''}`,
    sessionId,
    role: (msg.role as ConversationMessage['role']) || 'assistant',
    content: msg.content || '',
    timestamp: anyMsg.timestamp || new Date().toISOString(),
    toolName: anyMsg.toolName,
    toolInput: anyMsg.toolInput as Record<string, unknown> | undefined,
    toolResult: anyMsg.toolResult,
    toolOutputs: anyMsg.toolOutputs,
    toolUseId,
    // Live tool rows: treat open partial tool_use/result as delta so UI stays live.
    isDelta: Boolean(anyMsg.isDelta || anyMsg.partial),
    isError: anyMsg.isError,
    isThinking: anyMsg.isThinking,
    thinkingText: anyMsg.isThinking ? msg.content : undefined,
    usage: anyMsg.usage,
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
/** Base overscan; fast fling adds scrollMetrics.overscanBoostPx on top. */
const VIRTUALIZATION_OVERSCAN_PX = 1800
const VIRTUALIZATION_OVERSCAN_VIEWPORT_MULT = 2.5
const DEFAULT_COMPOSER_HEIGHT = 96
const COMPOSER_BOTTOM_GAP = 12
const LIVE_RENDER_HOLD_MS = 700

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
  const pushToolMsg = (msg: ChatMessage, index: number, idSuffix?: string) => {
    if (!currentToolGroup) {
      currentToolGroup = []
      currentToolConvMsgs = []
      toolGroupStartIndex = index
    }
    currentToolGroup.push(msg)
    currentToolConvMsgs!.push(toConversationMessage(msg, index, sessionId, idSuffix))
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
    if (msg.role === 'tool_use' || msg.role === 'tool_result') {
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
        pushToolMsg(virtualMsg, i, `tool-${t}`)
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

function getGroupKey(sessionId: string, group: MessageGroup): string {
  if (group.type === 'child_agent') {
    return `${sessionId}-${group.type}-${group.childSessionId || 'unknown'}-${group.index}`
  }
  return `${sessionId}-${group.type}-${group.index}`
}

/** Collapsed ThinkingBlock is a single compact row (~32–48px); expand raises height via measure. */
const THINKING_COLLAPSED_HEIGHT = 44
/** Per-image height pad for user messages with screenshots (base64 previews). */
const MESSAGE_IMAGE_HEIGHT = 240
const MESSAGE_IMAGE_HEIGHT_CAP = 960

function countMessageImages(group: MessageGroup): number {
  let count = 0
  for (const message of group.messages) {
    const images = (message as { images?: unknown }).images
    if (Array.isArray(images) && images.length > 0) {
      count += images.length
    }
  }
  return count
}

/** True when any bubble in the group is still streaming (partial / delta tail). */
export function messageGroupHasPartial(group: MessageGroup): boolean {
  return group.messages.some((message) => {
    const m = message as { partial?: boolean; isDelta?: boolean }
    return Boolean(m.partial || m.isDelta)
  })
}

/** Exported for unit tests; used by virtual list estimateSize. */
export function estimateMessageGroupHeight(group: MessageGroup): number {
  const totalContentLength = group.messages.reduce((sum, message) => sum + (message.content?.length || 0), 0)
  const newlineCount = group.messages.reduce((sum, message) => sum + ((message.content?.match(/\n/g) || []).length), 0)
  const isPartial = messageGroupHasPartial(group)

  // Prefer over-estimates for unmeasured history the fling jumps into, but never
  // invent expanded thinking height — ThinkingBlock defaults to collapsed.

  if (group.type === 'thinking') {
    // Live thinking auto-expands — grow estimate with content so stick-to-bottom
    // tracks the open body. Settled thinking stays a compact header row.
    if (isPartial) {
      return Math.max(
        THINKING_COLLAPSED_HEIGHT + 48,
        Math.min(260, THINKING_COLLAPSED_HEIGHT + 40 + Math.ceil(totalContentLength / 48) * 18),
      )
    }
    return THINKING_COLLAPSED_HEIGHT
  }

  if (group.type === 'tool_group') {
    // Settled groups default to a compact header + summary row; only in-flight
    // tools auto-expand and need a taller estimate for stick-to-bottom.
    if (isPartial) {
      return Math.max(160, 88 + group.messages.length * 80)
    }
    return 88
  }

  if (group.type === 'child_agent') {
    return Math.max(160, 160 + Math.min(800, group.messages.length * 64))
  }

  // Streaming partial uses plain pre-wrap (~15px / 1.8 line-height). Keep the
  // estimate close to real growth so the virtual spacer tracks tokens smoothly
  // without estimate↔measure thrash.
  //
  // Settled messages keep a mild overestimate for fling-into-unmeasured history,
  // but must NOT use content/6 (≈6-char lines) — that hit the 4000px cap on long
  // assistants and left a huge blank region between the last bubble and composer
  // whenever the measured cache was cold or lagging.
  const textHeight = isPartial
    ? Math.max(72, Math.min(4000, 56 + Math.ceil(totalContentLength / 42) * 27 + newlineCount * 27))
    : Math.max(120, Math.min(4000, 100 + Math.ceil(totalContentLength / 36) * 26 + newlineCount * 22))
  const imageCount = countMessageImages(group)
  if (imageCount <= 0) return textHeight

  const imageHeight = Math.min(MESSAGE_IMAGE_HEIGHT_CAP, imageCount * MESSAGE_IMAGE_HEIGHT)
  return Math.min(4000, textHeight + imageHeight)
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

/** Collapsible thinking block — live turns show 思考中 and stream content. */
const ThinkingBlock = memo(function ThinkingBlock({
  content,
  isActive = false,
}: {
  content: string
  isActive?: boolean
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null)
  // Live thinking starts open so token growth is visible; settled stays collapsed.
  const expanded = manualExpanded ?? isActive
  const seconds = Math.max(1, Math.round((content?.length || 0) / 180))
  const preview = content.length > 160 ? `${content.slice(0, 160)}…` : content

  useEffect(() => {
    // Reset sticky toggle when the live/settled phase flips.
    setManualExpanded(null)
  }, [isActive])

  return (
    <div className="my-1 w-full max-w-[42rem]" data-thinking-active={isActive ? 'true' : 'false'}>
      <button
        type="button"
        onClick={() => setManualExpanded(current => !(current ?? isActive))}
        className="inline-flex items-center gap-1.5 rounded-lg py-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
        aria-expanded={expanded}
        data-testid="thinking-block-toggle"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="font-medium tracking-wide">
          {isActive ? `思考中 · ${seconds}s` : `思考完成 · ${seconds}s`}
        </span>
        {isActive && (
          <span className="flex gap-0.5 ml-0.5">
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: '0ms' }} />
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: '150ms' }} />
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: '300ms' }} />
          </span>
        )}
      </button>
      {!expanded && isActive && preview && (
        <div className="mt-1 max-h-[72px] overflow-hidden rounded-lg border border-white/[0.04] bg-white/[0.015] px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-500/80 whitespace-pre-wrap">
          {preview}
        </div>
      )}
      <AnimatePresence>
        {expanded && content && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="mt-1.5 max-h-[200px] overflow-y-auto rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-zinc-500"
            data-testid="thinking-block-body"
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
          onClick={() => { void workbenchApi.navigation.openSession(childSessionId) }}
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
      className="flex w-full max-w-[42rem] justify-start"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex min-w-0 flex-col gap-1 py-1">
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="font-medium tracking-[0.01em] text-zinc-400/90">{providerLabel}</span>
          <span className="h-1 w-1 rounded-full bg-zinc-600" />
          <span>{statusText}</span>
          {toolUse && toolUse.length > 1 && (
            <span className="text-[10px] text-zinc-600">({toolUse.length} 个操作)</span>
          )}
        </div>
        <div className="pl-0.5">
          {statusDetail ? (
            <span className="block max-w-[540px] truncate font-mono text-[12px] text-zinc-500">{statusDetail}</span>
          ) : (
            <span className="flex gap-1.5 py-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500/70" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500/70" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500/70" style={{ animationDelay: '300ms' }} />
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
    pollChat,
    respondToPermission,
    agentStream,
    childToParent,
  } = useSessionStore(useShallow((state) => ({
    messages: state.messages,
    streaming: state.streaming,
    chatError: state.chatError,
    pollChat: state.pollChat,
    respondToPermission: state.respondToPermission,
    agentStream: state.agentStreams?.[session.id],
    childToParent: state.childToParent,
  })))

  // Child agent sessions are managed by the parent — don't auto-init a bridge adapter for them
  const isChildSession = !!(childToParent?.[session.id] || (session as any).parentSessionId)

  const [ready, setReady] = useState(false)
  const [composerHeight, setComposerHeight] = useState(0)
  // Treat agent stream phases as live even if the boolean flag briefly lags.
  const agentStreamLive = Boolean(
    agentStream
    && (agentStream.phase === 'running'
      || agentStream.phase === 'waiting_permission'
      || agentStream.phase === 'cancelling'),
  )
  const liveStreaming = streaming || agentStreamLive
  const [preferLiveMessages, setPreferLiveMessages] = useState(liveStreaming)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const isEnded = ['completed', 'terminated', 'error'].includes(session.status)
  const hasComposer = !isEnded || isChildSession
  const composerClearance = hasComposer
    ? Math.max(composerHeight, DEFAULT_COMPOSER_HEIGHT) + COMPOSER_BOTTOM_GAP
    : 0

  useEffect(() => {
    if (liveStreaming) {
      setPreferLiveMessages(true)
      return
    }

    // Hold on to the live array briefly after streaming settles so the
    // deferred snapshot does not flash older content back into view.
    const timer = window.setTimeout(() => {
      setPreferLiveMessages(false)
    }, LIVE_RENDER_HOLD_MS)

    return () => window.clearTimeout(timer)
  }, [liveStreaming, session.id])
  const shouldRenderLiveMessages = liveStreaming || preferLiveMessages

  // Token deltas keep messages.length stable; revision must change so stick-to-bottom
  // re-pins while attached (matches historical chat:patch upsert_last behavior).
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined
  const liveTailRevision = shouldRenderLiveMessages
    ? [
        messages.length,
        lastMessage?.role || '',
        lastMessage?.content?.length || 0,
        (lastMessage as { partial?: boolean } | undefined)?.partial ? 1 : 0,
        agentStream?.lastSequence ?? -1,
        agentStream?.lastEventAt ?? 0,
      ].join(':')
    : `${messages.length}`

  const {
    bottomRef,
    contentRef,
    scrollContainerRef,
    handleScroll,
    handleWheel,
    handlePointerDown,
    scrollMetrics,
    markProgrammaticScroll,
    shouldSuppressPositiveScrollCompensation,
    stickToBottomNow,
  } = useConversationScroll({
    sessionId: session.id,
    messagesLength: messages.length,
    streaming: shouldRenderLiveMessages,
    bottomOffset: composerClearance,
    liveTailRevision,
  })

  const getScrollElement = useCallback(() => scrollContainerRef.current, [scrollContainerRef])

  const measureComposerHeight = useCallback(() => {
    const el = composerRef.current
    if (!el) {
      setComposerHeight((prev) => (prev === 0 ? prev : 0))
      return
    }

    const nextHeight = Math.ceil(Math.max(el.offsetHeight, el.getBoundingClientRect().height || 0))
    setComposerHeight((prev) => (prev === nextHeight ? prev : nextHeight))
  }, [])

  // agent:stream / chat:update / chat:patch / agent:update are owned by
  // installWorkbenchRuntime (global IPC → session store). This view only
  // consumes store state so unmounting does not drop live streams.

  // Hydrate chat history on first mount / session switch.
  // Do NOT auto-init the agent process here: after app restart/reinstall that
  // would relaunch providers and can re-run prior work via ACP session/load.
  // Agent init happens only on user-initiated send (ProcessService auto-init)
  // or explicit create/resume/worktree flows. Keep ready independent of status
  // so streaming status flips do not disable the composer.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    const boot = async () => {
      try {
        await pollChat(session.id)
      } catch {
        // History load is best-effort; composer still opens for a new send.
      }
      if (!cancelled) setReady(true)
    }
    void boot()
    return () => { cancelled = true }
  }, [pollChat, session.id])

  useEffect(() => {
    void pollChat(session.id)
    // Safety poll when IPC is quiet; active agent streams short-circuit in pollChat.
    const timer = setInterval(() => {
      void pollChat(session.id)
    }, 3000)
    return () => clearInterval(timer)
  }, [pollChat, session.id])

  const deferredMessages = useDeferredValue(messages)
  // 流式期间以及刚结束的短暂缓冲期内直接渲染实时消息，
  // 避免 deferred 快照回退到旧内容，造成会话区闪屏。
  const groupedMessagesSource = shouldRenderLiveMessages
    ? messages
    : deferredMessages.length === 0 && messages.length <= 1
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
  const virtualOverscanPx = Math.max(
    VIRTUALIZATION_OVERSCAN_PX,
    Math.round(scrollMetrics.viewportHeight * VIRTUALIZATION_OVERSCAN_VIEWPORT_MULT),
  ) + scrollMetrics.overscanBoostPx

  const virtualization = useVirtualizedList({
    items: messageGroups,
    enabled: shouldVirtualize,
    getItemKey: (group) => getGroupKey(session.id, group),
    estimateSize: estimateMessageGroupHeight,
    overscanPx: virtualOverscanPx,
    scrollTop: scrollMetrics.scrollTop,
    viewportHeight: scrollMetrics.viewportHeight,
    getScrollElement,
    markProgrammaticScroll,
    shouldSuppressPositiveScrollCompensation,
    // Partial streaming tails: grow spacer with estimate so token growth does not
    // wait on RO before totalHeight moves (stick-to-bottom stays smooth).
    shouldPreferGrowingEstimate: messageGroupHasPartial,
  })
  const handleSend = useCallback(async (text: string, images?: Array<{data: string; mimeType: string}>) => {
    // Re-attach before append so subsequent streaming ResizeObserver growth sticks.
    // Passive message growth alone does not clear userDetached — only explicit send does.
    stickToBottomNow()
    await workbenchApi.chat.appendMessage(session.id, text, images)
  }, [session.id, stickToBottomNow])
  const handleStop = useCallback(() => {
    void workbenchApi.chat.stop(session.id)
  }, [session.id])
  const handlePermissionResponse = useCallback((requestId: string, optionId: string) => (
    respondToPermission(session.id, requestId, optionId)
  ), [respondToPermission, session.id])
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

  const renderMessageGroup = useCallback((group: MessageGroup) => {
    const isLastGroup = group.index + group.messages.length >= groupedMessagesSource.length
    // Tool groups: live only while a row is still partial/delta — do NOT treat
    // "last group during a turn" as live, or finished "执行了 N 个操作" stays expanded.
    // Thinking / child / message groups: still treat last group as live so the
    // active tail keeps streaming UI when partial flags lag.
    const groupIsLive = shouldRenderLiveMessages && (
      group.type === 'tool_group'
        ? messageGroupHasPartial(group)
        : (isLastGroup || messageGroupHasPartial(group))
    )

    if (group.type === 'tool_group' && group.convMessages) {
      const fileOps = extractFileChanges(group.convMessages)
      const fileOpMessageIds = new Set(fileOps.map((operation) => operation.id))
      const fileOpToolUseIds = new Set(fileOps.map(operation => operation.toolUseId).filter(Boolean))
      const stickerMsgs = group.convMessages.filter(
        (m) => m.toolName === 'send_sticker' && m.toolInput?.mood,
      )
      const nonStickerMsgs = group.convMessages.filter(
        (m) => m.toolName !== 'send_sticker'
          && !fileOpMessageIds.has(m.id)
          && !fileOpToolUseIds.has(m.toolUseId),
      )
      return (
        <React.Fragment key={`tool-${group.index}`}>
          {nonStickerMsgs.length > 0 && (
            <ToolOperationGroup
              messages={nonStickerMsgs}
              isActive={groupIsLive}
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
      return (
        <ChildAgentBlock
          key={`child-${group.childSessionId}-${group.index}`}
          name={group.childAgentName}
          messages={group.messages}
          childSessionId={group.childSessionId}
          isActive={groupIsLive}
        />
      )
    }

    if (group.type === 'thinking') {
      const merged = group.messages.map(m => m.content).join('')
      return (
        <ThinkingBlock key={`think-${group.index}`} content={merged} isActive={groupIsLive} />
      )
    }

    return group.messages.map((msg, index) => (
      <MessageBubble
        key={`msg-${group.index}-${index}`}
        message={msg}
        isStreaming={shouldRenderLiveMessages}
        providerId={session.providerId}
      />
    ))
  }, [groupedMessagesSource, session.providerId, shouldRenderLiveMessages])

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="conversation-view">
      <SessionToolbar session={session} />

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        data-scroll-container
        className="flex-1 overflow-y-auto px-6 py-7"
        style={{ overflowAnchor: 'none', scrollPaddingBottom: `${composerClearance}px` }}
      >
        <div
          ref={contentRef}
          className="mx-auto flex w-full max-w-[42rem] flex-col gap-6"
          style={{ paddingBottom: composerClearance > 0 ? `${composerClearance}px` : undefined }}
        >
          {!ready && messages.length === 0 ? (
            /* Shimmer skeleton while session is initializing */
            <div className="animate-fade-in space-y-4">
              <div className="surface-panel px-6 py-10">
                <div className="shimmer h-3 w-24 rounded-md" />
                <div className="shimmer mt-4 h-5 w-48 rounded-md" />
                <div className="shimmer mt-3 h-3 w-64 rounded-md" />
              </div>
            </div>
          ) : messages.length === 0 && !streaming ? (
            <div className="animate-scale-in surface-panel px-6 py-11 text-sm text-zinc-300">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-zinc-500">{isChildSession ? 'Sub-Agent' : 'Conversation'}</p>
              <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em] text-zinc-50">{session.name}</h3>
              <p className="mt-2.5 leading-7 text-zinc-400">
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

          <AgentActivityPanel
            stream={agentStream}
            onPermissionResponse={handlePermissionResponse}
          />

          <AnimatePresence>
            {(shouldRenderLiveMessages || ['starting', 'running'].includes(session.status)) && (messages.length === 0 || messages[messages.length - 1]?.role === 'user' || (messages[messages.length - 1]?.role === 'assistant' && !(messages[messages.length - 1] as any)?.content?.trim())) && (
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
            cancelling={agentStream?.phase === 'cancelling'}
            placeholder={inputPlaceholder}
            onSend={handleSend}
            onStop={handleStop}
          />
        </div>
      )}
    </section>
  )
}

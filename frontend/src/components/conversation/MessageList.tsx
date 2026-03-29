import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, ChevronDown, ChevronRight, Sparkles, Users } from 'lucide-react'
import type { ChatMessage } from '../../../bindings/allbeingsfuture/internal/models/models'
import { workbenchApi } from '../../app/api/workbench'
import MessageBubble from './MessageBubble'
import ToolOperationGroup from './ToolOperationGroup'
import FileChangeCard from './FileChangeCard'
import StickerCard from './StickerCard'
import type { ConversationMessage, FileChangeInfo } from '../../types/conversationTypes'

// ─── Types ───

export interface MessageGroup {
  type: 'message' | 'tool_group' | 'thinking' | 'child_agent'
  messages: ChatMessage[]
  convMessages?: ConversationMessage[]
  index: number
  /** For child_agent groups: the child session ID */
  childSessionId?: string
  /** For child_agent groups: the display name */
  childAgentName?: string
}

// ─── Helpers ───

/** Convert backend ChatMessage to ConversationMessage for tool components */
export function toConversationMessage(msg: ChatMessage, index: number, sessionId: string): ConversationMessage {
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

export function groupMessages(messages: ChatMessage[], sessionId: string): MessageGroup[] {
  const groups: MessageGroup[] = []
  let currentToolGroup: ChatMessage[] | null = null
  let currentToolConvMsgs: ConversationMessage[] | null = null
  let toolGroupStartIndex = 0
  let currentChildGroup: ChatMessage[] | null = null
  let currentChildId: string | null = null
  let currentChildName: string | null = null
  let childGroupStartIndex = 0

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

    flushChildGroup()

    if (msg.role === 'tool_use') {
      pushToolMsg(msg, i)
      continue
    }

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
      if (msg.content?.trim()) {
        flushToolGroup()
        groups.push({ type: 'message', messages: [msg], index: i })
      }
      continue
    }

    flushToolGroup()

    if (msg.role === 'thinking' || (msg as any).isThinking) {
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

/** Detect file-editing tool names (MCP allbeingsfuture tools + native Edit/Write) */
function detectFileChangeType(toolName: string): FileChangeInfo['changeType'] | null {
  if (toolName.includes('edit_file') || toolName === 'Edit') return 'edit'
  if (toolName.includes('create_file')) return 'create'
  if (toolName.includes('write_file') || toolName === 'Write') return 'write'
  if (toolName.includes('delete_file')) return 'delete'
  return null
}

/** Extract FileChangeInfo from tool_use messages that modify files */
function extractFileChanges(convMessages: ConversationMessage[]): ConversationMessage[] {
  const results: ConversationMessage[] = []
  for (const msg of convMessages) {
    if (msg.role !== 'tool_use' || !msg.toolName) continue
    const changeType = detectFileChangeType(msg.toolName)
    if (!changeType) continue

    const input = msg.toolInput || {}
    const filePath = (input.file_path as string) || (input.path as string) || ''
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
  Read: '\u{1F4D6}', Write: '\u270D\uFE0F', Edit: '\u{1F4DD}', Bash: '\u{1F4BB}', Glob: '\u{1F4C2}', Grep: '\u{1F50E}',
  Agent: '\u{1F916}', WebSearch: '\u{1F310}', WebFetch: '\u{1F310}', ToolSearch: '\u{1F50D}',
}

// ─── Sub-components ───

/** Collapsible thinking block */
function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="my-1 mx-2 rounded-xl border border-dashed border-purple-500/20 bg-purple-500/[0.03] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-purple-400/60 hover:text-purple-300 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Sparkles size={11} />
        <span>{'\u601D\u8003\u8FC7\u7A0B'}</span>
        {content && <span className="text-gray-600">({content.length} {'\u5B57\u7B26'})</span>}
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
}

/** Collapsible block for child agent activity */
function ChildAgentBlock({ name, messages, childSessionId, isActive }: {
  name?: string
  messages: ChatMessage[]
  childSessionId: string
  isActive: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const toolCount = messages.filter(m => m.role === 'tool_use').length
  const thinkingCount = messages.filter(m => m.role === 'thinking' || (m as any).isThinking).length
  const textMsgs = messages.filter(m => m.role === 'assistant' && m.content?.trim())

  const displayName = name || '\u5B50Agent'
  const summary = [
    toolCount > 0 ? `${toolCount} \u4E2A\u64CD\u4F5C` : null,
    thinkingCount > 0 ? `${thinkingCount} \u6B21\u601D\u8003` : null,
  ].filter(Boolean).join('\uFF0C')

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
          title={'\u67E5\u770B\u5B50Agent\u5B8C\u6574\u4F1A\u8BDD'}
        >
          {'\u67E5\u770B\u8BE6\u60C5'} {'\u2192'}
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
                    {'\u{1F4AD}'} {msg.content.slice(0, 200)}
                  </div>
                )
              }
              if (msg.role === 'tool_use') {
                const icon = TOOL_ICONS[(msg as any).toolName] || '\u{1F9F0}'
                return (
                  <div key={idx} className="text-[10px] text-gray-500 font-mono truncate">
                    {icon} {(msg as any).toolName}
                    {(msg as any).toolInput?.command && ` \u2192 ${(msg as any).toolInput.command.slice(0, 80)}`}
                    {(msg as any).toolInput?.file_path && ` \u2192 ${(msg as any).toolInput.file_path}`}
                    {(msg as any).toolInput?.pattern && ` \u2192 ${(msg as any).toolInput.pattern}`}
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
}

/** Streaming indicator that shows tool operations when available */
function StreamingIndicator({ messages }: { messages: ChatMessage[] }) {
  const lastMsg = messages[messages.length - 1]
  const toolUse = lastMsg?.role === 'assistant' ? (lastMsg as any).toolUse as Array<{ name: string; input?: any }> | undefined : undefined
  const thinking = lastMsg?.role === 'assistant' ? (lastMsg as any).thinking as string | undefined : undefined
  const latestTool = toolUse?.[toolUse.length - 1]

  let statusText = '\u6B63\u5728\u601D\u8003...'
  let statusDetail = ''

  if (latestTool) {
    const icon = TOOL_ICONS[latestTool.name] || '\u{1F9F0}'
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
    statusText = '\u{1F4AD} \u601D\u8003\u4E2D...'
  }

  return (
    <motion.div
      className="flex gap-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-purple-500/10 bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-purple-300">
        <Bot size={15} />
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '150ms' }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '300ms' }} />
          </span>
          <span className="text-xs text-gray-400">{statusText}</span>
          {toolUse && toolUse.length > 1 && (
            <span className="text-[10px] text-gray-600">({toolUse.length} {'\u4E2A\u64CD\u4F5C'})</span>
          )}
        </div>
        {statusDetail && (
          <span className="text-[10px] text-gray-600 font-mono truncate max-w-[400px]">{statusDetail}</span>
        )}
      </div>
    </motion.div>
  )
}

// ─── Main Component ───

interface MessageListProps {
  sessionId: string
  messages: ChatMessage[]
  streaming: boolean
  sessionStatus: string
  ready: boolean
  isChildSession: boolean
  chatError: string | null
  sessionName: string
}

export default function MessageList({
  sessionId,
  messages,
  streaming,
  sessionStatus,
  ready,
  isChildSession,
  chatError,
  sessionName,
}: MessageListProps) {
  const messageGroups = useMemo(() => groupMessages(messages, sessionId), [messages, sessionId])

  return (
    <>
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
          <h3 className="mt-3 text-lg font-semibold text-white">{sessionName}</h3>
          <p className="mt-2 leading-7 text-gray-500">
            {isChildSession ? '\u5B50Agent\u6267\u884C\u8BB0\u5F55\u5C06\u663E\u793A\u5728\u8FD9\u91CC\u3002' : '\u4F1A\u8BDD\u5DF2\u7ECF\u5C31\u7EEA\uFF0C\u8F93\u5165\u6D88\u606F\u5F00\u59CB\u5BF9\u8BDD\u3002'}
          </p>
        </div>
      ) : (
        messageGroups.map((group) => {
          if (group.type === 'tool_group' && group.convMessages) {
            const isLastGroup = group.index + group.messages.length >= messages.length
            const fileOps = extractFileChanges(group.convMessages)
            const stickerMsgs = group.convMessages.filter(
              (m) => m.toolName === 'send_sticker' && m.toolInput?.mood,
            )
            const nonStickerMsgs = group.convMessages.filter(
              (m) => m.toolName !== 'send_sticker',
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
            const isLastGroup = group.index + group.messages.length >= messages.length
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
            <MessageBubble key={`msg-${group.index}-${index}`} message={msg} isStreaming={streaming} />
          ))
        })
      )}

      <AnimatePresence>
        {(streaming || ['starting', 'running'].includes(sessionStatus)) && (messages.length === 0 || messages[messages.length - 1]?.role === 'user' || (messages[messages.length - 1]?.role === 'assistant' && !(messages[messages.length - 1] as any)?.content?.trim())) && (
          <StreamingIndicator messages={messages} />
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
    </>
  )
}

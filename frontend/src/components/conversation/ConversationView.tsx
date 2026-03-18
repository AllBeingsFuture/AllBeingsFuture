import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot } from 'lucide-react'
import type { Session } from '../../../bindings/allbeingsfuture/internal/models/models'
import type { ChatMessage } from '../../../bindings/allbeingsfuture/internal/models/models'
import { useSessionStore, type ChatUpdateEvent, type AgentUpdateEvent } from '../../stores/sessionStore'
import { useIpcEvent } from '../../hooks/useIpcEvent'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import SessionToolbar from './SessionToolbar'
import ToolOperationGroup from './ToolOperationGroup'
import FileChangeCard from './FileChangeCard'
import StickerCard from './StickerCard'
import ShellTerminalView from '../terminal/ShellTerminalView'
import { useUIStore } from '../../stores/uiStore'
import type { ConversationMessage, FileChangeInfo } from '../../types/conversationTypes'

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
    timestamp: new Date().toISOString(),
    toolName: msg.toolName,
    toolInput: msg.toolInput as Record<string, unknown> | undefined,
    isThinking: msg.isThinking,
    thinkingText: msg.isThinking ? msg.content : undefined,
  }
}

interface MessageGroup {
  type: 'message' | 'tool_group' | 'thinking'
  messages: ChatMessage[]
  convMessages?: ConversationMessage[]
  index: number
}

function groupMessages(messages: ChatMessage[], sessionId: string): MessageGroup[] {
  const groups: MessageGroup[] = []
  let currentToolGroup: ChatMessage[] | null = null
  let currentToolConvMsgs: ConversationMessage[] | null = null
  let toolGroupStartIndex = 0

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    if (msg.role === 'tool_use') {
      if (!currentToolGroup) {
        currentToolGroup = []
        currentToolConvMsgs = []
        toolGroupStartIndex = i
      }
      currentToolGroup.push(msg)
      currentToolConvMsgs!.push(toConversationMessage(msg, i, sessionId))
      continue
    }

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

    if (msg.role === 'thinking' || msg.isThinking) {
      groups.push({ type: 'thinking', messages: [msg], index: i })
    } else {
      groups.push({ type: 'message', messages: [msg], index: i })
    }
  }

  if (currentToolGroup) {
    groups.push({
      type: 'tool_group',
      messages: currentToolGroup,
      convMessages: currentToolConvMsgs!,
      index: toolGroupStartIndex,
    })
  }

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

export default function ConversationView({ session }: Props) {
  const messages = useSessionStore((state) => state.messages)
  const streaming = useSessionStore((state) => state.streaming)
  const chatError = useSessionStore((state) => state.chatError)
  const sendMessage = useSessionStore((state) => state.sendMessage)
  const pollChat = useSessionStore((state) => state.pollChat)
  const initProcess = useSessionStore((state) => state.initProcess)
  const handleChatUpdate = useSessionStore((state) => state.handleChatUpdate)
  const handleAgentUpdate = useSessionStore((state) => state.handleAgentUpdate)
  const stopProcess = useSessionStore((state) => state.stopProcess)
  const childToParent = useSessionStore((state) => state.childToParent)

  // Child agent sessions are managed by the parent — don't auto-init a bridge adapter for them
  const isChildSession = !!(childToParent[session.id] || (session as any).parentSessionId)

  const [ready, setReady] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const isNearBottomRef = useRef(true)
  const prevMsgCountRef = useRef(0)
  const lastEventTimeRef = useRef(0)
  const shouldAutoInit = useMemo(
    () => session.status === 'starting' || session.status === 'running',
    [session.status],
  )

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const threshold = 150
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  useIpcEvent<ChatUpdateEvent>('chat:update', (event) => {
    lastEventTimeRef.current = Date.now()
    handleChatUpdate(event)
  })

  useIpcEvent<AgentUpdateEvent>('agent:update', (event) => {
    handleAgentUpdate(event)
  })

  useEffect(() => {
    prevMsgCountRef.current = 0
    isNearBottomRef.current = true
  }, [session.id])

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      setReady(false)
      if (shouldAutoInit) {
        await initProcess(session.id)
      }
      if (!cancelled) setReady(true)
    }
    void boot()
    return () => { cancelled = true }
  }, [initProcess, session.id, shouldAutoInit])

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

    if (!isNearBottomRef.current) return

    if (previousCount === 0 && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    } else if (messages.length > previousCount) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streaming])

  const shellPanelVisible = useUIStore((state) => state.shellPanelVisible)
  const isEnded = ['completed', 'terminated', 'error'].includes(session.status)
  const messageGroups = useMemo(() => groupMessages(messages, session.id), [messages, session.id])
  const handleSend = useCallback((text: string, images?: Array<{data: string; mimeType: string}>) => (
    sendMessage(session.id, text, images)
  ), [sendMessage, session.id])
  const handleStop = useCallback(() => {
    void stopProcess(session.id)
  }, [session.id, stopProcess])
  const inputPlaceholder = ready ? '输入消息，Enter 发送' : '正在初始化...'

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="conversation-view">
      <SessionToolbar session={session} />

      <div ref={scrollContainerRef} onScroll={handleScroll} data-scroll-container className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          {messages.length === 0 && !streaming ? (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-sm text-gray-300">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-gray-600">{isChildSession ? 'Sub-Agent' : 'Conversation'}</p>
              <h3 className="mt-3 text-lg font-semibold text-white">{session.name}</h3>
              <p className="mt-2 leading-7 text-gray-500">
                {isChildSession ? '子Agent执行记录将显示在这里。' : '会话已经就绪，输入消息开始对话。'}
              </p>
            </div>
          ) : (
            messageGroups.map((group) => {
              if (group.type === 'tool_group' && group.convMessages) {
                const isLastGroup = group.index + group.messages.length >= messages.length
                const fileOps = extractFileChanges(group.convMessages)
                // Separate sticker tool_use messages from regular tool operations
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

              if (group.type === 'thinking') {
                const msg = group.messages[0]
                return (
                  <div
                    key={`think-${group.index}`}
                    className="my-1 mx-2 flex max-h-[200px] items-start gap-2 overflow-hidden rounded-xl border border-dashed border-purple-500/20 bg-purple-500/[0.03] px-3 py-2"
                  >
                    <span className="mt-0.5 text-sm animate-pulse">思</span>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="mb-1 text-xs italic text-purple-300/80">思考中...</div>
                      {msg.content && (
                        <div className="max-h-[150px] overflow-y-auto whitespace-pre-wrap font-mono text-xs text-text-muted/60">
                          {msg.content}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              return group.messages.map((msg, index) => (
                <MessageBubble key={`msg-${group.index}-${index}`} message={msg} isStreaming={streaming} />
              ))
            })
          )}

          <AnimatePresence>
            {(streaming || ['starting', 'running'].includes(session.status)) && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
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
                <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span className="text-xs text-gray-500">正在思考...</span>
                </div>
              </motion.div>
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

          <div ref={bottomRef} />
        </div>
      </div>

      {(!isEnded || isChildSession) && (
        <MessageInput
          key={session.id}
          sessionId={session.id}
          disabled={!ready}
          streaming={streaming}
          placeholder={inputPlaceholder}
          onSend={handleSend}
          onStop={handleStop}
        />
      )}

      {shellPanelVisible && (
        <div className="h-[200px] shrink-0 border-t border-white/10">
          <ShellTerminalView />
        </div>
      )}
    </section>
  )
}

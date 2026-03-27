import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Session } from '../../../bindings/allbeingsfuture/internal/models/models'
import { useSessionStore, type ChatUpdateEvent, type AgentUpdateEvent } from '../../stores/sessionStore'
import { useIpcEvent } from '../../hooks/useIpcEvent'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import SessionToolbar from './SessionToolbar'
import ShellTerminalView from '../terminal/ShellTerminalView'
import { usePanelStore } from '../../stores/panelStore'
import { useConversationScroll } from './useConversationScroll'

interface Props {
  session: Session
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
    handleAgentUpdate: state.handleAgentUpdate,
    stopProcess: state.stopProcess,
    childToParent: state.childToParent,
  })))

  // Child agent sessions are managed by the parent — don't auto-init a bridge adapter for them
  const isChildSession = !!(childToParent?.[session.id] || (session as any).parentSessionId)

  const [ready, setReady] = useState(false)
  const lastEventTimeRef = useRef(0)

  const { bottomRef, scrollContainerRef, handleScroll } = useConversationScroll({
    sessionId: session.id,
    messagesLength: messages.length,
    streaming,
  })

  useIpcEvent<ChatUpdateEvent>('chat:update', (event) => {
    lastEventTimeRef.current = Date.now()
    handleChatUpdate(event)
  })

  useIpcEvent<AgentUpdateEvent>('agent:update', (event) => {
    handleAgentUpdate(event)
  })

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

  const shellPanelVisible = usePanelStore((state) => state.shellPanelVisible)
  const isEnded = ['completed', 'terminated', 'error'].includes(session.status)
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
          <MessageList
            sessionId={session.id}
            messages={messages}
            streaming={streaming}
            sessionStatus={session.status}
            ready={ready}
            isChildSession={isChildSession}
            chatError={chatError}
            sessionName={session.name}
          />
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

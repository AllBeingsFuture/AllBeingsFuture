import { create } from 'zustand'
import type { ChatMessage, Session, SessionConfig } from '../../bindings/allbeingsfuture/internal/models/models'
import {
  chatCore,
  collectSessionSubtreeIds,
  mergeLoadedSessions,
  type AgentInfo,
  type ParentBinding,
  type ChatUpdateEvent,
  type ChatPatchEvent,
  type AgentUpdateEvent,
  type ChatSnapshot,
} from '../core/chat/chatCore'
import { createAgentStreamBatcher } from '../core/chat/agentStreamBatch'
import {
  createAgentSessionStreamState,
  isAgentStreamActive,
  reduceAgentStreamEvent,
  requestAgentStreamCancellation,
  resolveAgentStreamPermission,
} from '../core/chat/agentStreamCore'
import { respondToAgentPermission } from '../hooks/agentStreamIpc'
import type { AgentSessionStreamState, AgentStreamEvent } from '../types/agentStreamTypes'
import { useDraftStore } from './draftStore'

interface SessionState extends ChatSnapshot {
  agentStreams: Record<string, AgentSessionStreamState>
  agentStreamMessages: Record<string, ChatMessage[]>
  loading: boolean
  /** In-flight flush locks so pending queues do not re-enter while a send is running. */
  pendingFlushInFlight: Record<string, boolean>
  load: () => Promise<void>
  create: (config: SessionConfig) => Promise<Session | null>
  select: (id: string | null) => void
  rename: (id: string, name: string) => Promise<void>
  smartRename: (id: string) => Promise<string | null>
  remove: (id: string) => Promise<void>
  end: (id: string) => Promise<void>
  initProcess: (id: string) => Promise<void>
  sendMessage: (id: string, text: string, images?: Array<{data: string, mimeType: string}>) => Promise<void>
  pollChat: (id: string) => Promise<void>
  handleChatUpdate: (data: ChatUpdateEvent) => void
  handleChatPatch: (data: ChatPatchEvent) => void
  handleAgentUpdate: (data: AgentUpdateEvent) => void
  handleAgentStreamEvent: (data: AgentStreamEvent) => void
  respondToPermission: (sessionId: string, requestId: string, optionId: string) => Promise<void>
  stopProcess: (id: string) => Promise<void>
  resumeSession: (oldSessionId: string) => Promise<{ success: boolean; sessionId?: string; error?: string }>
  spawnChild: (parentSessionId: string, name: string, prompt: string) => Promise<string | null>
  sendToChild: (parentSessionId: string, childSessionId: string, message: string) => Promise<void>
  /** User closes a persistent child from the sidebar (not auto-on-idle). */
  closeChild: (parentSessionId: string, childSessionId: string) => Promise<void>
  fetchAllAgents: () => Promise<void>
  markWorktreeMerged: (id: string) => Promise<void>
  enterWorktree: (id: string) => Promise<Session | null>
  /** Dispatch the next composer-queued message after a session becomes idle. */
  flushPendingMessages: (sessionId: string) => Promise<void>
}

function snapshotOf(state: SessionState): ChatSnapshot {
  return {
    sessions: state.sessions,
    selectedId: state.selectedId,
    messages: state.messages,
    streaming: state.streaming,
    chatError: state.chatError,
    agents: state.agents,
    childToParent: state.childToParent,
  }
}

/** Bound after store creation so the rAF batcher can reduce with latest get/set. */
let applyAgentStreamBatch: (sessionId: string, events: AgentStreamEvent[]) => void = () => {}

function createStoreAgentStreamBatcher() {
  return createAgentStreamBatcher({
    onFlush: (sessionId, events) => {
      applyAgentStreamBatch(sessionId, events)
    },
  })
}

let agentStreamBatcher = createStoreAgentStreamBatcher()

/**
 * Bumped on local sessions-set mutations (create/remove) so in-flight load()
 * that started with a stale GetAll cannot overwrite newer local state.
 */
let sessionsEpoch = 0

/** Drain pending stream batches (tests / teardown). */
export function flushAgentStreamBatches(sessionId?: string): void {
  agentStreamBatcher.flush(sessionId)
}

/** Drop pending queues and recreate batcher (test isolation). */
export function disposeAgentStreamBatches(): void {
  agentStreamBatcher.dispose()
  agentStreamBatcher = createStoreAgentStreamBatcher()
}

/** Reset sessions epoch (tests only). */
export function resetSessionsEpochForTests(): void {
  sessionsEpoch = 0
}

export const useSessionStore = create<SessionState>((set, get) => {
  applyAgentStreamBatch = (sessionId, events) => {
    if (events.length === 0) return

    // Reduce inside set() so a concurrent handleChatPatch (user append) that
    // lands mid-batch is visible in `current` and not overwritten.
    let shouldFlushPending = false
    set(current => {
      const isSelected = current.selectedId === sessionId
      let currentStream = current.agentStreams[sessionId]
      let messages = current.agentStreamMessages[sessionId] || (isSelected ? current.messages : [])
      let lastApplied: ReturnType<typeof reduceAgentStreamEvent> | null = null

      for (const event of events) {
        const reduction = reduceAgentStreamEvent(messages, currentStream, event)
        if (reduction.ignored) continue
        messages = reduction.messages
        currentStream = reduction.stream
        lastApplied = reduction
      }

      if (!lastApplied) return current

      const applied = lastApplied
      shouldFlushPending = !applied.streaming
      return {
        agentStreams: { ...current.agentStreams, [sessionId]: applied.stream },
        agentStreamMessages: { ...current.agentStreamMessages, [sessionId]: applied.messages },
        sessions: chatCore.syncRuntimeStatus(current.sessions, sessionId, applied.streaming),
        ...(isSelected ? {
          messages: applied.messages,
          streaming: applied.streaming,
          chatError: applied.error,
        } : {}),
      }
    })

    if (shouldFlushPending) {
      void get().flushPendingMessages(sessionId)
    }
  }

  return {
  sessions: [],
  selectedId: null,
  loading: false,
  messages: [],
  streaming: false,
  chatError: '',
  agents: {},
  childToParent: {},
  agentStreams: {},
  agentStreamMessages: {},
  pendingFlushInFlight: {},

  load: async () => {
    const epochAtStart = sessionsEpoch
    set({ loading: true })
    try {
      const incoming = await chatCore.load()
      // Discard stale GetAll if create/remove mutated sessions while we awaited.
      if (epochAtStart !== sessionsEpoch) return
      set(current => ({
        sessions: mergeLoadedSessions(current.sessions, incoming),
      }))
    } finally {
      set({ loading: false })
    }
  },

  create: async (config) => {
    try {
      const result = await chatCore.create(snapshotOf(get()), config)
      if (result.session) {
        const session = result.session
        sessionsEpoch++
        set(current => ({
          sessions: [session, ...current.sessions.filter(s => s.id !== session.id)],
        }))
      }
      return result.session
    } catch (err) {
      console.error('SessionService.Create failed:', err)
      throw err
    }
  },

  select: (id) => {
    const state = get()
    const patch = chatCore.select(snapshotOf(state), id)
    if (!patch) return

    // Snapshot the live transcript before clearing so parent↔child switches
    // do not lose messages that only lived in the selected `messages` array.
    let agentStreamMessages = state.agentStreamMessages
    if (state.selectedId && state.selectedId !== id && state.messages.length > 0) {
      agentStreamMessages = {
        ...agentStreamMessages,
        [state.selectedId]: state.messages,
      }
    }

    const stream = id ? state.agentStreams[id] : undefined
    const bufferedMessages = id ? agentStreamMessages[id] : undefined
    set({
      ...patch,
      agentStreamMessages,
      ...(bufferedMessages ? { messages: bufferedMessages } : {}),
      streaming: isAgentStreamActive(stream),
    })
    if (id) void get().pollChat(id)
  },

  rename: async (id, name) => {
    const nextName = name.trim()
    if (!nextName) return
    set(await chatCore.rename(snapshotOf(get()), id, nextName))
  },

  smartRename: async (id) => {
    const result = await chatCore.smartRename(snapshotOf(get()), id)
    if (result.patch) set(result.patch)
    return result.nextName
  },

  remove: async (id) => {
    const before = get()
    const targetIds = collectSessionSubtreeIds(before.sessions, id)
    const patch = await chatCore.remove(snapshotOf(before), id)
    sessionsEpoch++
    set(current => {
      const agentStreams = { ...current.agentStreams }
      const agentStreamMessages = { ...current.agentStreamMessages }
      for (const sessionId of targetIds) {
        delete agentStreams[sessionId]
        delete agentStreamMessages[sessionId]
      }
      // Prefer current sessions filtered by targetIds so concurrent creates are not dropped.
      const sessions = current.sessions.filter(session => !targetIds.has(session.id))
      const resetSelection = current.selectedId != null && targetIds.has(current.selectedId)
      return {
        ...patch,
        sessions,
        selectedId: resetSelection ? null : current.selectedId,
        agentStreams,
        agentStreamMessages,
        ...(resetSelection ? { messages: [], streaming: false, chatError: '' } : {}),
      }
    })
  },

  end: async (id) => {
    await chatCore.end(id)
    await get().load()
    // Only drop stream buffers if the session disappeared after end/load.
    set(current => {
      if (current.sessions.some(session => session.id === id)) return current
      if (!(id in current.agentStreams) && !(id in current.agentStreamMessages)) {
        return current
      }
      const agentStreams = { ...current.agentStreams }
      const agentStreamMessages = { ...current.agentStreamMessages }
      delete agentStreams[id]
      delete agentStreamMessages[id]
      return { agentStreams, agentStreamMessages }
    })
  },

  initProcess: async (id) => {
    set({ chatError: '' })
    try {
      set(await chatCore.init(snapshotOf(get()), id))
    } catch (err) {
      set(chatCore.buildInitError(err))
      throw err
    }
  },

  sendMessage: async (id, text, images) => {
    set(chatCore.startSend(snapshotOf(get()), id))
    try {
      await chatCore.send(id, text, images)
    } catch (err) {
      set(chatCore.buildSendError(snapshotOf(get()), id, err))
      throw err
    }
  },

  flushPendingMessages: async (sessionId) => {
    const state = get()
    if (state.pendingFlushInFlight[sessionId]) return
    if (isAgentStreamActive(state.agentStreams[sessionId])) return
    if (state.selectedId === sessionId && state.streaming) return

    const pending = useDraftStore.getState().getPending(sessionId)
    if (pending.length === 0) return

    set(current => ({
      pendingFlushInFlight: { ...current.pendingFlushInFlight, [sessionId]: true },
    }))

    const next = useDraftStore.getState().shiftPending(sessionId)
    if (!next) {
      set(current => {
        const { [sessionId]: _, ...rest } = current.pendingFlushInFlight
        return { pendingFlushInFlight: rest }
      })
      return
    }

    try {
      await get().sendMessage(sessionId, next.text, next.images)
    } catch {
      // Put the message back at the front so a later idle event can retry.
      const remaining = useDraftStore.getState().getPending(sessionId)
      useDraftStore.getState().setPending(sessionId, [next, ...remaining])
    } finally {
      set(current => {
        const { [sessionId]: _, ...rest } = current.pendingFlushInFlight
        return { pendingFlushInFlight: rest }
      })
    }
  },

  pollChat: async (id) => {
    if (isAgentStreamActive(get().agentStreams[id])) return
    try {
      const patch = await chatCore.poll(snapshotOf(get()), id)
      if (patch) {
        set(patch)
        // Always keep the per-session buffer warm, even for background sessions.
        if (patch.messages) {
          set(state => ({ agentStreamMessages: { ...state.agentStreamMessages, [id]: patch.messages! } }))
        }
      }
      // flushPendingMessages itself re-checks selected streaming / agent stream activity.
      void get().flushPendingMessages(id)
    } catch (err: unknown) {
      set({ chatError: chatCore.localizeChatError(err instanceof Error ? err.message : String(err)) })
    }
  },

  handleChatUpdate: (data) => {
    if (isAgentStreamActive(get().agentStreams[data.sessionId])) return
    const state = get()
    const patch = chatCore.applyChatUpdate(snapshotOf(state), data)
    const messages = data.messages ?? []
    set({
      ...(patch || {}),
      agentStreamMessages: {
        ...state.agentStreamMessages,
        [data.sessionId]: messages,
      },
    })
    if (!data.streaming) {
      void get().flushPendingMessages(data.sessionId)
    }
  },

  handleChatPatch: (data) => {
    const state = get()
    const streamActive = isAgentStreamActive(state.agentStreams[data.sessionId])
    const isUserAppend = data.type === 'append' && data.message?.role === 'user'

    // Normalized agent:stream owns the live transcript, but user turns still
    // arrive via legacy chat:patch and must never be dropped — including when
    // the user has already switched to a child session.
    if (streamActive && !isUserAppend) {
      const sessions = chatCore.syncRuntimeStatus(state.sessions, data.sessionId, data.streaming)
      if (sessions !== state.sessions) set({ sessions })
      if (!data.streaming) void get().flushPendingMessages(data.sessionId)
      return
    }

    const selected = state.selectedId === data.sessionId
    const baseMessages = selected
      ? state.messages
      : (state.agentStreamMessages[data.sessionId] || [])
    const nextMessages = chatCore.applyMessagePatch(baseMessages, data)
    const sessions = chatCore.syncRuntimeStatus(state.sessions, data.sessionId, data.streaming)

    set({
      sessions,
      agentStreamMessages: {
        ...state.agentStreamMessages,
        [data.sessionId]: nextMessages,
      },
      ...(selected ? {
        messages: nextMessages,
        streaming: data.streaming,
        chatError: chatCore.localizeChatError(data.error || ''),
      } : {}),
    })

    if (!data.streaming) {
      void get().flushPendingMessages(data.sessionId)
    }
  },

  handleAgentUpdate: (data) => {
    const patch = chatCore.applyAgentUpdate(snapshotOf(get()), data)
    if (patch) set(patch)
    // Closed agents must not trigger a full reload that could flash UI state.
    if (data.removed) return
    if (data.agent?.childSessionId && !get().sessions.find(session => session.id === data.agent.childSessionId)) {
      get().load().catch(() => {})
    }
  },

  handleAgentStreamEvent: (data) => {
    // Batch high-frequency deltas to one store set per frame; terminal/tool events flush immediately.
    agentStreamBatcher.push(data)
  },

  respondToPermission: async (sessionId, requestId, optionId) => {
    await respondToAgentPermission({ sessionId, requestId, optionId })
    const state = get()
    const current = state.agentStreams[sessionId]
    const nextStream = resolveAgentStreamPermission(current, requestId)
    if (nextStream === current) return
    set({
      agentStreams: { ...state.agentStreams, [sessionId]: nextStream },
      ...(state.selectedId === sessionId ? { streaming: true } : {}),
    })
  },

  stopProcess: async (id) => {
    const before = get()
    const cancelling = requestAgentStreamCancellation(before.agentStreams[id])
    set({
      agentStreams: { ...before.agentStreams, [id]: cancelling },
      ...(before.selectedId === id ? { streaming: true } : {}),
    })
    try {
      await chatCore.stop(id)
      const state = get()
      const current = state.agentStreams[id] || createAgentSessionStreamState()
      set({
        agentStreams: {
          ...state.agentStreams,
          [id]: { ...current, phase: 'cancelled', permission: undefined },
        },
        sessions: chatCore.syncRuntimeStatus(state.sessions, id, false),
        ...(state.selectedId === id ? { streaming: false } : {}),
      })
      await get().load()
    } catch (err) {
      const state = get()
      const message = err instanceof Error ? err.message : String(err)
      const current = state.agentStreams[id] || createAgentSessionStreamState()
      set({
        agentStreams: {
          ...state.agentStreams,
          [id]: { ...current, phase: 'error', terminalReason: message, permission: undefined },
        },
        sessions: chatCore.syncRuntimeStatus(state.sessions, id, false),
        ...(state.selectedId === id ? { streaming: false, chatError: message } : {}),
      })
      throw err
    }
  },

  resumeSession: async (oldSessionId) => {
    try {
      const result = await chatCore.resume(oldSessionId)
      if (result?.success) {
        await get().load()
        set({ selectedId: result.sessionId ?? null })
        return result
      }
      return result || { success: false, error: 'Resume failed' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  spawnChild: async (parentSessionId, name, prompt) => {
    try {
      const result = await chatCore.spawnChild(parentSessionId, name, prompt)
      if (result?.childSessionId) {
        await get().load()
        await get().fetchAllAgents()
        return result.childSessionId
      }
      return null
    } catch (err) {
      console.error('SpawnChildSession failed:', err)
      return null
    }
  },

  sendToChild: async (parentSessionId, childSessionId, message) => {
    await chatCore.sendToChild(parentSessionId, childSessionId, message)
  },

  closeChild: async (parentSessionId, childSessionId) => {
    // Optimistic drop so sidebar clears immediately even if event races
    const optimistic = chatCore.applyAgentUpdate(snapshotOf(get()), {
      parentSessionId,
      removed: true,
      agent: {
        agentId: `persistent-${childSessionId}`,
        name: '',
        parentSessionId,
        childSessionId,
        status: 'cancelled',
        workDir: '',
        createdAt: '',
        completedAt: new Date().toISOString(),
      },
    })
    if (optimistic) set(optimistic)
    try {
      await chatCore.closeChild(parentSessionId, childSessionId)
    } catch (err) {
      console.error('CloseChildSession failed:', err)
      // Recover list if backend close failed
      await get().fetchAllAgents()
      throw err
    }
  },

  fetchAllAgents: async () => {
    try {
      const patch = await chatCore.fetchAllAgents(snapshotOf(get()))
      if (patch) set(patch)
    } catch (err) {
      console.warn('fetchAllAgents failed:', err)
    }
  },

  markWorktreeMerged: async (id) => {
    await chatCore.markWorktreeMerged(id)
    await get().load()
  },

  enterWorktree: async (id) => {
    try {
      const result = await chatCore.enterWorktree(snapshotOf(get()), id)
      if (result.patch) set(result.patch)
      // 工作目录变更后重新初始化，使 Agent 进程切到 worktree
      try {
        await get().initProcess(id)
      } catch (err) {
        console.warn('enterWorktree: re-init after workdir change failed:', err)
      }
      return result.session
    } catch (err) {
      console.error('enterWorktree failed:', err)
      throw err
    }
  },
  }
})

export type {
  AgentInfo,
  ParentBinding,
  ChatUpdateEvent,
  ChatPatchEvent,
  AgentUpdateEvent,
}

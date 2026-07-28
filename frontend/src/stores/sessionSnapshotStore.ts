import { create } from 'zustand'
import type { ChatMessage, Session, SessionConfig } from '../../bindings/allbeingsfuture/internal/models/models'
import {
  chatCore,
  type AgentInfo,
  type ParentBinding,
  type ChatUpdateEvent,
  type ChatPatchEvent,
  type AgentUpdateEvent,
  type ChatSnapshot,
} from '../core/chat/chatCore'
import {
  createAgentSessionStreamState,
  isAgentStreamActive,
  reduceAgentStreamEvent,
  requestAgentStreamCancellation,
  resolveAgentStreamPermission,
} from '../core/chat/agentStreamCore'
import { respondToAgentPermission } from '../hooks/agentStreamIpc'
import type { AgentSessionStreamState, AgentStreamEvent } from '../types/agentStreamTypes'

interface SessionState extends ChatSnapshot {
  agentStreams: Record<string, AgentSessionStreamState>
  agentStreamMessages: Record<string, ChatMessage[]>
  loading: boolean
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
  fetchAllAgents: () => Promise<void>
  markWorktreeMerged: (id: string) => Promise<void>
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

export const useSessionStore = create<SessionState>((set, get) => ({
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

  load: async () => {
    set({ loading: true })
    try {
      set(await chatCore.load(snapshotOf(get())))
    } finally {
      set({ loading: false })
    }
  },

  create: async (config) => {
    try {
      const result = await chatCore.create(snapshotOf(get()), config)
      if (result.patch) set(result.patch)
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
    const stream = id ? state.agentStreams[id] : undefined
    const bufferedMessages = id ? state.agentStreamMessages[id] : undefined
    set({
      ...patch,
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
    set(await chatCore.remove(snapshotOf(get()), id))
  },

  end: async (id) => {
    await chatCore.end(id)
    await get().load()
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

  pollChat: async (id) => {
    if (isAgentStreamActive(get().agentStreams[id])) return
    try {
      const patch = await chatCore.poll(snapshotOf(get()), id)
      if (patch) {
        set(patch)
        if (get().selectedId === id && patch.messages) {
          set(state => ({ agentStreamMessages: { ...state.agentStreamMessages, [id]: patch.messages! } }))
        }
      }
    } catch (err: unknown) {
      set({ chatError: chatCore.localizeChatError(err instanceof Error ? err.message : String(err)) })
    }
  },

  handleChatUpdate: (data) => {
    if (isAgentStreamActive(get().agentStreams[data.sessionId])) return
    const patch = chatCore.applyChatUpdate(snapshotOf(get()), data)
    if (patch) {
      set(patch)
      if (get().selectedId === data.sessionId && patch.messages) {
        set(state => ({ agentStreamMessages: { ...state.agentStreamMessages, [data.sessionId]: patch.messages! } }))
      }
    }
  },

  handleChatPatch: (data) => {
    if (isAgentStreamActive(get().agentStreams[data.sessionId])) return
    const patch = chatCore.applyChatPatch(snapshotOf(get()), data)
    set(patch)
    if (get().selectedId === data.sessionId && patch.messages) {
      set(state => ({ agentStreamMessages: { ...state.agentStreamMessages, [data.sessionId]: patch.messages! } }))
    }
  },

  handleAgentUpdate: (data) => {
    const patch = chatCore.applyAgentUpdate(snapshotOf(get()), data)
    if (patch) set(patch)
    if (data.agent?.childSessionId && !get().sessions.find(session => session.id === data.agent.childSessionId)) {
      get().load().catch(() => {})
    }
  },

  handleAgentStreamEvent: (data) => {
    const state = get()
    const currentStream = state.agentStreams[data.sessionId]
    const selected = state.selectedId === data.sessionId
    const bufferedMessages = state.agentStreamMessages[data.sessionId]
    const reduction = reduceAgentStreamEvent(bufferedMessages || (selected ? state.messages : []), currentStream, data)
    if (reduction.ignored) return

    set({
      agentStreams: { ...state.agentStreams, [data.sessionId]: reduction.stream },
      agentStreamMessages: { ...state.agentStreamMessages, [data.sessionId]: reduction.messages },
      sessions: chatCore.syncRuntimeStatus(state.sessions, data.sessionId, reduction.streaming),
      ...(selected ? {
        messages: reduction.messages,
        streaming: reduction.streaming,
        chatError: reduction.error,
      } : {}),
    })
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
}))

export type {
  AgentInfo,
  ParentBinding,
  ChatUpdateEvent,
  ChatPatchEvent,
  AgentUpdateEvent,
}

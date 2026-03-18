import { create } from 'zustand'
import { SessionService, ProcessService } from '../../bindings/allbeingsfuture/internal/services'
import { ResumeSession as ResumeSessionAPI, ListAllAgents as ListAllAgentsAPI, SpawnChildSession, SendToChild } from '../../bindings/allbeingsfuture/internal/services/processservice'
import type { Session, SessionConfig, ChatMessage, ChatState } from '../../bindings/allbeingsfuture/internal/models/models'

const ACTIVE_RUNTIME_STATUSES = new Set<Session['status']>(['starting', 'running'])

function syncRuntimeStatus(sessions: Session[], sessionId: string, streaming: boolean): Session[] {
  let changed = false
  const nextSessions = sessions.map((session) => {
    if (session.id !== sessionId) return session

    // Don't override terminal statuses for child sessions — their status is
    // authoritative from the backend (AgentTracker + SessionService).
    const isChildSession = !!(session as any).parentSessionId
    const isTerminal = ['completed', 'terminated', 'error'].includes(session.status)
    if (isChildSession && isTerminal) return session

    let nextStatus = session.status
    if (streaming) {
      if (session.status === 'idle' || session.status === 'waiting_input') {
        nextStatus = 'running'
      }
    } else if (ACTIVE_RUNTIME_STATUSES.has(session.status)) {
      nextStatus = 'idle'
    }

    if (nextStatus === session.status) return session
    changed = true
    return { ...session, status: nextStatus }
  })

  return changed ? nextSessions : sessions
}

export interface AgentInfo {
  agentId: string
  name: string
  parentSessionId: string
  childSessionId: string
  status: 'pending' | 'running' | 'idle' | 'completed' | 'failed' | 'cancelled'
  workDir: string
  createdAt: string
  completedAt?: string
  providerId?: string
}

/** Reverse lookup: childSessionId → parent info + agent metadata */
export interface ParentBinding {
  parentSessionId: string
  agentId: string
  agentName: string
}

interface SessionState {
  sessions: Session[]
  selectedId: string | null
  loading: boolean
  messages: ChatMessage[]
  streaming: boolean
  chatError: string
  agents: Record<string, AgentInfo[]>
  /** childSessionId → ParentBinding reverse index */
  childToParent: Record<string, ParentBinding>
  /** Locally cached image data URLs for user messages, ordered by send time */
  sentImages: { content: string; images: string[] }[]

  load: () => Promise<void>
  create: (config: SessionConfig) => Promise<Session | null>
  select: (id: string | null) => void
  remove: (id: string) => Promise<void>
  end: (id: string) => Promise<void>
  initProcess: (id: string) => Promise<void>
  sendMessage: (id: string, text: string, images?: Array<{data: string, mimeType: string}>) => Promise<void>
  pollChat: (id: string) => Promise<void>
  handleChatUpdate: (data: ChatUpdateEvent) => void
  handleAgentUpdate: (data: AgentUpdateEvent) => void
  stopProcess: (id: string) => Promise<void>
  resumeSession: (oldSessionId: string) => Promise<{ success: boolean; sessionId?: string; error?: string }>
  spawnChild: (parentSessionId: string, name: string, prompt: string) => Promise<string | null>
  sendToChild: (parentSessionId: string, childSessionId: string, message: string) => Promise<void>
  fetchAllAgents: () => Promise<void>
  markWorktreeMerged: (id: string) => Promise<void>
}

/** Shape of the `chat:update` event payload emitted by the backend. */
export interface ChatUpdateEvent {
  sessionId: string
  messages: ChatMessage[]
  streaming: boolean
  error: string
}

/** Shape of the `agent:update` event payload for sub-agent lifecycle. */
export interface AgentUpdateEvent {
  parentSessionId: string
  agent: AgentInfo
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
  sentImages: [],

  load: async () => {
    set({ loading: true })
    try {
      const sessions = await SessionService.GetAll()
      set({ sessions: sessions ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  create: async (config) => {
    try {
      const session = await SessionService.Create(config)
      if (session) set(s => ({ sessions: [session, ...s.sessions] }))
      return session
    } catch (err) {
      console.error('SessionService.Create failed:', err)
      throw err
    }
  },

  select: (id) => {
    // Skip reset if already viewing this session — avoids chat history flash
    if (id === get().selectedId) return
    set({ selectedId: id, messages: [], chatError: '', sentImages: [] })
    // Don't reset streaming here — let pollChat fetch the real state from backend.
    // This prevents showing a "ready" UI while the backend is still streaming.
    if (id) void get().pollChat(id)
  },

  remove: async (id) => {
    // Stop parent and all child processes
    const { sessions } = get()
    const children = sessions.filter(s => (s as any).parentSessionId === id)
    for (const child of children) {
      try { await ProcessService.StopProcess(child.id) } catch {}
    }
    try { await ProcessService.StopProcess(id) } catch {}
    // DB delete cascades to children
    await SessionService.Delete(id)
    const childIds = new Set(children.map(c => c.id))
    set(s => ({
      sessions: s.sessions.filter(x => x.id !== id && !childIds.has(x.id)),
      selectedId: (s.selectedId === id || childIds.has(s.selectedId!)) ? null : s.selectedId,
    }))
  },

  end: async (id) => {
    try { await ProcessService.StopProcess(id) } catch {}
    await SessionService.End(id)
    await get().load()
  },

  initProcess: async (id) => {
    set({ chatError: '' })
    try {
      await ProcessService.InitSession(id)
      await get().load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      set({ chatError: message })
      throw err
    }
  },

  sendMessage: async (id, text, images) => {
    set((state) => ({
      chatError: '',
      sessions: syncRuntimeStatus(state.sessions, id, true),
      ...(state.selectedId === id ? { streaming: true } : {}),
    }))
    try {
      // Cache image data URLs locally so we can display them in the conversation
      if (images && images.length > 0) {
        const dataUrls = images.map(img => `data:${img.mimeType};base64,${img.data}`)
        const content = text || '请看图片'
        set(s => ({ sentImages: [...s.sentImages, { content, images: dataUrls }] }))
        await ProcessService.SendMessageWithImages(id, text, images)
      } else {
        await ProcessService.SendMessage(id, text)
      }
    } catch (err: unknown) {
      set((state) => ({
        chatError: err instanceof Error ? err.message : String(err),
        sessions: syncRuntimeStatus(state.sessions, id, false),
        ...(state.selectedId === id ? { streaming: false } : {}),
      }))
    }
  },

  pollChat: async (id) => {
    try {
      const state: ChatState | null = await ProcessService.GetChatState(id)
      if (state) {
        set((prev) => ({
          messages: state.messages ?? [],
          streaming: state.streaming,
          chatError: state.error || '',
          sessions: syncRuntimeStatus(prev.sessions, id, state.streaming),
        }))
      }
    } catch (err: unknown) {
      set({ chatError: err instanceof Error ? err.message : String(err) })
    }
  },

  handleChatUpdate: (data) => {
    const { selectedId } = get()
    set((state) => {
      const next: Partial<SessionState> = {
        sessions: syncRuntimeStatus(state.sessions, data.sessionId, data.streaming),
      }

      if (data.sessionId === selectedId) {
        next.messages = data.messages ?? []
        next.streaming = data.streaming
        next.chatError = data.error || ''
      }

      return next
    })
  },

  handleAgentUpdate: (data) => {
    const { parentSessionId, agent } = data
    if (!parentSessionId || !agent) return

    set((state) => {
      // Update agents grouped by parent
      const prevList = state.agents[parentSessionId] || []
      const idx = prevList.findIndex(a => a.agentId === agent.agentId)
      const nextList = idx >= 0
        ? prevList.map((a, i) => i === idx ? agent : a)
        : [...prevList, agent]

      const nextAgents = { ...state.agents, [parentSessionId]: nextList }

      // Update reverse index
      const nextChildToParent = { ...state.childToParent }
      if (agent.childSessionId) {
        nextChildToParent[agent.childSessionId] = {
          parentSessionId,
          agentId: agent.agentId,
          agentName: agent.name,
        }
      }

      // If the child session is new, add it to sessions list
      let nextSessions = state.sessions
      if (agent.childSessionId && !state.sessions.find(s => s.id === agent.childSessionId)) {
        // Reload sessions from backend to pick up the new child
        void get().load()
      }

      return {
        agents: nextAgents,
        childToParent: nextChildToParent,
        sessions: nextSessions,
      }
    })
  },

  stopProcess: async (id) => {
    await ProcessService.StopProcess(id)
    await get().load()
  },

  resumeSession: async (oldSessionId) => {
    try {
      const result = await ResumeSessionAPI(oldSessionId)
      if (result?.success) {
        await get().load()
        set({ selectedId: result.sessionId })
        return result
      }
      return result || { success: false, error: 'Resume failed' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  spawnChild: async (parentSessionId, name, prompt) => {
    try {
      const result = await SpawnChildSession(parentSessionId, { name, prompt })
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
    await SendToChild(parentSessionId, childSessionId, message)
  },

  fetchAllAgents: async () => {
    try {
      const grouped: Record<string, AgentInfo[]> = {}
      const reverseMap: Record<string, ParentBinding> = {}

      // 1. Primary source: ListAllAgents API (in-memory + DB fallback)
      const result = await ListAllAgentsAPI() as AgentInfo[] | undefined
      const seenChildIds = new Set<string>()
      if (result && Array.isArray(result)) {
        for (const agent of result) {
          const pid = agent.parentSessionId
          if (!pid) continue
          if (!grouped[pid]) grouped[pid] = []
          grouped[pid].push(agent)
          seenChildIds.add(agent.childSessionId)
          reverseMap[agent.childSessionId] = {
            parentSessionId: pid,
            agentId: agent.agentId,
            agentName: agent.name,
          }
        }
      }

      // 2. Fallback: derive parent-child from session.parentSessionId field
      const sessions = get().sessions
      for (const sess of sessions) {
        const pid = (sess as any).parentSessionId as string | undefined
        if (!pid || seenChildIds.has(sess.id)) continue
        const agentInfo: AgentInfo = {
          agentId: 'session-' + sess.id,
          name: sess.name,
          parentSessionId: pid,
          childSessionId: sess.id,
          status: (['starting', 'running', 'waiting_input'].includes(sess.status))
            ? 'running'
            : sess.status === 'idle' ? 'idle'
            : sess.status === 'error' ? 'failed'
            : sess.status === 'terminated' ? 'cancelled'
            : 'completed',
          workDir: sess.workingDirectory,
          createdAt: sess.startedAt ? String(sess.startedAt) : '',
          providerId: sess.providerId,
        }
        if (!grouped[pid]) grouped[pid] = []
        grouped[pid].push(agentInfo)
        reverseMap[sess.id] = {
          parentSessionId: pid,
          agentId: agentInfo.agentId,
          agentName: sess.name,
        }
      }

      // Only update state if agents data actually changed to avoid unnecessary re-renders
      const prev = get().agents
      if (JSON.stringify(prev) !== JSON.stringify(grouped)) {
        set({ agents: grouped, childToParent: reverseMap })
      }
    } catch { /* ignore */ }
  },

  markWorktreeMerged: async (id) => {
    await SessionService.MarkWorktreeMerged(id)
    await get().load()
  },
}))

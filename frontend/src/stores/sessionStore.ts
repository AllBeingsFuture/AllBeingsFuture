import { create } from 'zustand'
import { SessionService, ProcessService, GitService } from '../../bindings/allbeingsfuture/internal/services'
import { ResumeSession as ResumeSessionAPI, ListAllAgents as ListAllAgentsAPI, SpawnChildSession, SendToChild } from '../../bindings/allbeingsfuture/internal/services/processservice'
import type { Session, SessionConfig, ChatMessage, ChatState, CreateWorktreeResult } from '../../bindings/allbeingsfuture/internal/models/models'

/** Session objects from the backend may carry parentSessionId for child sessions */
type SessionWithParent = Session & { parentSessionId?: string }
type PatchedChatMessage = ChatMessage & {
  timestamp?: string
  childSessionId?: string
  toolUse?: Array<{ name: string; input?: Record<string, unknown> }>
  toolName?: string
  toolInput?: Record<string, unknown>
}

const ACTIVE_RUNTIME_STATUSES = new Set<Session['status']>(['starting', 'running'])
type WorktreeCreateResult = CreateWorktreeResult & { baseBranch?: string }

function resolveWorktreePath(worktree: WorktreeCreateResult | null | undefined): string {
  if (!worktree) return ''
  const legacyWorktree = worktree as WorktreeCreateResult & { path?: string }
  return worktree.worktreePath || legacyWorktree.path || ''
}

function syncRuntimeStatus(sessions: Session[], sessionId: string, streaming: boolean): Session[] {
  let changed = false
  const nextSessions = sessions.map((session) => {
    if (session.id !== sessionId) return session

    // Don't override terminal statuses for child sessions — their status is
    // authoritative from the backend (AgentTracker + SessionService).
    const isChildSession = !!(session as SessionWithParent).parentSessionId
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

function sameMessageIdentity(left: ChatMessage | undefined, right: ChatMessage): boolean {
  if (!left || left.role !== right.role) return false
  const leftAny = left as PatchedChatMessage
  const rightAny = right as PatchedChatMessage
  return leftAny.timestamp === rightAny.timestamp
    && leftAny.childSessionId === rightAny.childSessionId
}

function normalizeWorktreeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildWorktreeIdentifiers(config: SessionConfig): { branchName: string; taskId: string } {
  const explicitBranch = normalizeWorktreeSegment(config.gitBranch || '')
  if (explicitBranch) {
    return { branchName: explicitBranch, taskId: explicitBranch }
  }

  const fromName = normalizeWorktreeSegment(config.name || '')
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  const baseName = fromName || 'session'
  const branchName = `${baseName}-${stamp}`
  return { branchName, taskId: branchName }
}

const MANAGED_WORKTREE_MARKERS = [
  '/.allbeingsfuture-worktrees/',
  '/.abf-worktrees/',
  '/.claudeops-worktrees/',
]

async function createSessionWithWorktree(config: SessionConfig): Promise<Session | null> {
  const repoCandidate = (config.gitRepoPath || config.workingDirectory || '').trim()
  if (!repoCandidate) {
    throw new Error('启用 Worktree 隔离时必须提供 Git 仓库目录')
  }

  const repoPath = await GitService.GetRepoRoot(repoCandidate).catch(() => '')
  if (!repoPath) {
    throw new Error(`目录不是 Git 仓库，无法启用隔离: ${repoCandidate}`)
  }

  const { branchName, taskId } = buildWorktreeIdentifiers(config)
  const worktree = await GitService.CreateWorktree(repoPath, branchName, taskId) as WorktreeCreateResult | null
  const worktreePath = resolveWorktreePath(worktree)
  if (!worktreePath || !worktree?.branch) {
    throw new Error('创建 Worktree 失败')
  }

  try {
    const session = await SessionService.Create({
      ...config,
      workingDirectory: worktreePath,
    })
    if (!session) return null

    await SessionService.SetWorktreeInfo(
      session.id,
      worktreePath,
      worktree.branch,
      worktree.baseCommit || '',
      worktree.baseBranch || '',
      repoPath,
    )

    const refreshed = await SessionService.GetByID(session.id)
    if (refreshed) return refreshed

    return {
      ...session,
      workingDirectory: worktreePath,
      worktreePath,
      worktreeBranch: worktree.branch,
      worktreeBaseCommit: worktree.baseCommit || '',
      worktreeBaseBranch: worktree.baseBranch || '',
      worktreeSourceRepo: repoPath,
      worktreeMerged: false,
    } as Session
  } catch (err) {
    await GitService.RemoveWorktree(repoPath, worktreePath, true).catch(() => {})
    throw err
  }
}

function isManagedWorktreePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase()
  return MANAGED_WORKTREE_MARKERS.some((marker) => normalized.includes(marker))
}

function resolveSessionWorktreePath(session: Session): string {
  const explicitPath = ((session as Session & { worktreePath?: string }).worktreePath || '').trim()
  if (explicitPath) return explicitPath
  const workingDirectory = (session.workingDirectory || '').trim()
  return isManagedWorktreePath(workingDirectory) ? workingDirectory : ''
}

function resolveSessionRepoPath(session: Session): string {
  const explicitRepo = ((session as Session & { worktreeSourceRepo?: string }).worktreeSourceRepo || '').trim()
  if (explicitRepo) return explicitRepo

  const worktreePath = resolveSessionWorktreePath(session).replace(/\\/g, '/')
  const lowerPath = worktreePath.toLowerCase()
  for (const marker of MANAGED_WORKTREE_MARKERS) {
    const index = lowerPath.indexOf(marker.toLowerCase())
    if (index > 0) {
      return worktreePath.slice(0, index)
    }
  }
  return ''
}

async function cleanupSessionWorktree(session: Session): Promise<void> {
  const worktreePath = resolveSessionWorktreePath(session)
  const repoPath = resolveSessionRepoPath(session)
  if (!worktreePath || !repoPath) return
  await GitService.RemoveWorktree(repoPath, worktreePath, true).catch(() => {})
}

function parseStoredMessages(session: Session): ChatMessage[] {
  const raw = ((session as Session & { messagesJson?: string }).messagesJson || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as ChatMessage[] : []
  } catch {
    return []
  }
}

function cleanSessionTitleText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function trimSessionTitle(value: string): string {
  const normalized = value
    .replace(/^(请你|请帮我|帮我把|帮我|帮忙|麻烦|需要|想要|我要|给我|请|协助我)\s*/u, '')
    .replace(/^(实现|修复|优化|添加|改成|重构|创建|生成)\s*/u, '')
    .trim()
  if (!normalized) return ''

  const sentence = normalized
    .split(/[。！？!?；;：:|]/u)
    .map(part => part.trim())
    .find(part => part.length >= 4) || normalized

  const clipped = Array.from(sentence.trim())
  if (clipped.length === 0) return ''
  return clipped.length > 24 ? `${clipped.slice(0, 24).join('')}…` : clipped.join('')
}

function formatBranchTitle(branch: string): string {
  const normalized = branch
    .replace(/^worktree-/u, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  return trimSessionTitle(normalized)
}

function buildSmartSessionName(session: Session, liveMessages?: ChatMessage[]): string {
  const sourceMessages = liveMessages && liveMessages.length > 0 ? liveMessages : parseStoredMessages(session)

  for (const message of sourceMessages) {
    const role = (message as ChatMessage & { role?: string }).role
    if (role !== 'user' && role !== 'assistant') continue
    const candidate = trimSessionTitle(cleanSessionTitleText((message.content || '').trim()))
    if (candidate) return candidate
  }

  const promptCandidate = trimSessionTitle(cleanSessionTitleText((((session as Session & { initialPrompt?: string }).initialPrompt) || '').trim()))
  if (promptCandidate) return promptCandidate

  const branchCandidate = formatBranchTitle(((session as Session & { worktreeBranch?: string }).worktreeBranch) || '')
  if (branchCandidate) return branchCandidate

  const existingName = trimSessionTitle(cleanSessionTitleText((session.name || '').trim()))
  if (existingName) return existingName

  return `会话 ${session.id.slice(0, 6)}`
}

function stableSerialize(value: unknown): string {
  if (value == null) return ''
  try {
    return JSON.stringify(value) || ''
  } catch {
    return String(value)
  }
}

function sameMessages(left: ChatMessage[], right: ChatMessage[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    const leftMsg = left[index] as PatchedChatMessage & Record<string, unknown>
    const rightMsg = right[index] as PatchedChatMessage & Record<string, unknown>

    if (
      leftMsg.role !== rightMsg.role
      || leftMsg.content !== rightMsg.content
      || leftMsg.timestamp !== rightMsg.timestamp
      || leftMsg.childSessionId !== rightMsg.childSessionId
      || leftMsg.childAgentName !== rightMsg.childAgentName
      || leftMsg.toolName !== rightMsg.toolName
      || leftMsg.partial !== rightMsg.partial
      || leftMsg.isThinking !== rightMsg.isThinking
      || leftMsg.presentation !== rightMsg.presentation
    ) {
      return false
    }

    if (
      stableSerialize(leftMsg.toolInput) !== stableSerialize(rightMsg.toolInput)
      || stableSerialize(leftMsg.toolUse) !== stableSerialize(rightMsg.toolUse)
      || stableSerialize(leftMsg.images) !== stableSerialize(rightMsg.images)
      || stableSerialize(leftMsg.usage) !== stableSerialize(rightMsg.usage)
      || stableSerialize(leftMsg.thinking) !== stableSerialize(rightMsg.thinking)
    ) {
      return false
    }
  }

  return true
}

function withPatchedToolUse(messages: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  if (msg.role !== 'tool_use') return messages

  const toolMsg = msg as PatchedChatMessage
  const next = [...messages]
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const candidate = next[index] as PatchedChatMessage
    if (candidate.role !== 'assistant') continue
    if ((candidate.childSessionId || '') !== (toolMsg.childSessionId || '')) continue

    const nextToolUse = [...(candidate.toolUse ?? []), {
      name: toolMsg.toolName || 'unknown',
      input: toolMsg.toolInput,
    }]
    next[index] = { ...candidate, toolUse: nextToolUse } as ChatMessage
    break
  }
  return next
}

function appendPatchedMessage(messages: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const withToolUse = withPatchedToolUse(messages, msg)
  return [...withToolUse, msg]
}

function upsertLastPatchedMessage(messages: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (sameMessageIdentity(last, msg)) {
    const next = messages.slice()
    next[next.length - 1] = msg
    return next
  }
  return appendPatchedMessage(messages, msg)
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

export interface ChatPatchEvent {
  sessionId: string
  type: 'append' | 'upsert_last' | 'meta'
  message?: ChatMessage
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

  load: async () => {
    set({ loading: true })
    try {
      const sessions = await SessionService.GetAll()
      set((state) => {
        // Preserve in-memory runtime statuses ('running'/'starting') that are
        // never written to DB.  Without this, load() would overwrite a live
        // 'running' session with 'idle' from DB whenever it is called (e.g.
        // when a child agent triggers handleAgentUpdate → load()).
        const runtimeStatuses = new Map<string, Session['status']>()
        for (const s of state.sessions) {
          if (ACTIVE_RUNTIME_STATUSES.has(s.status)) {
            runtimeStatuses.set(s.id, s.status)
          }
        }
        const merged = (sessions ?? []).map(s => {
          const kept = runtimeStatuses.get(s.id)
          return kept ? { ...s, status: kept } : s
        })
        return { sessions: merged }
      })
    } finally {
      set({ loading: false })
    }
  },

  create: async (config) => {
    try {
      const session = config.worktreeEnabled
        ? await createSessionWithWorktree(config)
        : await SessionService.Create(config)
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
    set({ selectedId: id, messages: [], chatError: '' })
    // Don't reset streaming here — let pollChat fetch the real state from backend.
    // This prevents showing a "ready" UI while the backend is still streaming.
    if (id) void get().pollChat(id)
  },

  rename: async (id, name) => {
    const nextName = name.trim()
    if (!nextName) return
    await SessionService.UpdateName(id, nextName)
    set((state) => ({
      sessions: state.sessions.map((session) => (
        session.id === id
          ? { ...session, name: nextName }
          : session
      )),
    }))
  },

  smartRename: async (id) => {
    const state = get()
    const session = state.sessions.find((item) => item.id === id)
    if (!session) return null

    const liveMessages = state.selectedId === id ? state.messages : undefined
    const nextName = buildSmartSessionName(session, liveMessages)
    if (!nextName) return null
    if (nextName === session.name) return nextName

    await SessionService.UpdateName(id, nextName)
    set((current) => ({
      sessions: current.sessions.map((item) => (
        item.id === id
          ? { ...item, name: nextName }
          : item
      )),
    }))
    return nextName
  },

  remove: async (id) => {
    // Stop parent and all child processes
    const { sessions } = get()
    const targetSessions = sessions.filter((session) => (
      session.id === id || (session as SessionWithParent).parentSessionId === id
    ))
    const children = targetSessions.filter(session => session.id !== id)

    for (const session of targetSessions) {
      try { await ProcessService.StopProcess(session.id) } catch {}
    }

    for (const session of targetSessions) {
      await cleanupSessionWorktree(session)
    }

    // DB delete cascades to children
    await SessionService.Delete(id)
    const childIds = new Set(children.map(c => c.id))
    set(s => ({
      sessions: s.sessions.filter(x => x.id !== id && !childIds.has(x.id)),
      selectedId: (s.selectedId === id || childIds.has(s.selectedId!)) ? null : s.selectedId,
      ...(s.selectedId === id || childIds.has(s.selectedId!)
        ? { messages: [], streaming: false, chatError: '' }
        : {}),
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
      // Update just this session's status to reflect successful init.
      // Avoid calling load() here — it replaces the entire sessions array,
      // which can cause status desync for other running sessions.
      set((state) => ({
        sessions: state.sessions.map(s =>
          s.id === id ? { ...s, status: 'idle' } : s
        ),
      }))
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
      if (images && images.length > 0) {
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
      throw err
    }
  },

  pollChat: async (id) => {
    try {
      const state: ChatState | null = await ProcessService.GetChatState(id)
      if (state) {
        const current = get()
        const nextMessages = state.messages ?? []
        const nextError = state.error || ''
        const nextSessions = syncRuntimeStatus(current.sessions, id, state.streaming)
        const isSelected = current.selectedId === id
        const messagesChanged = isSelected && !sameMessages(current.messages, nextMessages)
        const metaChanged = isSelected && (
          current.streaming !== state.streaming
          || current.chatError !== nextError
        )
        const sessionsChanged = nextSessions !== current.sessions

        if (!messagesChanged && !metaChanged && !sessionsChanged) {
          return
        }

        set({
          ...(sessionsChanged ? { sessions: nextSessions } : {}),
          ...(isSelected
            ? {
                messages: messagesChanged ? nextMessages : current.messages,
                streaming: state.streaming,
                chatError: nextError,
              }
            : {}),
        })
      }
    } catch (err: unknown) {
      set({ chatError: err instanceof Error ? err.message : String(err) })
    }
  },

  handleChatUpdate: (data) => {
    const current = get()
    const nextSessions = syncRuntimeStatus(current.sessions, data.sessionId, data.streaming)
    const isSelected = data.sessionId === current.selectedId
    const nextMessages = data.messages ?? []
    const nextError = data.error || ''
    const messagesChanged = isSelected && !sameMessages(current.messages, nextMessages)
    const metaChanged = isSelected && (
      current.streaming !== data.streaming
      || current.chatError !== nextError
    )
    const sessionsChanged = nextSessions !== current.sessions

    if (!messagesChanged && !metaChanged && !sessionsChanged) {
      return
    }

    set({
      ...(sessionsChanged ? { sessions: nextSessions } : {}),
      ...(isSelected
        ? {
            messages: messagesChanged ? nextMessages : current.messages,
            streaming: data.streaming,
            chatError: nextError,
          }
        : {}),
    })
  },

  handleChatPatch: (data) => {
    const { selectedId } = get()
    set((state) => {
      const next: Partial<SessionState> = {
        sessions: syncRuntimeStatus(state.sessions, data.sessionId, data.streaming),
      }

      if (data.sessionId !== selectedId) {
        return next
      }

      let nextMessages = state.messages
      if (data.message) {
        if (data.type === 'append') {
          nextMessages = appendPatchedMessage(state.messages, data.message)
        } else if (data.type === 'upsert_last') {
          nextMessages = upsertLastPatchedMessage(state.messages, data.message)
        }
      }

      next.messages = nextMessages
      next.streaming = data.streaming
      next.chatError = data.error || ''
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

      return {
        agents: nextAgents,
        childToParent: nextChildToParent,
        sessions: state.sessions,
      }
    })

    // Reload sessions outside set() to avoid race condition with stale state
    if (agent.childSessionId && !get().sessions.find(s => s.id === agent.childSessionId)) {
      get().load().catch(() => {})
    }
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
        const pid = (sess as SessionWithParent).parentSessionId
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
    } catch (err) {
      console.warn('fetchAllAgents failed:', err)
    }
  },

  markWorktreeMerged: async (id) => {
    await SessionService.MarkWorktreeMerged(id)
    await get().load()
  },
}))

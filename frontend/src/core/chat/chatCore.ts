import { SessionService, ProcessService, GitService } from '../../../bindings/allbeingsfuture/internal/services'
import {
  ResumeSession as ResumeSessionAPI,
  ListAllAgents as ListAllAgentsAPI,
  SpawnChildSession,
  SendToChild,
} from '../../../bindings/allbeingsfuture/internal/services/processservice'
import type {
  Session,
  SessionConfig,
  ChatMessage,
  CreateWorktreeResult,
} from '../../../bindings/allbeingsfuture/internal/models/models'

type SessionWithParent = Session & { parentSessionId?: string }
type PatchedChatMessage = ChatMessage & {
  timestamp?: string
  childSessionId?: string
  childAgentName?: string
  toolUse?: Array<{ name: string; input?: Record<string, unknown> }>
  toolName?: string
  toolInput?: Record<string, unknown>
  partial?: boolean
  isThinking?: boolean
  presentation?: string
  images?: unknown
  usage?: unknown
  thinking?: unknown
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

export interface ParentBinding {
  parentSessionId: string
  agentId: string
  agentName: string
}

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

export interface AgentUpdateEvent {
  parentSessionId: string
  agent: AgentInfo
}

export interface ChatSnapshot {
  sessions: Session[]
  selectedId: string | null
  messages: ChatMessage[]
  streaming: boolean
  chatError: string
  agents: Record<string, AgentInfo[]>
  childToParent: Record<string, ParentBinding>
}

const ACTIVE_RUNTIME_STATUSES = new Set<Session['status']>(['starting', 'running'])
const MANAGED_WORKTREE_MARKERS = ['/.allbeingsfuture-worktrees/', '/.abf-worktrees/', '/.claudeops-worktrees/']

type WorktreeCreateResult = CreateWorktreeResult & { baseBranch?: string; path?: string }

function resolveWorktreePath(worktree: WorktreeCreateResult | null | undefined) {
  if (!worktree) return ''
  return worktree.worktreePath || worktree.path || ''
}

function mergeLoadedSessions(existing: Session[], incoming: Session[]) {
  const runtimeStatuses = new Map<string, Session['status']>()
  for (const session of existing) {
    if (ACTIVE_RUNTIME_STATUSES.has(session.status)) runtimeStatuses.set(session.id, session.status)
  }
  return incoming.map(session => {
    const kept = runtimeStatuses.get(session.id)
    return kept ? { ...session, status: kept } : session
  })
}

function cleanSessionTitleText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function trimSessionTitle(value: string) {
  const normalized = value
    .replace(/^(请你|请帮我|帮我把|帮我|帮忙|麻烦|需要|想要|我要|给我|请|协助我)\s*/u, '')
    .replace(/^(实现|修复|优化|添加|改成|重构|创建|生成)\s*/u, '')
    .trim()
  if (!normalized) return ''
  const sentence = normalized
    .split(/[。！？!?；;：:|]/u)
    .map(part => part.trim())
    .find(part => part.length >= 4) || normalized
  const chars = Array.from(sentence.trim())
  return chars.length > 24 ? `${chars.slice(0, 24).join('')}…` : chars.join('')
}

function formatBranchTitle(branch: string) {
  return trimSessionTitle(branch.replace(/^worktree-/u, '').replace(/[-_]+/g, ' ').trim())
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

function buildSmartSessionName(session: Session, liveMessages?: ChatMessage[]) {
  const sourceMessages = liveMessages && liveMessages.length > 0 ? liveMessages : parseStoredMessages(session)
  for (const message of sourceMessages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
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

function stableSerialize(value: unknown) {
  if (value == null) return ''
  try {
    return JSON.stringify(value) || ''
  } catch {
    return String(value)
  }
}

function sameMessages(left: ChatMessage[], right: ChatMessage[]) {
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
    ) return false

    if (
      stableSerialize(leftMsg.toolInput) !== stableSerialize(rightMsg.toolInput)
      || stableSerialize(leftMsg.toolUse) !== stableSerialize(rightMsg.toolUse)
      || stableSerialize(leftMsg.images) !== stableSerialize(rightMsg.images)
      || stableSerialize(leftMsg.usage) !== stableSerialize(rightMsg.usage)
      || stableSerialize(leftMsg.thinking) !== stableSerialize(rightMsg.thinking)
    ) return false
  }
  return true
}

function sameMessageIdentity(left: ChatMessage | undefined, right: ChatMessage) {
  if (!left || left.role !== right.role) return false
  const leftAny = left as PatchedChatMessage
  const rightAny = right as PatchedChatMessage
  return leftAny.timestamp === rightAny.timestamp && leftAny.childSessionId === rightAny.childSessionId
}

function withPatchedToolUse(messages: ChatMessage[], msg: ChatMessage) {
  if (msg.role !== 'tool_use') return messages
  const toolMsg = msg as PatchedChatMessage
  const next = [...messages]
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const candidate = next[index] as PatchedChatMessage
    if (candidate.role !== 'assistant') continue
    if ((candidate.childSessionId || '') !== (toolMsg.childSessionId || '')) continue
    next[index] = {
      ...candidate,
      toolUse: [...(candidate.toolUse ?? []), { name: toolMsg.toolName || 'unknown', input: toolMsg.toolInput }],
    } as ChatMessage
    break
  }
  return next
}

function appendPatchedMessage(messages: ChatMessage[], msg: ChatMessage) {
  return [...withPatchedToolUse(messages, msg), msg]
}

function upsertLastPatchedMessage(messages: ChatMessage[], msg: ChatMessage) {
  const last = messages[messages.length - 1]
  if (!sameMessageIdentity(last, msg)) return appendPatchedMessage(messages, msg)
  const next = messages.slice()
  next[next.length - 1] = msg
  return next
}

function normalizeWorktreeSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
}

function buildWorktreeIdentifiers(config: SessionConfig) {
  const explicitBranch = normalizeWorktreeSegment(config.gitBranch || '')
  if (explicitBranch) return { branchName: explicitBranch, taskId: explicitBranch }
  const fromName = normalizeWorktreeSegment(config.name || '') || 'session'
  const now = new Date()
  const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'), String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0')].join('')
  return { branchName: `${fromName}-${stamp}`, taskId: `${fromName}-${stamp}` }
}

async function createSessionWithWorktree(config: SessionConfig) {
  const repoCandidate = (config.gitRepoPath || config.workingDirectory || '').trim()
  if (!repoCandidate) throw new Error('启用 Worktree 隔离时必须提供 Git 仓库目录')
  const repoPath = await GitService.GetRepoRoot(repoCandidate).catch(() => '')
  if (!repoPath) throw new Error(`目录不是 Git 仓库，无法启用隔离: ${repoCandidate}`)

  const { branchName, taskId } = buildWorktreeIdentifiers(config)
  const worktree = await GitService.CreateWorktree(repoPath, branchName, taskId) as WorktreeCreateResult | null
  const worktreePath = resolveWorktreePath(worktree)
  if (!worktreePath || !worktree?.branch) throw new Error('创建 Worktree 失败')

  try {
    const session = await SessionService.Create({ ...config, workingDirectory: worktreePath })
    if (!session) return null
    await SessionService.SetWorktreeInfo(session.id, worktreePath, worktree.branch, worktree.baseCommit || '', worktree.baseBranch || '', repoPath)
    return await SessionService.GetByID(session.id) || {
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

function resolveSessionWorktreePath(session: Session) {
  const explicitPath = ((session as Session & { worktreePath?: string }).worktreePath || '').trim()
  if (explicitPath) return explicitPath
  const workingDirectory = (session.workingDirectory || '').trim().replace(/\\/g, '/').toLowerCase()
  return MANAGED_WORKTREE_MARKERS.some(marker => workingDirectory.includes(marker)) ? session.workingDirectory.trim() : ''
}

function resolveSessionRepoPath(session: Session) {
  const explicitRepo = ((session as Session & { worktreeSourceRepo?: string }).worktreeSourceRepo || '').trim()
  if (explicitRepo) return explicitRepo
  const worktreePath = resolveSessionWorktreePath(session).replace(/\\/g, '/')
  const lowerPath = worktreePath.toLowerCase()
  for (const marker of MANAGED_WORKTREE_MARKERS) {
    const index = lowerPath.indexOf(marker.toLowerCase())
    if (index > 0) return worktreePath.slice(0, index)
  }
  return ''
}

async function cleanupSessionWorktree(session: Session) {
  const worktreePath = resolveSessionWorktreePath(session)
  const repoPath = resolveSessionRepoPath(session)
  if (worktreePath && repoPath) await GitService.RemoveWorktree(repoPath, worktreePath, true).catch(() => {})
}

function buildChatStatePatch(snapshot: ChatSnapshot, sessionId: string, messages: ChatMessage[], streaming: boolean, error: string) {
  const nextSessions = chatCore.syncRuntimeStatus(snapshot.sessions, sessionId, streaming)
  const isSelected = snapshot.selectedId === sessionId
  const nextError = chatCore.localizeChatError(error)
  const messagesChanged = isSelected && !sameMessages(snapshot.messages, messages)
  const metaChanged = isSelected && (snapshot.streaming !== streaming || snapshot.chatError !== nextError)
  const sessionsChanged = nextSessions !== snapshot.sessions
  if (!messagesChanged && !metaChanged && !sessionsChanged) return null
  return {
    ...(sessionsChanged ? { sessions: nextSessions } : {}),
    ...(isSelected ? { messages: messagesChanged ? messages : snapshot.messages, streaming, chatError: nextError } : {}),
  }
}

export const chatCore = {
  localizeChatError(message: string) {
    const trimmed = message.trim()
    if (!trimmed) return ''
    if (trimmed === 'Codex is still processing the previous turn') return 'Codex 仍在处理上一轮请求，请稍候片刻再发送。'
    return trimmed
  },

  syncRuntimeStatus(sessions: Session[], sessionId: string, streaming: boolean) {
    let changed = false
    const nextSessions = sessions.map((session) => {
      if (session.id !== sessionId) return session
      const isChildSession = !!(session as SessionWithParent).parentSessionId
      const isTerminal = ['completed', 'terminated', 'error'].includes(session.status)
      if (isChildSession && isTerminal) return session
      let nextStatus = session.status
      if (streaming) {
        if (session.status === 'idle' || session.status === 'waiting_input') nextStatus = 'running'
      } else if (ACTIVE_RUNTIME_STATUSES.has(session.status)) {
        nextStatus = 'idle'
      }
      if (nextStatus === session.status) return session
      changed = true
      return { ...session, status: nextStatus }
    })
    return changed ? nextSessions : sessions
  },

  async load(snapshot: ChatSnapshot) {
    const sessions = await SessionService.GetAll()
    return { sessions: mergeLoadedSessions(snapshot.sessions, sessions ?? []) }
  },

  async create(snapshot: ChatSnapshot, config: SessionConfig) {
    const session = config.worktreeEnabled ? await createSessionWithWorktree(config) : await SessionService.Create(config)
    return session ? { session, patch: { sessions: [session, ...snapshot.sessions] } } : { session: null, patch: null }
  },

  select(snapshot: ChatSnapshot, id: string | null) {
    if (id === snapshot.selectedId) return null
    return { selectedId: id, messages: [], chatError: '' }
  },

  async rename(snapshot: ChatSnapshot, id: string, name: string) {
    await SessionService.UpdateName(id, name)
    return { sessions: snapshot.sessions.map(session => session.id === id ? { ...session, name } : session) }
  },

  async smartRename(snapshot: ChatSnapshot, id: string) {
    const session = snapshot.sessions.find(item => item.id === id)
    if (!session) return { nextName: null, patch: null }
    const nextName = buildSmartSessionName(session, snapshot.selectedId === id ? snapshot.messages : undefined)
    if (!nextName || nextName === session.name) return { nextName, patch: null }
    await SessionService.UpdateName(id, nextName)
    return { nextName, patch: { sessions: snapshot.sessions.map(item => item.id === id ? { ...item, name: nextName } : item) } }
  },

  async remove(snapshot: ChatSnapshot, id: string) {
    const targets = snapshot.sessions.filter(session => session.id === id || (session as SessionWithParent).parentSessionId === id)
    const childIds = new Set(targets.filter(session => session.id !== id).map(session => session.id))
    for (const session of targets) {
      try { await ProcessService.StopProcess(session.id) } catch {}
    }
    for (const session of targets) await cleanupSessionWorktree(session)
    await SessionService.Delete(id)
    const resetSelection = snapshot.selectedId === id || (snapshot.selectedId ? childIds.has(snapshot.selectedId) : false)
    return {
      sessions: snapshot.sessions.filter(session => session.id !== id && !childIds.has(session.id)),
      selectedId: resetSelection ? null : snapshot.selectedId,
      ...(resetSelection ? { messages: [], streaming: false, chatError: '' } : {}),
    }
  },

  async end(id: string) {
    try { await ProcessService.StopProcess(id) } catch {}
    await SessionService.End(id)
  },

  async init(snapshot: ChatSnapshot, id: string) {
    await ProcessService.InitSession(id)
    return { sessions: snapshot.sessions.map(session => session.id === id ? { ...session, status: 'idle' } : session) }
  },

  buildInitError(error: unknown) {
    return { chatError: chatCore.localizeChatError(error instanceof Error ? error.message : String(error)) }
  },

  startSend(snapshot: ChatSnapshot, id: string) {
    return {
      chatError: '',
      sessions: chatCore.syncRuntimeStatus(snapshot.sessions, id, true),
      ...(snapshot.selectedId === id ? { streaming: true } : {}),
    }
  },

  async send(id: string, text: string, images?: Array<{ data: string; mimeType: string }>) {
    if (images && images.length > 0) return ProcessService.SendMessageWithImages(id, text, images)
    return ProcessService.SendMessage(id, text)
  },

  buildSendError(snapshot: ChatSnapshot, id: string, error: unknown) {
    return {
      chatError: chatCore.localizeChatError(error instanceof Error ? error.message : String(error)),
      sessions: chatCore.syncRuntimeStatus(snapshot.sessions, id, false),
      ...(snapshot.selectedId === id ? { streaming: false } : {}),
    }
  },

  async poll(snapshot: ChatSnapshot, id: string) {
    const state = await ProcessService.GetChatState(id)
    if (!state) return null
    return buildChatStatePatch(snapshot, id, state.messages ?? [], state.streaming, state.error || '')
  },

  applyChatUpdate(snapshot: ChatSnapshot, data: ChatUpdateEvent) {
    return buildChatStatePatch(snapshot, data.sessionId, data.messages ?? [], data.streaming, data.error || '')
  },

  applyChatPatch(snapshot: ChatSnapshot, data: ChatPatchEvent) {
    const next: Partial<ChatSnapshot> = { sessions: chatCore.syncRuntimeStatus(snapshot.sessions, data.sessionId, data.streaming) }
    if (data.sessionId !== snapshot.selectedId) return next
    let nextMessages = snapshot.messages
    if (data.message) {
      nextMessages = data.type === 'upsert_last'
        ? upsertLastPatchedMessage(snapshot.messages, data.message)
        : data.type === 'append'
        ? appendPatchedMessage(snapshot.messages, data.message)
        : snapshot.messages
    }
    return { ...next, messages: nextMessages, streaming: data.streaming, chatError: chatCore.localizeChatError(data.error || '') }
  },

  applyAgentUpdate(snapshot: ChatSnapshot, data: AgentUpdateEvent) {
    const { parentSessionId, agent } = data
    if (!parentSessionId || !agent) return null
    const prevList = snapshot.agents[parentSessionId] || []
    const existingIndex = prevList.findIndex(item => item.agentId === agent.agentId)
    const nextList = existingIndex >= 0 ? prevList.map((item, index) => index === existingIndex ? agent : item) : [...prevList, agent]
    return {
      agents: { ...snapshot.agents, [parentSessionId]: nextList },
      childToParent: agent.childSessionId ? {
        ...snapshot.childToParent,
        [agent.childSessionId]: { parentSessionId, agentId: agent.agentId, agentName: agent.name },
      } : snapshot.childToParent,
      sessions: snapshot.sessions,
    }
  },

  stop: (id: string) => ProcessService.StopProcess(id),
  resume: (oldSessionId: string) => ResumeSessionAPI(oldSessionId),
  spawnChild: (parentSessionId: string, name: string, prompt: string) => SpawnChildSession(parentSessionId, { name, prompt }),
  sendToChild: (parentSessionId: string, childSessionId: string, message: string) => SendToChild(parentSessionId, childSessionId, message),

  async fetchAllAgents(snapshot: ChatSnapshot) {
    const grouped: Record<string, AgentInfo[]> = {}
    const reverseMap: Record<string, ParentBinding> = {}
    const result = await ListAllAgentsAPI() as AgentInfo[] | undefined
    const seenChildIds = new Set<string>()
    if (result && Array.isArray(result)) {
      for (const agent of result) {
        if (!agent.parentSessionId) continue
        if (!grouped[agent.parentSessionId]) grouped[agent.parentSessionId] = []
        grouped[agent.parentSessionId].push(agent)
        seenChildIds.add(agent.childSessionId)
        reverseMap[agent.childSessionId] = { parentSessionId: agent.parentSessionId, agentId: agent.agentId, agentName: agent.name }
      }
    }

    for (const session of snapshot.sessions) {
      const parentSessionId = (session as SessionWithParent).parentSessionId
      if (!parentSessionId || seenChildIds.has(session.id)) continue
      const agent: AgentInfo = {
        agentId: `session-${session.id}`,
        name: session.name,
        parentSessionId,
        childSessionId: session.id,
        status: ['starting', 'running', 'waiting_input'].includes(session.status) ? 'running' : session.status === 'idle' ? 'idle' : session.status === 'error' ? 'failed' : session.status === 'terminated' ? 'cancelled' : 'completed',
        workDir: session.workingDirectory,
        createdAt: session.startedAt ? String(session.startedAt) : '',
        providerId: session.providerId,
      }
      if (!grouped[parentSessionId]) grouped[parentSessionId] = []
      grouped[parentSessionId].push(agent)
      reverseMap[session.id] = { parentSessionId, agentId: agent.agentId, agentName: session.name }
    }

    if (JSON.stringify(snapshot.agents) === JSON.stringify(grouped)) return null
    return { agents: grouped, childToParent: reverseMap }
  },

  markWorktreeMerged: (id: string) => SessionService.MarkWorktreeMerged(id),
}

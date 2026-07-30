import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../../../bindings/allbeingsfuture/internal/models/models'

const serviceMocks = vi.hoisted(() => ({
  sessionService: {
    GetAll: vi.fn(),
    GetByID: vi.fn(),
    Create: vi.fn(),
    Delete: vi.fn(),
    End: vi.fn(),
    UpdateName: vi.fn(),
    SetWorktreeInfo: vi.fn(),
    MarkWorktreeMerged: vi.fn(),
  },
  gitService: {
    GetRepoRoot: vi.fn(),
    EnsureRepo: vi.fn(),
    CreateWorktree: vi.fn(),
    RemoveWorktree: vi.fn(),
    MergeWorktree: vi.fn(),
    ListWorktrees: vi.fn(),
  },
  processService: {
    GetChatState: vi.fn(),
    StopProcess: vi.fn(),
    SendMessage: vi.fn(),
    SendMessageWithImages: vi.fn(),
    InitSession: vi.fn(),
  },
  processApi: {
    ResumeSession: vi.fn(),
    ListAllAgents: vi.fn(),
  },
}))

vi.mock('../../../bindings/allbeingsfuture/internal/services', () => ({
  SessionService: serviceMocks.sessionService,
  GitService: serviceMocks.gitService,
  ProcessService: serviceMocks.processService,
}))

vi.mock('../../../bindings/allbeingsfuture/internal/services/processservice', () => ({
  ResumeSession: serviceMocks.processApi.ResumeSession,
  ListAllAgents: serviceMocks.processApi.ListAllAgents,
}))

import {
  disposeAgentStreamBatches,
  flushAgentStreamBatches,
  resetSessionsEpochForTests,
  useSessionStore,
} from '../sessionSnapshotStore'
import { useGitStore } from '../gitStore'
import { useDraftStore } from '../draftStore'

function makeSession(overrides: Partial<Session> & { messagesJson?: string; parentSessionId?: string } = {}): Session {
  return {
    id: 'session-1',
    name: 'Test Session',
    workingDirectory: 'C:/repo',
    providerId: 'codex',
    status: 'idle',
    mode: 'normal',
    initialPrompt: '',
    autoAccept: false,
    worktreePath: '',
    worktreeBranch: '',
    worktreeBaseCommit: '',
    worktreeBaseBranch: '',
    worktreeMerged: false,
    worktreeSourceRepo: '',
    taskId: '',
    nameLocked: false,
    estimatedTokens: 0,
    config: '',
    claudeSessionId: '',
    exitCode: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    messagesJson: '[]',
    ...overrides,
  } as Session
}

function resetStore() {
  disposeAgentStreamBatches()
  resetSessionsEpochForTests()
  useSessionStore.setState({
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
  })
  useDraftStore.setState({ drafts: {}, pendingBySession: {} })
}

function resetGitStore() {
  useGitStore.setState({
    worktrees: [],
    status: null,
    currentRepo: '',
    loading: false,
  })
}

describe('sessionStore runtime status sync', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    resetStore()
    resetGitStore()
  })

  it('creates worktree-backed sessions when isolation is enabled', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T13:55:11'))

    const worktreePath = 'C:/repo/.allbeingsfuture-worktrees/fix-isolation-20260328135511'
    const createdSession = makeSession({
      id: 'session-worktree',
      workingDirectory: worktreePath,
    })
    const hydratedSession = makeSession({
      id: 'session-worktree',
      workingDirectory: worktreePath,
      worktreePath,
      worktreeBranch: 'worktree-fix-isolation-20260328135511',
      worktreeBaseCommit: 'abc123',
      worktreeBaseBranch: 'main',
      worktreeSourceRepo: 'C:/repo',
    })

    serviceMocks.gitService.GetRepoRoot.mockResolvedValue('C:/repo')
    serviceMocks.gitService.CreateWorktree.mockResolvedValue({
      worktreePath,
      branch: 'worktree-fix-isolation-20260328135511',
      baseCommit: 'abc123',
      baseBranch: 'main',
    })
    serviceMocks.sessionService.Create.mockResolvedValue(createdSession)
    serviceMocks.sessionService.SetWorktreeInfo.mockResolvedValue(undefined)
    serviceMocks.sessionService.GetByID.mockResolvedValue(hydratedSession)

    const session = await useSessionStore.getState().create({
      name: 'Fix Isolation',
      workingDirectory: 'C:/repo',
      providerId: 'codex',
      worktreeEnabled: true,
      gitRepoPath: 'C:/repo',
      gitBranch: '',
    } as any)

    expect(serviceMocks.gitService.GetRepoRoot).toHaveBeenCalledWith('C:/repo')
    expect(serviceMocks.gitService.EnsureRepo).not.toHaveBeenCalled()
    expect(serviceMocks.gitService.CreateWorktree).toHaveBeenCalledWith(
      'C:/repo',
      'fix-isolation-20260328135511',
      'fix-isolation-20260328135511',
    )
    expect(serviceMocks.sessionService.Create).toHaveBeenCalledWith(expect.objectContaining({
      workingDirectory: worktreePath,
    }))
    expect(serviceMocks.sessionService.SetWorktreeInfo).toHaveBeenCalledWith(
      'session-worktree',
      worktreePath,
      'worktree-fix-isolation-20260328135511',
      'abc123',
      'main',
      'C:/repo',
    )
    expect(serviceMocks.sessionService.GetByID).toHaveBeenCalledWith('session-worktree')
    expect(session).toEqual(hydratedSession)
    expect(useSessionStore.getState().sessions[0]).toEqual(hydratedSession)
  })

  it('auto-inits git then creates worktree when directory is not a repository', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T13:55:11'))

    const plainDir = 'C:/plain-project'
    const worktreePath = 'C:/plain-project/.allbeingsfuture-worktrees/plain-session-20260328135511'
    const createdSession = makeSession({
      id: 'session-plain-init',
      workingDirectory: worktreePath,
    })
    const hydratedSession = makeSession({
      id: 'session-plain-init',
      workingDirectory: worktreePath,
      worktreePath,
      worktreeBranch: 'worktree-plain-session-20260328135511',
      worktreeBaseCommit: 'init001',
      worktreeBaseBranch: 'main',
      worktreeSourceRepo: plainDir,
    })

    serviceMocks.gitService.GetRepoRoot.mockRejectedValue(new Error('not a git repository'))
    serviceMocks.gitService.EnsureRepo.mockResolvedValue(plainDir)
    serviceMocks.gitService.CreateWorktree.mockResolvedValue({
      worktreePath,
      branch: 'worktree-plain-session-20260328135511',
      baseCommit: 'init001',
      baseBranch: 'main',
    })
    serviceMocks.sessionService.Create.mockResolvedValue(createdSession)
    serviceMocks.sessionService.SetWorktreeInfo.mockResolvedValue(undefined)
    serviceMocks.sessionService.GetByID.mockResolvedValue(hydratedSession)

    const session = await useSessionStore.getState().create({
      name: 'Plain Session',
      workingDirectory: plainDir,
      providerId: 'codex',
      worktreeEnabled: true,
      gitRepoPath: plainDir,
      gitBranch: '',
    } as any)

    expect(serviceMocks.gitService.GetRepoRoot).toHaveBeenCalledWith(plainDir)
    expect(serviceMocks.gitService.EnsureRepo).toHaveBeenCalledWith(plainDir)
    expect(serviceMocks.gitService.CreateWorktree).toHaveBeenCalledWith(
      plainDir,
      'plain-session-20260328135511',
      'plain-session-20260328135511',
    )
    expect(serviceMocks.sessionService.SetWorktreeInfo).toHaveBeenCalledWith(
      'session-plain-init',
      worktreePath,
      'worktree-plain-session-20260328135511',
      'init001',
      'main',
      plainDir,
    )
    expect(session).toEqual(hydratedSession)
  })

  it('accepts legacy worktree responses that only expose path', async () => {
    const worktreePath = 'C:/repo/.allbeingsfuture-worktrees/fix-legacy-shape'
    const createdSession = makeSession({
      id: 'session-legacy',
      workingDirectory: worktreePath,
    })
    const hydratedSession = makeSession({
      id: 'session-legacy',
      workingDirectory: worktreePath,
      worktreePath,
      worktreeBranch: 'worktree-fix-legacy-shape',
      worktreeBaseCommit: 'def456',
      worktreeBaseBranch: 'main',
      worktreeSourceRepo: 'C:/repo',
    })

    serviceMocks.gitService.GetRepoRoot.mockResolvedValue('C:/repo')
    serviceMocks.gitService.CreateWorktree.mockResolvedValue({
      path: worktreePath,
      branch: 'worktree-fix-legacy-shape',
      baseCommit: 'def456',
      baseBranch: 'main',
    })
    serviceMocks.sessionService.Create.mockResolvedValue(createdSession)
    serviceMocks.sessionService.SetWorktreeInfo.mockResolvedValue(undefined)
    serviceMocks.sessionService.GetByID.mockResolvedValue(hydratedSession)

    const session = await useSessionStore.getState().create({
      name: 'Legacy Shape',
      workingDirectory: 'C:/repo',
      providerId: 'codex',
      worktreeEnabled: true,
      gitRepoPath: 'C:/repo',
      gitBranch: 'fix-legacy-shape',
    } as any)

    expect(serviceMocks.sessionService.Create).toHaveBeenCalledWith(expect.objectContaining({
      workingDirectory: worktreePath,
    }))
    expect(serviceMocks.sessionService.SetWorktreeInfo).toHaveBeenCalledWith(
      'session-legacy',
      worktreePath,
      'worktree-fix-legacy-shape',
      'def456',
      'main',
      'C:/repo',
    )
    expect(session).toEqual(hydratedSession)
  })

  it('uses the primary repo root when the selected path is already inside a worktree', async () => {
    const repoPath = 'C:/repo'
    const nestedRepoPath = 'C:/repo/.allbeingsfuture-worktrees/session-parent'
    const worktreePath = 'C:/repo/.allbeingsfuture-worktrees/fix-from-nested-worktree'
    const createdSession = makeSession({
      id: 'session-nested',
      workingDirectory: worktreePath,
    })
    const hydratedSession = makeSession({
      id: 'session-nested',
      workingDirectory: worktreePath,
      worktreePath,
      worktreeBranch: 'worktree-fix-from-nested-worktree',
      worktreeBaseCommit: 'fedcba',
      worktreeBaseBranch: 'main',
      worktreeSourceRepo: repoPath,
    })

    serviceMocks.gitService.GetRepoRoot.mockResolvedValue(repoPath)
    serviceMocks.gitService.CreateWorktree.mockResolvedValue({
      worktreePath,
      branch: 'worktree-fix-from-nested-worktree',
      baseCommit: 'fedcba',
      baseBranch: 'main',
    })
    serviceMocks.sessionService.Create.mockResolvedValue(createdSession)
    serviceMocks.sessionService.SetWorktreeInfo.mockResolvedValue(undefined)
    serviceMocks.sessionService.GetByID.mockResolvedValue(hydratedSession)

    const session = await useSessionStore.getState().create({
      name: 'Fix From Nested Worktree',
      workingDirectory: nestedRepoPath,
      providerId: 'codex',
      worktreeEnabled: true,
      gitRepoPath: nestedRepoPath,
      gitBranch: 'fix-from-nested-worktree',
    } as any)

    expect(serviceMocks.gitService.GetRepoRoot).toHaveBeenCalledWith(nestedRepoPath)
    expect(serviceMocks.gitService.CreateWorktree).toHaveBeenCalledWith(
      repoPath,
      'fix-from-nested-worktree',
      'fix-from-nested-worktree',
    )
    expect(serviceMocks.sessionService.SetWorktreeInfo).toHaveBeenCalledWith(
      'session-nested',
      worktreePath,
      'worktree-fix-from-nested-worktree',
      'fedcba',
      'main',
      repoPath,
    )
    expect(session).toEqual(hydratedSession)
  })

  it('enters a worktree for an existing session and re-inits the process cwd', async () => {
    const worktreePath = 'C:/repo/.allbeingsfuture-worktrees/enter-later'
    const baseSession = makeSession({
      id: 'session-enter',
      name: 'Enter Later',
      workingDirectory: 'C:/repo',
      worktreeSourceRepo: 'C:/repo',
    })
    const updatedSession = makeSession({
      id: 'session-enter',
      name: 'Enter Later',
      workingDirectory: worktreePath,
      worktreePath,
      worktreeBranch: 'worktree-enter-later',
      worktreeBaseCommit: 'aaa111',
      worktreeBaseBranch: 'main',
      worktreeSourceRepo: 'C:/repo',
      worktreeMerged: false,
    })

    useSessionStore.setState({
      sessions: [baseSession],
      selectedId: 'session-enter',
    })

    serviceMocks.gitService.GetRepoRoot.mockResolvedValue('C:/repo')
    serviceMocks.gitService.CreateWorktree.mockResolvedValue({
      worktreePath,
      branch: 'worktree-enter-later',
      baseCommit: 'aaa111',
      baseBranch: 'main',
    })
    serviceMocks.sessionService.SetWorktreeInfo.mockResolvedValue(undefined)
    serviceMocks.sessionService.GetByID.mockResolvedValue(updatedSession)
    serviceMocks.processService.InitSession.mockResolvedValue(undefined)

    const session = await useSessionStore.getState().enterWorktree('session-enter')

    expect(serviceMocks.gitService.CreateWorktree).toHaveBeenCalled()
    expect(serviceMocks.sessionService.SetWorktreeInfo).toHaveBeenCalledWith(
      'session-enter',
      worktreePath,
      'worktree-enter-later',
      'aaa111',
      'main',
      'C:/repo',
    )
    expect(serviceMocks.processService.InitSession).toHaveBeenCalledWith('session-enter')
    expect(session).toEqual(updatedSession)
    expect(useSessionStore.getState().sessions[0]).toEqual(updatedSession)
  })

  it('marks a selected running session idle once polling reports streaming has stopped', async () => {
    serviceMocks.processService.GetChatState.mockResolvedValue({
      messages: [{ role: 'assistant', content: '[Error] timeout' }],
      streaming: false,
      error: 'timeout',
    })

    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'running' })],
    })

    await useSessionStore.getState().pollChat('session-1')

    const state = useSessionStore.getState()
    expect(state.streaming).toBe(false)
    expect(state.chatError).toBe('timeout')
    expect(state.sessions[0]?.status).toBe('idle')
  })

  it('preserves the selected chat snapshot reference when polling returns the same content', async () => {
    const timestamp = new Date().toISOString()
    const existingMessages = [
      { role: 'assistant', content: 'same content', timestamp } as never,
    ]

    serviceMocks.processService.GetChatState.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'same content', timestamp }],
      streaming: false,
      error: '',
    })

    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'idle' })],
      messages: existingMessages,
      streaming: false,
      chatError: '',
    })

    await useSessionStore.getState().pollChat('session-1')

    expect(useSessionStore.getState().messages).toBe(existingMessages)
  })

  it('updates background session status from chat updates without clobbering the current conversation', () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      messages: [{ role: 'assistant', content: 'keep me' } as never],
      sessions: [
        makeSession({ id: 'session-1', status: 'idle' }),
        makeSession({ id: 'session-2', status: 'running', name: 'Background Session' }),
      ],
    })

    useSessionStore.getState().handleChatUpdate({
      sessionId: 'session-2',
      messages: [{ role: 'assistant', content: '[Error] timeout' } as never],
      streaming: false,
      error: 'timeout',
    })

    const state = useSessionStore.getState()
    expect(state.messages).toEqual([{ role: 'assistant', content: 'keep me' }])
    expect(state.sessions.find((session) => session.id === 'session-2')?.status).toBe('idle')
  })

  it('handleAgentUpdate removed drops agent immediately and marks child terminated', () => {
    const parentId = 'parent-1'
    const childId = 'child-1'
    const agentId = `persistent-${childId}`
    const agent = {
      agentId,
      name: '子任务',
      parentSessionId: parentId,
      childSessionId: childId,
      status: 'idle' as const,
      workDir: '/tmp',
      createdAt: '2026-07-29T00:00:00.000Z',
    }

    useSessionStore.setState({
      sessions: [
        makeSession({ id: parentId, name: 'Parent', status: 'running' }),
        { ...makeSession({ id: childId, name: '子任务', status: 'idle' }), parentSessionId: parentId } as any,
      ],
      agents: { [parentId]: [agent] },
      childToParent: {
        [childId]: { parentSessionId: parentId, agentId, agentName: '子任务' },
      },
    })

    useSessionStore.getState().handleAgentUpdate({
      parentSessionId: parentId,
      agent: { ...agent, status: 'cancelled' },
      removed: true,
    })

    const state = useSessionStore.getState()
    expect(state.agents[parentId]).toEqual([])
    expect(state.childToParent[childId]).toBeUndefined()
    expect(state.sessions.find((s) => s.id === childId)?.status).toBe('terminated')
  })

  it('ignores full chat updates that do not change the selected conversation payload', () => {
    const timestamp = new Date().toISOString()
    const existingMessages = [
      { role: 'assistant', content: 'keep me', timestamp } as never,
    ]

    useSessionStore.setState({
      selectedId: 'session-1',
      messages: existingMessages,
      streaming: false,
      chatError: '',
      sessions: [makeSession({ id: 'session-1', status: 'idle' })],
    })

    useSessionStore.getState().handleChatUpdate({
      sessionId: 'session-1',
      messages: [{ role: 'assistant', content: 'keep me', timestamp } as never],
      streaming: false,
      error: '',
    })

    expect(useSessionStore.getState().messages).toBe(existingMessages)
  })

  it('applies streaming patches incrementally for the selected session', () => {
    const timestamp = new Date().toISOString()
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'running' })],
      messages: [{ role: 'user', content: 'hello', timestamp } as never],
    })

    useSessionStore.getState().handleChatPatch({
      sessionId: 'session-1',
      type: 'append',
      message: { role: 'assistant', content: 'part 1', timestamp: 'assistant-ts' } as never,
      streaming: true,
      error: '',
    })

    useSessionStore.getState().handleChatPatch({
      sessionId: 'session-1',
      type: 'upsert_last',
      message: { role: 'assistant', content: 'part 1 part 2', timestamp: 'assistant-ts' } as never,
      streaming: true,
      error: '',
    })

    const state = useSessionStore.getState()
    expect(state.messages).toEqual([
      { role: 'user', content: 'hello', timestamp },
      { role: 'assistant', content: 'part 1 part 2', timestamp: 'assistant-ts' },
    ])
    expect(state.streaming).toBe(true)
    expect(state.sessions[0]?.status).toBe('running')
  })

  it('opens a new assistant bubble when a later turn streams after the previous one is finalized', () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'running' })],
      messages: [
        { role: 'user', content: 'hello', timestamp: 'user-ts' } as never,
        { role: 'assistant', content: '回复1', timestamp: 'assistant-1', partial: false } as never,
      ],
      streaming: false,
    })

    // Backend creates a new message (new timestamp) for multi-turn reply 3
    // and emits upsert_last; frontend must append instead of overwriting reply 1.
    useSessionStore.getState().handleChatPatch({
      sessionId: 'session-1',
      type: 'upsert_last',
      message: { role: 'assistant', content: '回复3', timestamp: 'assistant-3', partial: true } as never,
      streaming: true,
      error: '',
    })

    const state = useSessionStore.getState()
    expect(state.messages).toEqual([
      { role: 'user', content: 'hello', timestamp: 'user-ts' },
      { role: 'assistant', content: '回复1', timestamp: 'assistant-1', partial: false },
      { role: 'assistant', content: '回复3', timestamp: 'assistant-3', partial: true },
    ])
    expect(state.streaming).toBe(true)
  })

  it('keeps the current conversation intact when a background session receives a streaming patch', () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [
        makeSession({ id: 'session-1', status: 'idle' }),
        makeSession({ id: 'session-2', status: 'running', name: 'Background Session' }),
      ],
      messages: [{ role: 'assistant', content: 'foreground', timestamp: 'fg-ts' } as never],
    })

    useSessionStore.getState().handleChatPatch({
      sessionId: 'session-2',
      type: 'append',
      message: { role: 'assistant', content: 'background', timestamp: 'bg-ts' } as never,
      streaming: true,
      error: '',
    })

    const state = useSessionStore.getState()
    expect(state.messages).toEqual([{ role: 'assistant', content: 'foreground', timestamp: 'fg-ts' }])
    expect(state.streaming).toBe(false)
    expect(state.sessions.find((session) => session.id === 'session-2')?.status).toBe('running')
    // Background patches must still be buffered so switching back does not lose them.
    expect(state.agentStreamMessages['session-2']).toEqual([
      { role: 'assistant', content: 'background', timestamp: 'bg-ts' },
    ])
  })

  it('buffers a parent user message while the child session is selected', () => {
    useSessionStore.setState({
      selectedId: 'child-1',
      sessions: [
        makeSession({ id: 'parent-1', status: 'running', name: 'Parent' }),
        makeSession({ id: 'child-1', status: 'idle', name: 'Child', parentSessionId: 'parent-1' }),
      ],
      messages: [{ role: 'assistant', content: 'child view', timestamp: 'child-ts' } as never],
      agentStreamMessages: {
        'parent-1': [{ role: 'assistant', content: 'old parent', timestamp: 'old-ts' } as never],
      },
      agentStreams: {
        'parent-1': { phase: 'running', lastSequence: 3 },
      },
    })

    useSessionStore.getState().handleChatPatch({
      sessionId: 'parent-1',
      type: 'append',
      message: { role: 'user', content: 'follow up for parent', timestamp: 'user-ts' } as never,
      streaming: true,
      error: '',
    })

    const state = useSessionStore.getState()
    expect(state.selectedId).toBe('child-1')
    expect(state.messages).toEqual([{ role: 'assistant', content: 'child view', timestamp: 'child-ts' }])
    expect(state.agentStreamMessages['parent-1']).toEqual([
      { role: 'assistant', content: 'old parent', timestamp: 'old-ts' },
      { role: 'user', content: 'follow up for parent', timestamp: 'user-ts' },
    ])
  })

  it('snapshots the live transcript when switching sessions so parent messages survive child navigation', () => {
    useSessionStore.setState({
      selectedId: 'parent-1',
      sessions: [
        makeSession({ id: 'parent-1', status: 'running', name: 'Parent' }),
        makeSession({ id: 'child-1', status: 'idle', name: 'Child', parentSessionId: 'parent-1' }),
      ],
      messages: [
        { role: 'user', content: 'just sent', timestamp: 'u1' } as never,
        { role: 'assistant', content: 'working…', timestamp: 'a1' } as never,
      ],
      agentStreamMessages: {},
      agentStreams: {
        'parent-1': { phase: 'running', lastSequence: 1 },
      },
    })

    serviceMocks.processService.GetChatState.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'child history' }],
      streaming: false,
      error: '',
    })

    useSessionStore.getState().select('child-1')

    const state = useSessionStore.getState()
    expect(state.selectedId).toBe('child-1')
    expect(state.agentStreamMessages['parent-1']).toEqual([
      { role: 'user', content: 'just sent', timestamp: 'u1' },
      { role: 'assistant', content: 'working…', timestamp: 'a1' },
    ])
  })

  it('flushes session-scoped pending composer messages after the parent turn becomes idle', async () => {
    serviceMocks.processService.SendMessage.mockResolvedValue(undefined)
    useDraftStore.getState().enqueuePending('parent-1', { text: 'queued while streaming' })
    useSessionStore.setState({
      selectedId: 'child-1',
      sessions: [
        makeSession({ id: 'parent-1', status: 'idle', name: 'Parent' }),
        makeSession({ id: 'child-1', status: 'idle', name: 'Child', parentSessionId: 'parent-1' }),
      ],
      streaming: false,
      agentStreams: {
        'parent-1': { phase: 'done', lastSequence: 4 },
      },
    })

    await useSessionStore.getState().flushPendingMessages('parent-1')

    expect(serviceMocks.processService.SendMessage).toHaveBeenCalledWith('parent-1', 'queued while streaming')
    expect(useDraftStore.getState().pendingBySession['parent-1']).toBeUndefined()
  })

  it('applies normalized deltas once and shields the active turn from legacy patches', () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'idle' })],
      messages: [{ role: 'user', content: 'hello' } as never],
    })

    useSessionStore.getState().handleAgentStreamEvent({
      type: 'text_delta', sessionId: 'session-1', sequence: 1, itemId: 'reply-1', delta: 'Hello ',
    })
    useSessionStore.getState().handleAgentStreamEvent({
      type: 'text_delta', sessionId: 'session-1', sequence: 2, itemId: 'reply-1', delta: 'world',
    })
    useSessionStore.getState().handleAgentStreamEvent({
      type: 'text_delta', sessionId: 'session-1', sequence: 2, itemId: 'reply-1', delta: 'world',
    })
    // rAF batcher: apply pending deltas in one store set
    flushAgentStreamBatches('session-1')
    useSessionStore.getState().handleChatPatch({
      sessionId: 'session-1',
      type: 'upsert_last',
      message: { role: 'assistant', content: 'Hello worldworld', timestamp: 'legacy' } as never,
      streaming: true,
      error: '',
    })

    const state = useSessionStore.getState()
    expect(state.messages.map(message => message.content)).toEqual(['hello', 'Hello world'])
    expect(state.agentStreamMessages['session-1']).toBe(state.messages)
    expect(state.agentStreams['session-1']?.lastSequence).toBe(2)
    expect(state.streaming).toBe(true)
  })

  it('fail-opens legacy chat paths after agent stream silence timeout', async () => {
    const silencedAt = Date.now() - 20_000
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'running' })],
      messages: [{ role: 'user', content: 'hello' } as never],
      agentStreamMessages: {
        'session-1': [{ role: 'user', content: 'hello' } as never],
      },
      streaming: true,
      agentStreams: {
        'session-1': { phase: 'running', lastSequence: 2, lastEventAt: silencedAt },
      },
    })

    useSessionStore.getState().handleChatPatch({
      sessionId: 'session-1',
      type: 'upsert_last',
      message: { role: 'assistant', content: 'recovered via patch', timestamp: 'legacy-ts' } as never,
      streaming: true,
      error: '',
    })

    expect(useSessionStore.getState().messages.map(m => m.content)).toEqual([
      'hello',
      'recovered via patch',
    ])
    expect(useSessionStore.getState().streaming).toBe(true)
    // Still active phase after streaming:true recovery; silence only unblocks legacy.
    expect(useSessionStore.getState().agentStreams['session-1']?.phase).toBe('running')

    useSessionStore.getState().handleChatUpdate({
      sessionId: 'session-1',
      messages: [
        { role: 'user', content: 'hello' } as never,
        { role: 'assistant', content: 'final from update' } as never,
      ],
      streaming: true,
      error: '',
    })
    expect(useSessionStore.getState().messages.map(m => m.content)).toEqual([
      'hello',
      'final from update',
    ])

    serviceMocks.processService.GetChatState.mockResolvedValue({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'polled recovery' },
      ],
      streaming: false,
      error: '',
    })
    // Re-silence so poll is allowed (handleChatUpdate above did not refresh lastEventAt).
    useSessionStore.setState(state => ({
      agentStreams: {
        ...state.agentStreams,
        'session-1': { phase: 'running', lastSequence: 2, lastEventAt: silencedAt },
      },
      streaming: true,
    }))

    await useSessionStore.getState().pollChat('session-1')

    const afterPoll = useSessionStore.getState()
    expect(afterPoll.messages.map(m => m.content)).toEqual(['hello', 'polled recovery'])
    expect(afterPoll.streaming).toBe(false)
    expect(afterPoll.agentStreams['session-1']?.phase).toBe('done')
  })

  it('fail-opens immediately when legacy reports streaming:false while stream is active', () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'running' })],
      messages: [
        { role: 'user', content: 'hello' } as never,
        { role: 'assistant', content: 'partial', partial: true } as never,
      ],
      agentStreamMessages: {
        'session-1': [
          { role: 'user', content: 'hello' } as never,
          { role: 'assistant', content: 'partial', partial: true } as never,
        ],
      },
      streaming: true,
      agentStreams: {
        'session-1': {
          phase: 'running',
          lastSequence: 5,
          lastEventAt: Date.now(),
          plan: { entries: [{ id: '1', title: 'step', status: 'in_progress' }] },
          statusMessage: 'working',
        },
      },
    })

    useSessionStore.getState().handleChatUpdate({
      sessionId: 'session-1',
      messages: [
        { role: 'user', content: 'hello' } as never,
        { role: 'assistant', content: 'complete reply' } as never,
      ],
      streaming: false,
      error: '',
    })

    const state = useSessionStore.getState()
    expect(state.messages.map(m => m.content)).toEqual(['hello', 'complete reply'])
    expect(state.streaming).toBe(false)
    expect(state.agentStreams['session-1']?.phase).toBe('done')
    expect(state.agentStreams['session-1']?.plan).toBeUndefined()
    expect(state.agentStreams['session-1']?.statusMessage).toBeUndefined()
    expect(state.sessions[0]?.status).toBe('idle')
  })

  it('still ignores live legacy upsert while agent stream is freshly active', () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'running' })],
      messages: [
        { role: 'user', content: 'hello' } as never,
        { role: 'assistant', content: 'from stream' } as never,
      ],
      agentStreamMessages: {
        'session-1': [
          { role: 'user', content: 'hello' } as never,
          { role: 'assistant', content: 'from stream' } as never,
        ],
      },
      streaming: true,
      agentStreams: {
        'session-1': { phase: 'running', lastSequence: 2, lastEventAt: Date.now() },
      },
    })

    useSessionStore.getState().handleChatPatch({
      sessionId: 'session-1',
      type: 'upsert_last',
      message: { role: 'assistant', content: 'legacy should not win', timestamp: 'legacy' } as never,
      streaming: true,
      error: '',
    })
    useSessionStore.getState().handleChatUpdate({
      sessionId: 'session-1',
      messages: [{ role: 'assistant', content: 'legacy update should not win' } as never],
      streaming: true,
      error: '',
    })

    const state = useSessionStore.getState()
    expect(state.messages.map(m => m.content)).toEqual(['hello', 'from stream'])
    expect(state.agentStreams['session-1']?.phase).toBe('running')
  })

  it('buffers background normalized streams without replacing the selected conversation', () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [
        makeSession({ id: 'session-1', status: 'idle' }),
        makeSession({ id: 'session-2', status: 'idle' }),
      ],
      messages: [{ role: 'assistant', content: 'foreground' } as never],
    })

    useSessionStore.getState().handleAgentStreamEvent({
      type: 'text_delta', sessionId: 'session-2', sequence: 1, itemId: 'reply-2', delta: 'background',
    })
    flushAgentStreamBatches('session-2')

    const state = useSessionStore.getState()
    expect(state.messages[0]?.content).toBe('foreground')
    expect(state.streaming).toBe(false)
    expect(state.agentStreamMessages['session-2']?.[0]?.content).toBe('background')
    expect(state.sessions.find(session => session.id === 'session-2')?.status).toBe('running')
  })

  it('merges consecutive text_delta into a single store update before flush', () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'idle' })],
      messages: [],
    })

    useSessionStore.getState().handleAgentStreamEvent({
      type: 'text_delta', sessionId: 'session-1', sequence: 1, itemId: 'reply-1', delta: 'A',
    })
    useSessionStore.getState().handleAgentStreamEvent({
      type: 'text_delta', sessionId: 'session-1', sequence: 2, itemId: 'reply-1', delta: 'B',
    })
    useSessionStore.getState().handleAgentStreamEvent({
      type: 'text_delta', sessionId: 'session-1', sequence: 3, itemId: 'reply-1', delta: 'C',
    })
    // Pending batch must not mutate store until flush (or rAF)
    expect(useSessionStore.getState().messages).toEqual([])
    expect(useSessionStore.getState().agentStreams['session-1']).toBeUndefined()

    flushAgentStreamBatches('session-1')

    expect(useSessionStore.getState().messages.map(m => m.content)).toEqual(['ABC'])
    expect(useSessionStore.getState().agentStreams['session-1']?.lastSequence).toBe(3)
    expect(useSessionStore.getState().streaming).toBe(true)
  })

  it('shows cancellation immediately and settles after the process stops', async () => {
    let finishStop: (() => void) | undefined
    serviceMocks.processService.StopProcess.mockImplementation(() => (
      new Promise<void>(resolve => { finishStop = resolve })
    ))
    serviceMocks.sessionService.GetAll.mockResolvedValue([makeSession({ status: 'idle' })])
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'running' })],
      streaming: true,
      agentStreams: {
        'session-1': { phase: 'running', lastSequence: 2 },
      },
    })

    const stopping = useSessionStore.getState().stopProcess('session-1')
    expect(useSessionStore.getState().agentStreams['session-1']?.phase).toBe('cancelling')
    expect(useSessionStore.getState().streaming).toBe(true)

    finishStop?.()
    await stopping

    expect(useSessionStore.getState().agentStreams['session-1']?.phase).toBe('cancelled')
    expect(useSessionStore.getState().streaming).toBe(false)
  })

  it('routes image messages through SendMessageWithImages without extra local image cache state', async () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'idle' })],
    })

    await useSessionStore.getState().sendMessage('session-1', 'look', [
      { data: 'abcd', mimeType: 'image/png' },
    ])

    expect(serviceMocks.processService.SendMessageWithImages).toHaveBeenCalledWith('session-1', 'look', [
      { data: 'abcd', mimeType: 'image/png' },
    ])
    expect(serviceMocks.processService.SendMessage).not.toHaveBeenCalled()
    expect(useSessionStore.getState().messages).toEqual([])
  })

  it('localizes the codex busy-turn error after a stop-send race', async () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'idle' })],
    })

    serviceMocks.processService.SendMessage.mockRejectedValue(
      new Error('Codex is still processing the previous turn'),
    )

    await expect(
      useSessionStore.getState().sendMessage('session-1', 'retry'),
    ).rejects.toThrow('Codex is still processing the previous turn')

    const state = useSessionStore.getState()
    expect(state.streaming).toBe(false)
    expect(state.chatError).toBe('Codex 仍在处理上一轮请求，请稍候片刻再发送。')
    expect(state.sessions[0]?.status).toBe('idle')
  })

  it('cleans up managed worktrees when removing a parent session', async () => {
    const parentWorktree = 'C:/repo/.allbeingsfuture-worktrees/session-parent'
    const childWorktree = 'C:/repo/.allbeingsfuture-worktrees/session-child'

    useSessionStore.setState({
      selectedId: 'session-1',
      messages: [{ role: 'assistant', content: 'to be cleared' } as never],
      streaming: true,
      chatError: 'busy',
      sessions: [
        makeSession({
          id: 'session-1',
          name: 'Parent Session',
          workingDirectory: parentWorktree,
          worktreePath: parentWorktree,
          worktreeBranch: 'worktree-parent',
          worktreeSourceRepo: 'C:/repo',
        }),
        makeSession({
          id: 'child-1',
          name: 'Child Session',
          workingDirectory: childWorktree,
          worktreePath: childWorktree,
          worktreeBranch: 'worktree-child',
          worktreeSourceRepo: 'C:/repo',
          parentSessionId: 'session-1',
        }),
      ],
    })

    serviceMocks.processService.StopProcess.mockResolvedValue(undefined)
    serviceMocks.gitService.RemoveWorktree.mockResolvedValue(undefined)
    serviceMocks.sessionService.Delete.mockResolvedValue(undefined)

    await useSessionStore.getState().remove('session-1')

    expect(serviceMocks.processService.StopProcess).toHaveBeenCalledWith('session-1')
    expect(serviceMocks.processService.StopProcess).toHaveBeenCalledWith('child-1')
    expect(serviceMocks.gitService.RemoveWorktree).toHaveBeenCalledWith('C:/repo', parentWorktree, true)
    expect(serviceMocks.gitService.RemoveWorktree).toHaveBeenCalledWith('C:/repo', childWorktree, true)
    expect(serviceMocks.sessionService.Delete).toHaveBeenCalledWith('session-1')

    const state = useSessionStore.getState()
    expect(state.sessions).toEqual([])
    expect(state.selectedId).toBeNull()
    expect(state.messages).toEqual([])
    expect(state.streaming).toBe(false)
    expect(state.chatError).toBe('')
  })

  it('clears agentStreams and agentStreamMessages for the removed session subtree', async () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [
        makeSession({ id: 'session-1', name: 'Parent' }),
        makeSession({ id: 'child-1', name: 'Child', parentSessionId: 'session-1' }),
        makeSession({ id: 'other-1', name: 'Other' }),
      ],
      agentStreams: {
        'session-1': { phase: 'running', lastSequence: 2 },
        'child-1': { phase: 'done', lastSequence: 1 },
        'other-1': { phase: 'idle', lastSequence: -1 },
      },
      agentStreamMessages: {
        'session-1': [{ role: 'assistant', content: 'parent stream' } as never],
        'child-1': [{ role: 'assistant', content: 'child stream' } as never],
        'other-1': [{ role: 'assistant', content: 'keep me' } as never],
      },
    })

    serviceMocks.processService.StopProcess.mockResolvedValue(undefined)
    serviceMocks.sessionService.Delete.mockResolvedValue(undefined)

    await useSessionStore.getState().remove('session-1')

    const state = useSessionStore.getState()
    expect(state.agentStreams['session-1']).toBeUndefined()
    expect(state.agentStreams['child-1']).toBeUndefined()
    expect(state.agentStreamMessages['session-1']).toBeUndefined()
    expect(state.agentStreamMessages['child-1']).toBeUndefined()
    expect(state.agentStreams['other-1']?.phase).toBe('idle')
    expect(state.agentStreamMessages['other-1']).toEqual([
      { role: 'assistant', content: 'keep me' },
    ])
  })

  it('preserves a concurrent user append when stream batch flush reduces inside set()', () => {
    useSessionStore.setState({
      selectedId: 'session-1',
      sessions: [makeSession({ status: 'running' })],
      messages: [{ role: 'user', content: 'hello' } as never],
      agentStreamMessages: {
        'session-1': [{ role: 'user', content: 'hello' } as never],
      },
      agentStreams: {
        'session-1': { phase: 'running', lastSequence: 0 },
      },
    })

    // Queue a stream delta without flushing yet.
    useSessionStore.getState().handleAgentStreamEvent({
      type: 'text_delta',
      sessionId: 'session-1',
      sequence: 1,
      itemId: 'reply-1',
      delta: 'partial',
    })

    // User append lands while the batch is still pending (simulates mid-batch race).
    useSessionStore.getState().handleChatPatch({
      sessionId: 'session-1',
      type: 'append',
      message: { role: 'user', content: 'follow up', timestamp: 'user-2' } as never,
      streaming: true,
      error: '',
    })

    flushAgentStreamBatches('session-1')

    const state = useSessionStore.getState()
    const contents = state.messages.map(message => message.content)
    expect(contents).toContain('follow up')
    expect(contents).toContain('partial')
    expect(state.agentStreamMessages['session-1']?.map(m => m.content)).toEqual(contents)
  })

  it('renames sessions and can generate a smart name from stored messages', async () => {
    useSessionStore.setState({
      sessions: [
        makeSession({
          id: 'session-1',
          name: 'Old Name',
          messagesJson: JSON.stringify([
            { role: 'user', content: '清理删除会话 worktree 并支持重命名' },
          ]),
        }),
      ],
    })

    serviceMocks.sessionService.UpdateName.mockResolvedValue(undefined)

    await useSessionStore.getState().rename('session-1', '手动改名')
    const smartName = await useSessionStore.getState().smartRename('session-1')

    expect(serviceMocks.sessionService.UpdateName).toHaveBeenNthCalledWith(1, 'session-1', '手动改名')
    expect(serviceMocks.sessionService.UpdateName).toHaveBeenNthCalledWith(2, 'session-1', '清理删除会话 worktree 并支持重命名')
    expect(smartName).toBe('清理删除会话 worktree 并支持重命名')
    expect(useSessionStore.getState().sessions[0]?.name).toBe('清理删除会话 worktree 并支持重命名')
  })

  it('reloads sessions after a successful worktree merge so merged state is reflected immediately', async () => {
    const mergedSession = makeSession({
      id: 'session-merged',
      workingDirectory: 'C:/repo',
      worktreePath: 'C:/repo/.allbeingsfuture-worktrees/session-merged',
      worktreeBranch: 'worktree-session-merged',
      worktreeMerged: true,
      worktreeSourceRepo: 'C:/repo',
    })

    useSessionStore.setState({
      sessions: [
        makeSession({
          id: 'session-merged',
          workingDirectory: 'C:/repo/.allbeingsfuture-worktrees/session-merged',
          worktreePath: 'C:/repo/.allbeingsfuture-worktrees/session-merged',
          worktreeBranch: 'worktree-session-merged',
          worktreeSourceRepo: 'C:/repo',
        }),
      ],
    })

    serviceMocks.gitService.MergeWorktree.mockResolvedValue({
      success: true,
      mergedBranch: 'worktree-session-merged',
      targetBranch: 'main',
      hasConflicts: false,
      conflictFiles: [],
      autoResolved: false,
      message: 'merged and cleaned',
    })
    serviceMocks.gitService.ListWorktrees.mockResolvedValue([])
    serviceMocks.sessionService.GetAll.mockResolvedValue([mergedSession])

    const result = await useGitStore.getState().mergeWorktree('C:/repo', 'worktree-session-merged', 'main')

    expect(serviceMocks.gitService.MergeWorktree).toHaveBeenCalledWith('C:/repo', 'worktree-session-merged', 'main')
    expect(serviceMocks.sessionService.GetAll).toHaveBeenCalled()
    expect(result?.success).toBe(true)
    expect(useSessionStore.getState().sessions[0]).toEqual(mergedSession)
  })
})

describe('sessionStore load/create race', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    resetStore()
    resetGitStore()
  })

  it('does not drop sessions created while load GetAll is in flight', async () => {
    const existing = makeSession({ id: 'old', name: 'Old' })
    const created = makeSession({ id: 'new', name: 'New' })
    useSessionStore.setState({ sessions: [existing] })

    let resolveGetAll!: (value: Session[]) => void
    serviceMocks.sessionService.GetAll.mockReturnValue(
      new Promise<Session[]>(resolve => {
        resolveGetAll = resolve
      }),
    )
    serviceMocks.sessionService.Create.mockResolvedValue(created)

    const loadPromise = useSessionStore.getState().load()
    const createdSession = await useSessionStore.getState().create({
      name: 'New',
      workingDirectory: 'C:/repo',
      providerId: 'codex',
    } as any)

    expect(createdSession?.id).toBe('new')
    expect(useSessionStore.getState().sessions.some(s => s.id === 'new')).toBe(true)

    // Stale GetAll: server list still missing the newly created session.
    resolveGetAll([existing])
    await loadPromise

    const ids = useSessionStore.getState().sessions.map(s => s.id)
    expect(ids).toContain('new')
    expect(ids).toContain('old')
    expect(useSessionStore.getState().loading).toBe(false)
  })

  it('create functional update keeps other sessions already in the store', async () => {
    const keepA = makeSession({ id: 'keep-a', name: 'Keep A' })
    const keepB = makeSession({ id: 'keep-b', name: 'Keep B' })
    const created = makeSession({ id: 'created', name: 'Created' })
    useSessionStore.setState({ sessions: [keepA, keepB] })

    // Simulate create await window where store already has concurrent sessions.
    let resolveCreate!: (value: Session) => void
    serviceMocks.sessionService.Create.mockReturnValue(
      new Promise<Session>(resolve => {
        resolveCreate = resolve
      }),
    )

    const createPromise = useSessionStore.getState().create({
      name: 'Created',
      workingDirectory: 'C:/repo',
      providerId: 'codex',
    } as any)

    // Another session appears while Create is in flight (e.g. agent child load path).
    const concurrent = makeSession({ id: 'concurrent', name: 'Concurrent' })
    useSessionStore.setState(state => ({
      sessions: [concurrent, ...state.sessions],
    }))

    resolveCreate(created)
    const result = await createPromise

    expect(result?.id).toBe('created')
    const ids = useSessionStore.getState().sessions.map(s => s.id)
    expect(ids).toContain('created')
    expect(ids).toContain('keep-a')
    expect(ids).toContain('keep-b')
    expect(ids).toContain('concurrent')
  })
})

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
    CreateWorktree: vi.fn(),
    RemoveWorktree: vi.fn(),
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

import { useSessionStore } from '../sessionStore'

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
  useSessionStore.setState({
    sessions: [],
    selectedId: null,
    loading: false,
    messages: [],
    streaming: false,
    chatError: '',
    agents: {},
    childToParent: {},
  })
}

describe('sessionStore runtime status sync', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    resetStore()
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
})

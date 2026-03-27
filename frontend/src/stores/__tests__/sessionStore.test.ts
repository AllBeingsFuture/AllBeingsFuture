import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../../../bindings/allbeingsfuture/internal/models/models'

const serviceMocks = vi.hoisted(() => ({
  sessionService: {
    GetAll: vi.fn(),
    Create: vi.fn(),
    Delete: vi.fn(),
    End: vi.fn(),
    MarkWorktreeMerged: vi.fn(),
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
  ProcessService: serviceMocks.processService,
}))

vi.mock('../../../bindings/allbeingsfuture/internal/services/processservice', () => ({
  ResumeSession: serviceMocks.processApi.ResumeSession,
  ListAllAgents: serviceMocks.processApi.ListAllAgents,
}))

import { useSessionStore } from '../sessionStore'

function makeSession(overrides: Partial<Session> = {}): Session {
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
    sentImages: [],
  })
}

describe('sessionStore runtime status sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
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
})

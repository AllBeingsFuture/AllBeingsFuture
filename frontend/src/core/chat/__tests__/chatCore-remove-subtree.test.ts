import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../../../../bindings/allbeingsfuture/internal/models/models'
import { chatCore, collectSessionSubtreeIds, type ChatSnapshot } from '../chatCore'

const serviceMocks = vi.hoisted(() => ({
  sessionService: {
    Delete: vi.fn(),
  },
  processService: {
    StopProcess: vi.fn(),
  },
  gitService: {
    RemoveWorktree: vi.fn(),
  },
}))

vi.mock('../../../../bindings/allbeingsfuture/internal/services', () => ({
  SessionService: serviceMocks.sessionService,
  ProcessService: serviceMocks.processService,
  GitService: serviceMocks.gitService,
}))

vi.mock('../../../../bindings/allbeingsfuture/internal/services/processservice', () => ({
  ResumeSession: vi.fn(),
  ListAllAgents: vi.fn(),
  SpawnChildSession: vi.fn(),
  SendToChild: vi.fn(),
  CloseChildSession: vi.fn(),
}))

function makeSession(overrides: Partial<Session> & { parentSessionId?: string } = {}): Session {
  return {
    id: 'session-1',
    name: 'Test',
    workingDirectory: '/tmp/repo',
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

function emptySnapshot(overrides: Partial<ChatSnapshot> = {}): ChatSnapshot {
  return {
    sessions: [],
    selectedId: null,
    messages: [],
    streaming: false,
    chatError: '',
    agents: {},
    childToParent: {},
    ...overrides,
  }
}

describe('collectSessionSubtreeIds', () => {
  it('includes root and multi-level descendants', () => {
    const sessions = [
      makeSession({ id: 'grandpa' }),
      makeSession({ id: 'father', parentSessionId: 'grandpa' }),
      makeSession({ id: 'son', parentSessionId: 'father' }),
      makeSession({ id: 'cousin', parentSessionId: 'other' }),
      makeSession({ id: 'peer' }),
    ]
    const ids = collectSessionSubtreeIds(sessions, 'grandpa')
    expect([...ids].sort()).toEqual(['father', 'grandpa', 'son'])
  })

  it('returns only root when there are no children', () => {
    const sessions = [makeSession({ id: 'alone' }), makeSession({ id: 'other' })]
    expect([...collectSessionSubtreeIds(sessions, 'alone')]).toEqual(['alone'])
  })
})

describe('chatCore.remove recursive descendants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMocks.sessionService.Delete.mockResolvedValue(undefined)
    serviceMocks.processService.StopProcess.mockResolvedValue(undefined)
    serviceMocks.gitService.RemoveWorktree.mockResolvedValue(undefined)
  })

  it('stops, cleans worktrees, and drops father+son when removing grandpa', async () => {
    const grandpaWorktree = '/tmp/repo/.allbeingsfuture-worktrees/grandpa'
    const fatherWorktree = '/tmp/repo/.allbeingsfuture-worktrees/father'
    const sonWorktree = '/tmp/repo/.allbeingsfuture-worktrees/son'

    const snapshot = emptySnapshot({
      selectedId: 'son',
      messages: [{ role: 'assistant', content: 'live' } as never],
      streaming: true,
      chatError: 'x',
      sessions: [
        makeSession({
          id: 'grandpa',
          workingDirectory: grandpaWorktree,
          worktreePath: grandpaWorktree,
          worktreeSourceRepo: '/tmp/repo',
        }),
        makeSession({
          id: 'father',
          parentSessionId: 'grandpa',
          workingDirectory: fatherWorktree,
          worktreePath: fatherWorktree,
          worktreeSourceRepo: '/tmp/repo',
        }),
        makeSession({
          id: 'son',
          parentSessionId: 'father',
          workingDirectory: sonWorktree,
          worktreePath: sonWorktree,
          worktreeSourceRepo: '/tmp/repo',
        }),
        makeSession({ id: 'unrelated' }),
      ],
    })

    const patch = await chatCore.remove(snapshot, 'grandpa')

    expect(serviceMocks.processService.StopProcess).toHaveBeenCalledWith('grandpa')
    expect(serviceMocks.processService.StopProcess).toHaveBeenCalledWith('father')
    expect(serviceMocks.processService.StopProcess).toHaveBeenCalledWith('son')
    expect(serviceMocks.gitService.RemoveWorktree).toHaveBeenCalledWith('/tmp/repo', grandpaWorktree, true)
    expect(serviceMocks.gitService.RemoveWorktree).toHaveBeenCalledWith('/tmp/repo', fatherWorktree, true)
    expect(serviceMocks.gitService.RemoveWorktree).toHaveBeenCalledWith('/tmp/repo', sonWorktree, true)
    expect(serviceMocks.sessionService.Delete).toHaveBeenCalledWith('grandpa')

    expect(patch.sessions.map((s) => s.id)).toEqual(['unrelated'])
    expect(patch.selectedId).toBeNull()
    expect(patch.messages).toEqual([])
    expect(patch.streaming).toBe(false)
    expect(patch.chatError).toBe('')
  })

  it('only removes direct child when deleting a leaf parent (one level)', async () => {
    const snapshot = emptySnapshot({
      sessions: [
        makeSession({ id: 'parent' }),
        makeSession({ id: 'child', parentSessionId: 'parent' }),
        makeSession({ id: 'other' }),
      ],
    })

    const patch = await chatCore.remove(snapshot, 'parent')
    expect(patch.sessions.map((s) => s.id)).toEqual(['other'])
    expect(serviceMocks.processService.StopProcess).toHaveBeenCalledTimes(2)
  })
})

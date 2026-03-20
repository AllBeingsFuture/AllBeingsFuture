import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../../../../bindings/allbeingsfuture/internal/models/models'
import ConversationView from '../ConversationView'
import { renderWithProviders, waitFor } from '../../../test/render'

const storeState = {
  messages: [],
  streaming: false,
  chatError: '',
  sendMessage: vi.fn(),
  pollChat: vi.fn().mockResolvedValue(undefined),
  initProcess: vi.fn().mockResolvedValue(undefined),
  handleChatUpdate: vi.fn(),
  handleAgentUpdate: vi.fn(),
  stopProcess: vi.fn(),
  childToParent: {} as Record<string, unknown>,
}

const uiState = {
  shellPanelVisible: false,
}

vi.mock('../../../stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: typeof storeState) => unknown) =>
    typeof selector === 'function' ? selector(storeState) : storeState,
}))

vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector?: (state: typeof uiState) => unknown) =>
    typeof selector === 'function' ? selector(uiState) : uiState,
}))

vi.mock('../../../hooks/useIpcEvent', () => ({
  useIpcEvent: vi.fn(),
}))

vi.mock('../MessageBubble', () => ({
  default: () => null,
}))

vi.mock('../MessageInput', () => ({
  default: () => null,
}))

vi.mock('../SessionToolbar', () => ({
  default: () => null,
}))

vi.mock('../ToolOperationGroup', () => ({
  default: () => null,
}))

vi.mock('../FileChangeCard', () => ({
  default: () => null,
}))

vi.mock('../../terminal/ShellTerminalView', () => ({
  default: () => null,
}))

function makeSession(status: Session['status']): Session {
  return {
    id: 'session-1',
    name: 'Claude Session',
    workingDirectory: 'C:/repo',
    providerId: 'claude-code',
    status,
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
  } as Session
}

describe('ConversationView session boot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.messages = []
    storeState.streaming = false
    storeState.chatError = ''
  })

  it('always calls initProcess on mount to ensure adapter is ready', async () => {
    renderWithProviders(<ConversationView session={makeSession('idle')} />)

    await waitFor(() => {
      expect(storeState.pollChat).toHaveBeenCalledWith('session-1')
      expect(storeState.initProcess).toHaveBeenCalledWith('session-1')
    })
  })

  it('calls initProcess for running sessions so live output can resume', async () => {
    renderWithProviders(<ConversationView session={makeSession('running')} />)

    await waitFor(() => {
      expect(storeState.initProcess).toHaveBeenCalledWith('session-1')
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, Session } from '../../../../bindings/allbeingsfuture/internal/models/models'
import type { ConversationMessage } from '../../../types/conversationTypes'
import ConversationView, { extractFileChanges } from '../ConversationView'
import { renderWithProviders, screen, waitFor } from '../../../test/render'

const initSessionMock = vi.fn().mockResolvedValue(undefined)

const storeState = {
  messages: [] as ChatMessage[],
  streaming: false,
  chatError: '',
  sendMessage: vi.fn(),
  pollChat: vi.fn().mockResolvedValue(undefined),
  handleChatUpdate: vi.fn(),
  handleChatPatch: vi.fn(),
  handleAgentUpdate: vi.fn(),
  stopProcess: vi.fn(),
  childToParent: {} as Record<string, unknown>,
}

const uiState = {
  shellPanelVisible: false,
}

const toolOperationGroupMock = vi.fn(({ messages }: { messages: ConversationMessage[] }) => (
  <div data-testid="tool-group">{messages.map((message) => message.toolName).join(',')}</div>
))

const fileChangeCardMock = vi.fn(({ message }: { message: ConversationMessage }) => (
  <div data-testid="file-change-card">{message.toolName}:{message.fileChange?.filePath}</div>
))

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

vi.mock('../../../app/api/workbench', () => ({
  workbenchApi: {
    session: {
      init: (...args: unknown[]) => initSessionMock(...args),
    },
    chat: {
      appendMessage: vi.fn(),
      stop: vi.fn(),
    },
  },
}))

vi.mock('../MessageBubble', () => ({
  default: () => null,
}))

vi.mock('../MessageInput', () => ({
  default: () => <div data-testid="message-input" style={{ height: 84 }} />,
}))

vi.mock('../SessionToolbar', () => ({
  default: () => null,
}))

vi.mock('../ToolOperationGroup', () => ({
  default: (props: { messages: ConversationMessage[] }) => toolOperationGroupMock(props),
}))

vi.mock('../FileChangeCard', () => ({
  default: (props: { message: ConversationMessage }) => fileChangeCardMock(props),
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

const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

function mockConversationContainerMetrics(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (this.getAttribute?.('data-scroll-container') !== null) return scrollHeight
      return originalScrollHeight?.get?.call(this) ?? 0
    },
  })

  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      if (this.getAttribute?.('data-scroll-container') !== null) return clientHeight
      return originalClientHeight?.get?.call(this) ?? 0
    },
  })
}

function restoreConversationContainerMetrics() {
  if (originalScrollHeight) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
  }

  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
  }
}

describe('ConversationView session boot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initSessionMock.mockReset()
    initSessionMock.mockResolvedValue(undefined)
    storeState.messages = []
    storeState.streaming = false
    storeState.chatError = ''
    toolOperationGroupMock.mockClear()
    fileChangeCardMock.mockClear()
  })

  afterEach(() => {
    restoreConversationContainerMetrics()
  })

  it('always calls initProcess on mount to ensure adapter is ready', async () => {
    renderWithProviders(<ConversationView session={makeSession('idle')} />)

    await waitFor(() => {
      expect(storeState.pollChat).toHaveBeenCalledWith('session-1')
      expect(initSessionMock).toHaveBeenCalledWith('session-1')
    })
  })

  it('calls initProcess for running sessions so live output can resume', async () => {
    renderWithProviders(<ConversationView session={makeSession('running')} />)

    await waitFor(() => {
      expect(initSessionMock).toHaveBeenCalledWith('session-1')
    })
  })

  it('pins the conversation scroll container to bottom immediately when opening history', async () => {
    mockConversationContainerMetrics(640, 280)
    storeState.messages = [
      { role: 'user', content: 'hello' } as ChatMessage,
      { role: 'assistant', content: 'world' } as ChatMessage,
    ]

    const { container } = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = container.querySelector('[data-scroll-container]') as HTMLDivElement

    await waitFor(() => {
      expect(initSessionMock).toHaveBeenCalledWith('session-1')
    })

    expect(scrollContainer.scrollTop).toBe(360)
  })

  it('pins the conversation to bottom when history arrives after mount', async () => {
    mockConversationContainerMetrics(640, 280)
    storeState.messages = []

    const view = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = view.container.querySelector('[data-scroll-container]') as HTMLDivElement

    await waitFor(() => {
      expect(initSessionMock).toHaveBeenCalledWith('session-1')
    })

    storeState.messages = [
      { role: 'user', content: 'late hello' } as ChatMessage,
      { role: 'assistant', content: 'late world' } as ChatMessage,
    ]
    view.rerender(<ConversationView session={makeSession('running')} />)

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(360)
    })
  })

  it('adds bottom clearance so the composer does not cover the latest activity', async () => {
    const { container } = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = container.querySelector('[data-scroll-container]') as HTMLDivElement
    const composerShell = container.querySelector('[data-message-input-shell]') as HTMLDivElement

    await waitFor(() => {
      expect(initSessionMock).toHaveBeenCalledWith('session-1')
    })

    expect(scrollContainer).toHaveStyle({ scrollPaddingBottom: '108px' })
    expect(scrollContainer.firstElementChild).toHaveStyle({ paddingBottom: '108px' })
    expect(composerShell).toBeInTheDocument()
  })

  it('keeps non-file tools visible when legacy assistant toolUse mixes them with file edits', async () => {
    storeState.messages = [
      {
        role: 'assistant',
        content: '',
        toolUse: [
          { name: 'Read', input: { path: 'frontend/src/App.tsx' } },
          {
            name: 'Edit',
            input: {
              path: 'frontend/src/demo.ts',
              old_string: 'const foo = 1',
              new_string: 'const foo = 2',
            },
          },
        ],
      } as unknown as ChatMessage,
    ]

    renderWithProviders(<ConversationView session={makeSession('idle')} />)

    await waitFor(() => {
      expect(screen.getByTestId('tool-group')).toHaveTextContent('Read')
      expect(screen.getByTestId('file-change-card')).toHaveTextContent('Edit:frontend/src/demo.ts')
    })
  })
})

describe('extractFileChanges', () => {
  it('parses Codex apply_patch payloads into per-file change cards', () => {
    const messages: ConversationMessage[] = [
      {
        id: 'tool-1',
        sessionId: 'session-1',
        role: 'tool_use',
        content: '',
        timestamp: new Date().toISOString(),
        toolName: 'apply_patch',
        toolInput: {
          changes: `*** Begin Patch
*** Update File: frontend/src/demo.ts
@@
-const foo = 'old'
+const foo = 'new'
*** Add File: frontend/src/new-file.ts
+export const created = true
*** End Patch`,
        },
      },
    ]

    const fileOps = extractFileChanges(messages)

    expect(fileOps).toHaveLength(2)
    expect(fileOps[0].fileChange).toMatchObject({
      filePath: 'frontend/src/demo.ts',
      changeType: 'edit',
    })
    expect(fileOps[1].fileChange).toMatchObject({
      filePath: 'frontend/src/new-file.ts',
      changeType: 'create',
    })
  })

  it('parses prefixed Codex apply_patch tool names with structured operations', () => {
    const messages: ConversationMessage[] = [
      {
        id: 'tool-2',
        sessionId: 'session-1',
        role: 'tool_use',
        content: '',
        timestamp: new Date().toISOString(),
        toolName: 'mcp__functions__apply_patch',
        toolInput: {
          operation: {
            type: 'update_file',
            path: 'frontend/src/demo.ts',
            diff: '@@\n-const foo = 1\n+const foo = 2',
          },
        },
      },
    ]

    const fileOps = extractFileChanges(messages)

    expect(fileOps).toHaveLength(1)
    expect(fileOps[0].fileChange).toMatchObject({
      filePath: 'frontend/src/demo.ts',
      changeType: 'edit',
    })
  })
})

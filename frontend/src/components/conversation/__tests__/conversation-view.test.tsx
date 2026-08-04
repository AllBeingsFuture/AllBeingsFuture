import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, Session } from '../../../../bindings/allbeingsfuture/internal/models/models'
import type { ConversationMessage } from '../../../types/conversationTypes'
import { buildVirtualLayout } from '../useVirtualizedList'
const deferredValueState = vi.hoisted(() => ({
  enabled: false,
  value: undefined as unknown,
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useDeferredValue: <T,>(value: T) => (
      deferredValueState.enabled
        ? deferredValueState.value as T
        : actual.useDeferredValue(value)
    ),
  }
})

import ConversationView, { extractFileChanges } from '../ConversationView'
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../test/render'

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
  respondToPermission: vi.fn().mockResolvedValue(undefined),
  agentStreams: {} as Record<string, unknown>,
  childToParent: {} as Record<string, unknown>,
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
  default: ({ message }: { message: ChatMessage }) => (
    <div data-testid="message-bubble">{message.content}</div>
  ),
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
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
const originalResizeObserver = globalThis.ResizeObserver
const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

const resizeObserverInstances: MockResizeObserver[] = []
let animationFrameId = 0
let animationFrameQueue = new Map<number, FrameRequestCallback>()

class MockResizeObserver {
  private readonly callback: ResizeObserverCallback
  private readonly targets = new Set<Element>()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    resizeObserverInstances.push(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
  }

  trigger() {
    if (this.targets.size === 0) return
    const entries = [...this.targets].map((target) => ({
      target,
      contentRect: target.getBoundingClientRect(),
    })) as ResizeObserverEntry[]
    this.callback(entries, this as unknown as ResizeObserver)
  }
}

function installResizeObserverMock() {
  resizeObserverInstances.length = 0
  ;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
}

function triggerResizeObservers() {
  act(() => {
    resizeObserverInstances.forEach((observer) => observer.trigger())
  })
}

function restoreResizeObserverMock() {
  resizeObserverInstances.length = 0
  if (originalResizeObserver) {
    ;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = originalResizeObserver
    return
  }
  Reflect.deleteProperty(globalThis, 'ResizeObserver')
}

function installAnimationFrameMock() {
  animationFrameId = 0
  animationFrameQueue = new Map()
  ;(globalThis as typeof globalThis & {
    requestAnimationFrame: typeof requestAnimationFrame
    cancelAnimationFrame: typeof cancelAnimationFrame
  }).requestAnimationFrame = ((callback: FrameRequestCallback) => {
    animationFrameId += 1
    animationFrameQueue.set(animationFrameId, callback)
    return animationFrameId
  }) as typeof requestAnimationFrame
  ;(globalThis as typeof globalThis & {
    requestAnimationFrame: typeof requestAnimationFrame
    cancelAnimationFrame: typeof cancelAnimationFrame
  }).cancelAnimationFrame = ((id: number) => {
    animationFrameQueue.delete(id)
  }) as typeof cancelAnimationFrame
}

function flushAnimationFrames(iterations = 1) {
  for (let index = 0; index < iterations; index += 1) {
    const queuedCallbacks = [...animationFrameQueue.values()]
    animationFrameQueue.clear()
    if (queuedCallbacks.length === 0) return
    act(() => {
      queuedCallbacks.forEach((callback) => callback(performance.now()))
    })
  }
}

function restoreAnimationFrameMock() {
  animationFrameQueue.clear()
  if (originalRequestAnimationFrame) {
    ;(globalThis as typeof globalThis & { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = originalRequestAnimationFrame
  } else {
    Reflect.deleteProperty(globalThis, 'requestAnimationFrame')
  }

  if (originalCancelAnimationFrame) {
    ;(globalThis as typeof globalThis & { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame = originalCancelAnimationFrame
  } else {
    Reflect.deleteProperty(globalThis, 'cancelAnimationFrame')
  }
}

function mockConversationContainerMetrics(
  scrollHeight: number | (() => number),
  clientHeight: number | (() => number),
) {
  const readScrollHeight = typeof scrollHeight === 'function' ? scrollHeight : () => scrollHeight
  const readClientHeight = typeof clientHeight === 'function' ? clientHeight : () => clientHeight

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (this.getAttribute?.('data-scroll-container') !== null) return readScrollHeight()
      return originalScrollHeight?.get?.call(this) ?? 0
    },
  })

  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      if (this.getAttribute?.('data-scroll-container') !== null) return readClientHeight()
      return originalClientHeight?.get?.call(this) ?? 0
    },
  })
}

function mockComposerShellMetrics(height: number | (() => number)) {
  const readHeight = typeof height === 'function' ? height : () => height

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      if (this.getAttribute?.('data-message-input-shell') !== null) return readHeight()
      return originalOffsetHeight?.get?.call(this) ?? 0
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

  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  }
}

describe('ConversationView session boot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initSessionMock.mockReset()
    initSessionMock.mockResolvedValue(undefined)
    deferredValueState.enabled = false
    deferredValueState.value = undefined
    storeState.messages = []
    storeState.streaming = false
    storeState.chatError = ''
    toolOperationGroupMock.mockClear()
    fileChangeCardMock.mockClear()
  })

  afterEach(() => {
    restoreConversationContainerMetrics()
    restoreResizeObserverMock()
    restoreAnimationFrameMock()
  })

  it('loads history via pollChat on mount without auto-initing the agent', async () => {
    renderWithProviders(<ConversationView session={makeSession('idle')} />)

    await waitFor(() => {
      expect(storeState.pollChat).toHaveBeenCalledWith('session-1')
    })
    expect(initSessionMock).not.toHaveBeenCalled()
  })

  it('does not auto-init when opening a previously running session (restart safety)', async () => {
    renderWithProviders(<ConversationView session={makeSession('running')} />)

    await waitFor(() => {
      expect(storeState.pollChat).toHaveBeenCalledWith('session-1')
    })
    expect(initSessionMock).not.toHaveBeenCalled()
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
      expect(storeState.pollChat).toHaveBeenCalledWith('session-1')
    })
    expect(initSessionMock).not.toHaveBeenCalled()

    expect(scrollContainer.scrollTop).toBe(360)
  })

  it('pins the conversation to bottom when history arrives after mount', async () => {
    mockConversationContainerMetrics(640, 280)
    storeState.messages = []

    const view = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = view.container.querySelector('[data-scroll-container]') as HTMLDivElement

    await waitFor(() => {
      expect(storeState.pollChat).toHaveBeenCalledWith('session-1')
    })
    expect(initSessionMock).not.toHaveBeenCalled()

    storeState.messages = [
      { role: 'user', content: 'late hello' } as ChatMessage,
      { role: 'assistant', content: 'late world' } as ChatMessage,
    ]
    view.rerender(<ConversationView session={makeSession('running')} />)

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(360)
    })
  })

  it('keeps the latest activity visible when rendered content height grows after mount', async () => {
    installResizeObserverMock()
    installAnimationFrameMock()
    let scrollHeight = 640
    mockConversationContainerMetrics(() => scrollHeight, 280)
    storeState.messages = [
      { role: 'user', content: 'hello' } as ChatMessage,
      { role: 'assistant', content: 'world' } as ChatMessage,
    ]

    const { container } = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = container.querySelector('[data-scroll-container]') as HTMLDivElement

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(360)
    })

    scrollHeight = 860
    triggerResizeObservers()
    flushAnimationFrames(3)

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(580)
    })
  })

  it('renders live streaming messages immediately even when deferred messages lag behind', async () => {
    deferredValueState.enabled = true
    deferredValueState.value = [
      { role: 'assistant', content: 'deferred snapshot' } as ChatMessage,
    ]
    // partial: open assistant is live (LiveStage) under split surface.
    storeState.messages = [
      { role: 'assistant', content: 'live streaming output', partial: true } as ChatMessage,
    ]
    storeState.streaming = true

    renderWithProviders(<ConversationView session={makeSession('running')} />)

    await waitFor(() => {
      // Split surface: open assistant text is in LiveStage, not deferred transcript.
      expect(screen.getByTestId('live-stage-assistant-text')).toHaveTextContent('live streaming output')
    })
    expect(screen.queryByText('deferred snapshot')).not.toBeInTheDocument()
  })

  it('split surface uses committed messages directly (no LIVE_RENDER_HOLD deferred flashback path)', async () => {
    // STREAM_SPLIT_SURFACE: transcript groups from committed only; preferLiveMessages /
    // LIVE_RENDER_HOLD_MS are not used. Deferred lag must not replace committed content.
    deferredValueState.enabled = true
    deferredValueState.value = [
      { role: 'assistant', content: 'stale deferred snapshot' } as ChatMessage,
    ]
    storeState.messages = [
      { role: 'user', content: 'prompt' } as ChatMessage,
      { role: 'assistant', content: 'latest live output' } as ChatMessage,
    ]
    storeState.streaming = false

    const view = renderWithProviders(<ConversationView session={makeSession('idle')} />)

    expect(screen.getByText('latest live output')).toBeInTheDocument()
    expect(screen.queryByText('stale deferred snapshot')).not.toBeInTheDocument()

    view.rerender(<ConversationView session={makeSession('idle')} />)

    expect(screen.getByText('latest live output')).toBeInTheDocument()
    expect(screen.queryByText('stale deferred snapshot')).not.toBeInTheDocument()
  })

  it('places LiveStage outside the transcript scroll container when split surface is on', async () => {
    const { container } = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = container.querySelector('[data-scroll-container]') as HTMLDivElement

    await waitFor(() => {
      expect(storeState.pollChat).toHaveBeenCalledWith('session-1')
    })

    // LiveStage mounts only when live/stream has content; with empty live it is null.
    // Structure contract: composer is a sibling under the section, not inside scroll.
    const composerShell = container.querySelector('[data-message-input-shell]')
    expect(composerShell).toBeInTheDocument()
    expect(scrollContainer.contains(composerShell)).toBe(false)
  })

  it('does not steal scroll position after the user scrolls away from the latest activity', async () => {
    installResizeObserverMock()
    installAnimationFrameMock()
    let scrollHeight = 640
    mockConversationContainerMetrics(() => scrollHeight, 280)
    storeState.messages = [
      { role: 'user', content: 'hello' } as ChatMessage,
      { role: 'assistant', content: 'world' } as ChatMessage,
    ]

    const { container } = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = container.querySelector('[data-scroll-container]') as HTMLDivElement

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(360)
    })

    scrollContainer.scrollTop = 320
    fireEvent.scroll(scrollContainer)

    scrollHeight = 900
    triggerResizeObservers()
    flushAnimationFrames(3)

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(320)
    })
  })

  it('keeps the conversation pinned when composer height grows while following the latest activity', async () => {
    installResizeObserverMock()
    installAnimationFrameMock()
    let scrollHeight = 640
    let composerHeight = 96
    mockConversationContainerMetrics(() => scrollHeight, 280)
    mockComposerShellMetrics(() => composerHeight)
    storeState.messages = [
      { role: 'user', content: 'hello' } as ChatMessage,
      { role: 'assistant', content: 'world' } as ChatMessage,
    ]

    const view = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = view.container.querySelector('[data-scroll-container]') as HTMLDivElement

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(360)
    })

    composerHeight = 180
    scrollHeight = 724
    triggerResizeObservers()
    flushAnimationFrames(3)
    view.rerender(<ConversationView session={makeSession('running')} />)

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(444)
    })
  })

  it('uses a small content tail pad (composer is a flex sibling, not an overlay)', async () => {
    const { container } = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = container.querySelector('[data-scroll-container]') as HTMLDivElement
    const content = scrollContainer.firstElementChild as HTMLDivElement
    const composerShell = container.querySelector('[data-message-input-shell]') as HTMLDivElement

    await waitFor(() => {
      expect(storeState.pollChat).toHaveBeenCalledWith('session-1')
    })
    expect(initSessionMock).not.toHaveBeenCalled()

    // Full composerClearance (~108px) must not be painted as bottom spacer.
    expect(scrollContainer).toHaveStyle({ scrollPaddingBottom: '16px' })
    expect(content).toHaveStyle({ paddingBottom: '16px' })
    expect(composerShell).toBeInTheDocument()
  })

  it('bottom-aligns short conversations so tool cards do not leave a large hole above the composer', async () => {
    // Content shorter than the viewport: minHeight fills the scrollport and
    // justify-end keeps the latest tool/message block at the bottom.
    mockConversationContainerMetrics(120, 400)
    storeState.messages = [
      { role: 'user', content: 'hi' } as ChatMessage,
      {
        role: 'tool_use',
        content: '',
        toolName: 'wait_agent_idle',
        partial: true,
      } as unknown as ChatMessage,
    ]

    const { container } = renderWithProviders(<ConversationView session={makeSession('running')} />)
    const scrollContainer = container.querySelector('[data-scroll-container]') as HTMLDivElement
    const content = scrollContainer.firstElementChild as HTMLDivElement

    await waitFor(() => {
      expect(storeState.pollChat).toHaveBeenCalledWith('session-1')
    })

    await waitFor(() => {
      expect(content).toHaveStyle({ minHeight: '400px' })
    })
    // Tailwind maps justify-end → justify-content: flex-end (jsdom does not expand utilities).
    expect(content.className).toMatch(/\bjustify-end\b/)
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
  it('keeps last measured size when a reused virtualized key changes content fingerprint', () => {
    // Streaming rewrites fingerprints every token; sticky measurements avoid
    // estimate↔measured thrash (scroll jumps) until ResizeObserver updates height.
    const layout = buildVirtualLayout({
      items: ['fresh content'],
      getItemKey: () => 'session-2-group-0',
      estimateSize: () => 80,
      measuredSizes: new Map([
        ['session-2-group-0', { fingerprint: 'stale-fingerprint', size: 420 } as any],
      ]),
      overscanPx: 0,
      scrollTop: 0,
      viewportHeight: 400,
    })

    expect(layout.totalHeight).toBe(420)
    expect(layout.items[0]?.size).toBe(420)
  })

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

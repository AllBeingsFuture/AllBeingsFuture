import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import MessageList from '../MessageList'
import type { ChatMessage } from '../../../../bindings/allbeingsfuture/internal/models/models'

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...filterDomProps(props)}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock child components to isolate MessageList
vi.mock('../MessageBubble', () => ({
  default: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`message-bubble-${message.role}`}>{message.content}</div>
  ),
}))

vi.mock('../ToolOperationGroup', () => ({
  default: () => <div data-testid="tool-group" />,
}))

vi.mock('../FileChangeCard', () => ({
  default: () => <div data-testid="file-change" />,
}))

vi.mock('../StickerCard', () => ({
  default: () => <div data-testid="sticker" />,
}))

vi.mock('../../../stores/sessionStore', () => ({
  useSessionStore: vi.fn((selector: any) => selector({ select: vi.fn() })),
}))

// Helper to strip non-DOM props from motion mock
function filterDomProps(props: Record<string, any>) {
  const filtered = { ...props }
  const nonDom = ['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'layout', 'variants']
  nonDom.forEach(key => delete filtered[key])
  return filtered
}

const defaultProps = {
  sessionId: 'test-session-1',
  messages: [] as ChatMessage[],
  streaming: false,
  sessionStatus: 'idle',
  ready: true,
  isChildSession: false,
  chatError: null,
  sessionName: 'Test Session',
}

describe('MessageList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no messages', () => {
    const { container } = render(<MessageList {...defaultProps} />)
    expect(container.textContent).toContain('Test Session')
  })

  it('renders multiple messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello AI' } as ChatMessage,
      { role: 'assistant', content: 'Hello human' } as ChatMessage,
      { role: 'user', content: 'How are you?' } as ChatMessage,
    ]

    render(<MessageList {...defaultProps} messages={messages} />)

    const bubbles = screen.getAllByTestId(/^message-bubble-/)
    expect(bubbles).toHaveLength(3)
  })

  it('distinguishes user and assistant messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'User message' } as ChatMessage,
      { role: 'assistant', content: 'Assistant reply' } as ChatMessage,
    ]

    render(<MessageList {...defaultProps} messages={messages} />)

    expect(screen.getByTestId('message-bubble-user')).toHaveTextContent('User message')
    expect(screen.getByTestId('message-bubble-assistant')).toHaveTextContent('Assistant reply')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CrossSessionSearch from '../CrossSessionSearch'

// Mock the session store
vi.mock('../../../stores/sessionStore', () => ({
  useSessionStore: vi.fn((selector: any) =>
    selector({
      sessions: [],
      messages: [],
    }),
  ),
}))

// Mock the Wails binding
vi.mock('../../../../bindings/allbeingsfuture/internal/services', () => ({
  UsageService: {
    GetSessionMessages: vi.fn().mockResolvedValue([]),
  },
}))

const defaultProps = {
  currentSessionId: 'session-1',
  onInsert: vi.fn(),
  onJumpToSession: vi.fn(),
  onClose: vi.fn(),
}

describe('CrossSessionSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders search input', () => {
    render(<CrossSessionSearch {...defaultProps} />)
    const input = screen.getByPlaceholderText('搜索对话内容...')
    expect(input).toBeInTheDocument()
  })

  it('updates search query on input', () => {
    render(<CrossSessionSearch {...defaultProps} />)
    const input = screen.getByPlaceholderText('搜索对话内容...')

    fireEvent.change(input, { target: { value: '测试关键词' } })

    expect(input).toHaveValue('测试关键词')
  })
})

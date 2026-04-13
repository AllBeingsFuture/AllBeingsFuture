import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import type { ChatMessage } from '../../../../bindings/allbeingsfuture/internal/models/models'
import { AppAPI } from '../../../../bindings/electron-api'
import MessageBubble from '../MessageBubble'
import { renderWithProviders, screen } from '../../../test/render'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...filterDomProps(props)}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('../../../../bindings/electron-api', () => ({
  AppAPI: {
    openInExplorer: vi.fn(),
  },
}))

function filterDomProps(props: Record<string, any>) {
  const filtered = { ...props }
  const nonDom = ['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'layout', 'variants']
  nonDom.forEach(key => delete filtered[key])
  return filtered
}

describe('MessageBubble', () => {
  it('renders commentary markdown as rich content instead of raw markdown text', () => {
    renderWithProviders(
      <MessageBubble
        providerId="codex"
        message={{
          role: 'assistant',
          content: '已完成优化。\n\n[workflowCore.ts](C:/repo/frontend/src/core/workflow/workflowCore.ts)',
          timestamp: new Date().toISOString(),
          presentation: 'commentary',
          partial: false,
        } as unknown as ChatMessage}
      />,
    )

    const link = screen.getByText('workflowCore.ts').closest('a')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('href', 'C:/repo/frontend/src/core/workflow/workflowCore.ts')
    expect(screen.queryByText('处理中')).not.toBeInTheDocument()
    fireEvent.click(link!)
    expect(AppAPI.openInExplorer).toHaveBeenCalledWith('C:/repo/frontend/src/core/workflow/workflowCore.ts')
  })

  it('keeps streaming commentary on the reply state label without reusing the completed commentary label', () => {
    renderWithProviders(
      <MessageBubble
        providerId="codex"
        message={{
          role: 'assistant',
          content: '正在整理结果...',
          timestamp: new Date().toISOString(),
          presentation: 'commentary',
          partial: true,
        } as unknown as ChatMessage}
      />,
    )

    expect(screen.getByText('正在回复')).toBeInTheDocument()
    expect(screen.queryByText('处理中')).not.toBeInTheDocument()
  })
})

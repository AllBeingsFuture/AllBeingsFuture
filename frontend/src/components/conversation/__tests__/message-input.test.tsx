import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageInput from '../MessageInput'
import { fireEvent, renderWithProviders, screen, waitFor } from '../../../test/render'
import { useDraftStore } from '../../../stores/draftStore'

const mocks = vi.hoisted(() => ({
  prepareFile: vi.fn(),
  downloadAndCache: vi.fn().mockResolvedValue('cached-sticker'),
  ipcEventHandlers: new Map<string, (...args: any[]) => void>(),
}))

// Mock window.electronAPI before any imports
beforeEach(() => {
  ;(window as any).electronAPI = {
    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((channel: string, handler: (...args: any[]) => void) => {
      mocks.ipcEventHandlers.set(channel, handler)
      return () => {
        mocks.ipcEventHandlers.delete(channel)
      }
    }),
    once: vi.fn(),
    send: vi.fn(),
  }
})

vi.mock('../../../../bindings/allbeingsfuture/internal/services', () => ({
  FileTransferService: {
    PrepareFile: mocks.prepareFile,
  },
}))

vi.mock('../../../stores/stickerStore', () => ({
  useStickerStore: () => ({
    downloadAndCache: mocks.downloadAndCache,
  }),
}))

describe('MessageInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ipcEventHandlers.clear()
    useDraftStore.setState({ drafts: {} })
  })

  it('does not submit Enter while IME composition is active', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)

    renderWithProviders(<MessageInput sessionId="test-session" onSend={onSend} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'nihao' } })
    fireEvent.compositionStart(textarea)
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', keyCode: 13 })

    expect(onSend).not.toHaveBeenCalled()

    fireEvent.compositionEnd(textarea, { currentTarget: { value: 'nihao' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', keyCode: 13 })

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('nihao', undefined)
    })
  })

  it('submits typed text and clears the editor', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)

    renderWithProviders(<MessageInput sessionId="test-session" onSend={onSend} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '重构这个输入框' } })
    fireEvent.click(screen.getByLabelText('发送消息'))

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('重构这个输入框', undefined)
    })

    expect(textarea).toHaveValue('')
  })

  it('keeps file reference sending after native file drop events', async () => {
    mocks.prepareFile.mockResolvedValue({
      filename: 'App.tsx',
      sizeBytes: 1536,
      mimeType: 'text/plain',
      isImage: false,
    })

    const onSend = vi.fn().mockResolvedValue(undefined)

    renderWithProviders(<MessageInput sessionId="test-session" onSend={onSend} />)

    const handler = mocks.ipcEventHandlers.get('files-dropped')
    expect(handler).toBeTypeOf('function')

    handler?.(['C:/repo/src/App.tsx'])

    await waitFor(() => {
      expect(screen.getByText('1 个文件')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('发送消息'))

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        '附件:\n[文件: App.tsx](C:/repo/src/App.tsx)',
        undefined,
      )
    })
  })
})

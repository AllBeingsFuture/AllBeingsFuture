import type { ReactNode } from 'react'
import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SessionCreator from '../SessionCreator'
import { renderWithProviders, screen } from '../../../test/render'

const createMock = vi.fn()
const initProcessMock = vi.fn()
const sendMessageMock = vi.fn()
const openSessionMock = vi.fn()
const getProvidersMock = vi.fn()
const testExecutableMock = vi.fn()
const getRepoRootMock = vi.fn()
let settingsState = { autoWorktree: true }

vi.mock('../../../app/api/workbench', () => ({
  workbenchApi: {
    provider: {
      list: (...args: unknown[]) => getProvidersMock(...args),
      testExecutable: (...args: unknown[]) => testExecutableMock(...args),
    },
    session: {
      create: (...args: unknown[]) => createMock(...args),
      init: (...args: unknown[]) => initProcessMock(...args),
    },
    navigation: {
      openSession: (...args: unknown[]) => openSessionMock(...args),
    },
    chat: {
      appendMessage: (...args: unknown[]) => sendMessageMock(...args),
    },
    app: {
      selectDirectory: vi.fn(),
    },
  },
}))

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { settings: { autoWorktree: boolean } }) => unknown) =>
    selector({ settings: settingsState }),
}))

vi.mock('../../../../bindings/allbeingsfuture/internal/services', () => ({
  GitService: {
    GetRepoRoot: (...args: unknown[]) => getRepoRootMock(...args),
  },
}))

vi.mock('../../common/DraggableDialog', () => ({
  default: ({ children, title, onClose, testId }: { children: ReactNode; title: string; onClose: () => void; testId?: string }) => (
    <div data-testid={testId || 'dialog'}>
      <div>{title}</div>
      <button onClick={onClose}>close</button>
      {children}
    </div>
  ),
}))

describe('SessionCreator', () => {
  beforeEach(() => {
    createMock.mockReset()
    initProcessMock.mockReset()
    sendMessageMock.mockReset()
    openSessionMock.mockReset()
    getProvidersMock.mockReset()
    testExecutableMock.mockReset()
    getRepoRootMock.mockReset()

    settingsState = { autoWorktree: true }
    getProvidersMock.mockResolvedValue([
      { id: 'claude-code', name: 'Claude Code', isEnabled: true, adapterType: 'claude-sdk' },
      { id: 'qwen', name: 'qwen', isEnabled: true, adapterType: 'openai-api' },
    ])
    testExecutableMock.mockResolvedValue(true)
    createMock.mockResolvedValue({ id: 'session-1' })
    initProcessMock.mockResolvedValue(undefined)
    sendMessageMock.mockResolvedValue(undefined)
    openSessionMock.mockResolvedValue(undefined)
  })

  it('keeps session creation on the selected directory but records the git repo for later worktree entry', async () => {
    getRepoRootMock.mockResolvedValue('C:/repo')

    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('C:\\Users\\project'), {
      target: { value: 'C:/repo' },
    })

    await screen.findByText('当前目录属于 Git 仓库。会话会先在当前目录启动；如果后续要修改代码，Agent 必须先进入独立 worktree，再进行写入、提交和合并。')

    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        workingDirectory: 'C:/repo',
        worktreeEnabled: false,
        gitRepoPath: 'C:/repo',
      }))
    })
  })

  it('falls back to a plain session when the directory is not a git repository', async () => {
    getRepoRootMock.mockResolvedValue('')

    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('C:\\Users\\project'), {
      target: { value: 'C:/plain-dir' },
    })

    await screen.findByText('当前目录不是 Git 仓库。会话将直接在该目录启动；如果后续需要改代码，建议改用 Git 仓库目录。')

    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        workingDirectory: 'C:/plain-dir',
        worktreeEnabled: false,
        gitRepoPath: '',
      }))
    })
  })

  it('does not re-run executable detection when only switching the selected provider', async () => {
    getProvidersMock.mockResolvedValue([
      { id: 'claude-code', name: 'Claude Code', isEnabled: true, adapterType: 'claude-sdk' },
      { id: 'codex', name: 'Codex CLI', isEnabled: true, adapterType: 'codex-appserver' },
      { id: 'qwen', name: 'Qwen', isEnabled: true, adapterType: 'openai-api' },
    ])

    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    await screen.findByText('Codex CLI')
    const initialExecutableChecks = testExecutableMock.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: /Codex CLI/ }))
    fireEvent.click(screen.getByRole('button', { name: /Qwen/ }))

    await waitFor(() => {
      expect(testExecutableMock).toHaveBeenCalledTimes(initialExecutableChecks)
    })
  })
})

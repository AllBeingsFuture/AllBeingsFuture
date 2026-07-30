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
const workspaceListMock = vi.fn()
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

vi.mock('../../../../bindings/electron-api', () => ({
  ipc: (channel: string, ...args: unknown[]) => {
    if (channel === 'WorkspaceService.List') return workspaceListMock(...args)
    return Promise.resolve(null)
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
    workspaceListMock.mockReset()
    localStorage.clear()

    settingsState = { autoWorktree: true }
    workspaceListMock.mockResolvedValue([])
    getProvidersMock.mockResolvedValue([
      { id: 'claude-code', name: 'Claude Code', isEnabled: true, adapterType: 'acp' },
      { id: 'qwen', name: 'qwen', isEnabled: true, adapterType: 'openai-api' },
    ])
    testExecutableMock.mockResolvedValue(true)
    createMock.mockResolvedValue({ id: 'session-1' })
    initProcessMock.mockResolvedValue(undefined)
    sendMessageMock.mockResolvedValue(undefined)
    openSessionMock.mockResolvedValue(undefined)
  })

  it('isolates into a worktree by default when the selected directory is a git repo', async () => {
    getRepoRootMock.mockResolvedValue('C:/repo')

    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('选择工作区，或输入/浏览目录'), {
      target: { value: 'C:/repo' },
    })

    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        workingDirectory: 'C:/repo',
        worktreeEnabled: true,
        gitRepoPath: 'C:/repo',
        mode: 'supervisor',
        initialPrompt: '',
      }))
    })
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('always isolates when auto-worktree is on (no UI opt-out)', async () => {
    getRepoRootMock.mockResolvedValue('C:/repo')

    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('选择工作区，或输入/浏览目录'), {
      target: { value: 'C:/repo' },
    })

    // Simplified dialog has no worktree / mode / name / prompt controls
    expect(screen.queryByText('会话模式')).not.toBeInTheDocument()
    expect(screen.queryByText('Git Worktree 隔离')).not.toBeInTheDocument()
    expect(screen.queryByText('改代码时再隔离')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /高级选项/ })).not.toBeInTheDocument()
    expect(screen.queryByText('会话名称')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('创建后自动发送的指令...')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        workingDirectory: 'C:/repo',
        worktreeEnabled: true,
        gitRepoPath: 'C:/repo',
        mode: 'supervisor',
      }))
    })
  })

  it('still enables isolation for non-git directories so backend can auto-init', async () => {
    getRepoRootMock.mockResolvedValue('')

    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('选择工作区，或输入/浏览目录'), {
      target: { value: 'C:/plain-dir' },
    })

    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        workingDirectory: 'C:/plain-dir',
        worktreeEnabled: true,
        gitRepoPath: 'C:/plain-dir',
        mode: 'supervisor',
        initialPrompt: '',
      }))
    })
  })

  it('fills workdir from workspace primary repo and isolates by default', async () => {
    workspaceListMock.mockResolvedValue([
      {
        id: 'ws-1',
        name: 'Demo Workspace',
        repos: [{ id: 'r1', workspaceId: 'ws-1', repoPath: 'C:/repo/demo', name: 'demo', isPrimary: true, sortOrder: 0 }],
        createdAt: '',
        updatedAt: '',
      },
    ])
    getRepoRootMock.mockResolvedValue('C:/repo/demo')

    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    await screen.findByText('Demo Workspace')
    fireEvent.click(screen.getByRole('button', { name: /Demo Workspace/ }))

    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        workingDirectory: 'C:/repo/demo',
        worktreeEnabled: true,
        gitRepoPath: 'C:/repo/demo',
        mode: 'supervisor',
      }))
    })
  })

  it('shows only workdir and provider controls (no mode / advanced / name / prompt)', () => {
    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    expect(screen.getByPlaceholderText('选择工作区，或输入/浏览目录')).toBeInTheDocument()
    expect(screen.getByText('AI 提供者')).toBeInTheDocument()
    expect(screen.queryByText('会话模式')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /高级选项/ })).not.toBeInTheDocument()
    expect(screen.queryByText('会话名称')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('创建后自动发送的指令...')).not.toBeInTheDocument()
  })

  it('does not re-run executable detection when only switching the selected provider', async () => {
    getProvidersMock.mockResolvedValue([
      { id: 'claude-code', name: 'Claude Code', isEnabled: true, adapterType: 'acp' },
      { id: 'codex', name: 'Codex CLI', isEnabled: true, adapterType: 'acp' },
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

  it('respects autoWorktree=false and does not force isolation', async () => {
    settingsState = { autoWorktree: false }
    getRepoRootMock.mockResolvedValue('C:/repo')

    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('选择工作区，或输入/浏览目录'), {
      target: { value: 'C:/repo' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        workingDirectory: 'C:/repo',
        worktreeEnabled: false,
        mode: 'supervisor',
      }))
    })
  })

  it('opens session and closes dialog without waiting for provider init', async () => {
    getRepoRootMock.mockResolvedValue('C:/repo')
    let resolveInit: (() => void) | undefined
    initProcessMock.mockImplementation(
      () => new Promise<void>((resolve) => { resolveInit = resolve }),
    )
    const onClose = vi.fn()

    renderWithProviders(<SessionCreator onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('选择工作区，或输入/浏览目录'), {
      target: { value: 'C:/repo' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalled()
      expect(openSessionMock).toHaveBeenCalledWith('session-1')
      expect(onClose).toHaveBeenCalled()
    })
    // init is fired but not awaited — dialog already closed while init pending
    expect(initProcessMock).toHaveBeenCalledWith('session-1')
    expect(resolveInit).toBeDefined()
    resolveInit?.()
  })
})

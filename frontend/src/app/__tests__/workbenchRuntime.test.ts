import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workbenchApi } from '../api/workbench'
import { installWorkbenchRuntime } from '../runtime/installWorkbenchRuntime'

const runtimeMocks = vi.hoisted(() => {
  const panelState = {
    panelSides: {
      sessions: 'left',
      explorer: 'left',
      git: 'left',
      dashboard: 'left',
      files: 'left',
      worktree: 'left',
      kanban: 'left',
      workflows: 'left',
      missions: 'left',
      mcp: 'left',
      skills: 'left',
      tools: 'left',
      team: 'left',
      tutorial: 'left',
      timeline: 'right',
      stats: 'right',
    },
    sidebarCollapsed: false,
    detailPanelCollapsed: false,
    shellPanelVisible: false,
    setPanelSide: vi.fn(),
    setActivePanelLeft: vi.fn(),
    setActivePanelRight: vi.fn(),
    toggleSidebar: vi.fn(() => {
      panelState.sidebarCollapsed = !panelState.sidebarCollapsed
    }),
    toggleDetailPanel: vi.fn(() => {
      panelState.detailPanelCollapsed = !panelState.detailPanelCollapsed
    }),
    setShellPanelVisible: vi.fn((visible: boolean) => {
      panelState.shellPanelVisible = visible
    }),
    subscribe: vi.fn(),
  }

  const shellState = {
    activeTabId: null as string | null,
    setPanelVisibility: vi.fn(),
    fetchShells: vi.fn().mockResolvedValue(undefined),
    initListeners: vi.fn().mockReturnValue(vi.fn()),
    createTab: vi.fn().mockResolvedValue('pty-1'),
    activateTab: vi.fn((tabId: string) => {
      shellState.activeTabId = tabId
    }),
    closeTab: vi.fn().mockResolvedValue(undefined),
    writeToTab: vi.fn().mockResolvedValue(undefined),
  }

  const fileTabState = {
    openFile: vi.fn().mockResolvedValue(undefined),
    openFileAtLine: vi.fn().mockResolvedValue(undefined),
    saveTab: vi.fn().mockResolvedValue(undefined),
  }

  const fileManagerState = {
    setCurrentDir: vi.fn().mockResolvedValue(undefined),
    toggleDir: vi.fn().mockResolvedValue(undefined),
    setSelectedPath: vi.fn(),
    refreshCurrentDir: vi.fn().mockResolvedValue(undefined),
  }

  const layoutState = {
    layoutMode: 'single' as 'single' | 'split-h' | 'split-v',
    primaryPane: 'sessions',
    secondaryPane: 'files',
    setLayoutMode: vi.fn((mode: 'single' | 'split-h' | 'split-v') => {
      layoutState.layoutMode = mode
    }),
    setPaneContent: vi.fn((pane: string, content: string) => {
      if (pane === 'primary') {
        layoutState.primaryPane = content
      }
      if (pane === 'secondary') {
        layoutState.secondaryPane = content
      }
    }),
    swapPanes: vi.fn(() => {
      const nextPrimary = layoutState.secondaryPane
      layoutState.secondaryPane = layoutState.primaryPane
      layoutState.primaryPane = nextPrimary
    }),
  }

  const workflowState = {
    load: vi.fn().mockResolvedValue(undefined),
    loadExecutionHistory: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ id: 'wf-1' }),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue({ id: 'exec-1' }),
    stop: vi.fn().mockResolvedValue(undefined),
    approveStep: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ id: 'exec-1', status: 'running' }),
    select: vi.fn(),
  }

  const taskState = {
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ id: 'task-1' }),
    moveTask: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  }

  const sessionState = {
    sessions: [
      { id: 'session-1', workingDirectory: 'C:/repo/session-1' },
      { id: 'session-2', workingDirectory: 'C:/repo/fallback' },
    ],
    selectedId: 'session-1',
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ id: 'session-1' }),
    initProcess: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    stopProcess: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(),
    resumeSession: vi.fn().mockResolvedValue({ success: true, sessionId: 'session-2' }),
    end: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    smartRename: vi.fn().mockResolvedValue('next-name'),
  }

  const uiState = {
    setTeamsMode: vi.fn(),
    setActiveView: vi.fn(),
    setViewMode: vi.fn(),
    setSelectedTaskId: vi.fn(),
    toggleSearchPanel: vi.fn(),
    toggleHistoryPanel: vi.fn(),
    toggleQuickOpen: vi.fn(),
    setShowSettings: vi.fn(),
    setShowNewSessionDialog: vi.fn(),
  }

  return {
    panelState,
    shellState,
    fileTabState,
    fileManagerState,
    layoutState,
    workflowState,
    taskState,
    sessionState,
    uiState,
  }
})

const { panelState, shellState, sessionState } = runtimeMocks

vi.mock('../../stores/panelStore', () => ({
  usePanelStore: {
    getState: () => runtimeMocks.panelState,
    subscribe: runtimeMocks.panelState.subscribe,
  },
}))

vi.mock('../../stores/layoutStore', () => ({
  useLayoutStore: {
    getState: () => runtimeMocks.layoutState,
  },
}))

vi.mock('../../stores/shellTerminalStore', () => ({
  useShellTerminalStore: {
    getState: () => runtimeMocks.shellState,
  },
}))

vi.mock('../../stores/fileTabStore', () => ({
  useFileTabStore: {
    getState: () => runtimeMocks.fileTabState,
  },
}))

vi.mock('../../stores/fileManagerStore', () => ({
  useFileManagerStore: {
    getState: () => runtimeMocks.fileManagerState,
  },
}))

vi.mock('../../stores/workflowStore', () => ({
  useWorkflowStore: {
    getState: () => runtimeMocks.workflowState,
  },
}))

vi.mock('../../stores/taskStore', () => ({
  useTaskStore: {
    getState: () => runtimeMocks.taskState,
  },
}))

vi.mock('../../stores/sessionStore', () => ({
  useSessionStore: {
    getState: () => runtimeMocks.sessionState,
  },
}))

vi.mock('../../stores/uiStore', () => ({
  useUIStore: {
    getState: () => runtimeMocks.uiState,
  },
}))

describe('workbench runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    panelState.sidebarCollapsed = false
    panelState.detailPanelCollapsed = false
    panelState.shellPanelVisible = false
    shellState.activeTabId = null
    runtimeMocks.layoutState.layoutMode = 'single'
    runtimeMocks.layoutState.primaryPane = 'sessions'
    window.electronAPI = {
      invoke: vi.fn((channel: string, ...args: any[]) => {
        switch (channel) {
          case 'ProviderService.GetAll':
            return Promise.resolve([{ id: 'provider-1', name: 'Codex' }])
          case 'ProviderService.Create':
            return Promise.resolve({ id: 'provider-2', name: args[0], command: args[1], adapterType: args[2] })
          case 'ProviderService.Update':
          case 'ProviderService.Delete':
            return Promise.resolve(undefined)
          case 'ProviderService.TestExecutable':
            return Promise.resolve(args[0] === 'provider-1' && args[1] === 'C:/tools/codex.exe')
          case 'app:selectDirectory':
            return Promise.resolve('C:/repo')
          case 'app:selectFile':
            return Promise.resolve(['C:/tools/codex.exe'])
          case 'LogService.GetLogFilePath':
            return Promise.resolve('C:/logs/app.log')
          case 'app:openInExplorer':
            return Promise.resolve(undefined)
          default:
            return Promise.resolve(undefined)
        }
      }),
      on: vi.fn(),
      once: vi.fn(),
      send: vi.fn(),
      quickOpen: {
        search: vi.fn().mockResolvedValue([{ path: 'C:/repo/app.ts', name: 'app.ts', dir: '.' }]),
        openFile: vi.fn(),
      },
    } as any
    installWorkbenchRuntime()
  })

  it('dispatches chat commands through the runtime', async () => {
    await workbenchApi.chat.appendMessage('session-1', 'hello')
    await workbenchApi.chat.stop('session-1')

    expect(sessionState.sendMessage).toHaveBeenCalledWith('session-1', 'hello')
    expect(sessionState.stopProcess).toHaveBeenCalledWith('session-1')
  })

  it('dispatches session commands through the runtime', async () => {
    await workbenchApi.session.load()
    const session = await workbenchApi.session.create({
      name: 'test',
      workingDirectory: 'C:/repo',
      providerId: 'claude-code',
      mode: 'normal',
      autoAccept: true,
    } as any)
    await workbenchApi.session.init('session-1')
    await workbenchApi.session.resume('session-1')
    await workbenchApi.session.end('session-1')
    await workbenchApi.session.remove('session-1')
    await workbenchApi.session.rename('session-1', 'renamed')
    const nextName = await workbenchApi.session.smartRename('session-1')

    expect(session).toEqual({ id: 'session-1' })
    expect(runtimeMocks.sessionState.load).toHaveBeenCalled()
    expect(runtimeMocks.sessionState.create).toHaveBeenCalled()
    expect(runtimeMocks.sessionState.initProcess).toHaveBeenCalledWith('session-1')
    expect(runtimeMocks.sessionState.resumeSession).toHaveBeenCalledWith('session-1')
    expect(runtimeMocks.sessionState.end).toHaveBeenCalledWith('session-1')
    expect(runtimeMocks.sessionState.remove).toHaveBeenCalledWith('session-1')
    expect(runtimeMocks.sessionState.rename).toHaveBeenCalledWith('session-1', 'renamed')
    expect(nextName).toBe('next-name')
  })

  it('dispatches layout commands through the runtime', async () => {
    await workbenchApi.layout.setMode('split-h')
    await workbenchApi.layout.setPaneContent('secondary', 'kanban')
    await workbenchApi.layout.swapPanes()

    expect(runtimeMocks.layoutState.setLayoutMode).toHaveBeenCalledWith('split-h')
    expect(runtimeMocks.layoutState.setPaneContent).toHaveBeenCalledWith('secondary', 'kanban')
    expect(runtimeMocks.layoutState.swapPanes).toHaveBeenCalled()
  })

  it('dispatches file-manager commands through the runtime', async () => {
    await workbenchApi.fileManager.setCurrentDir('C:/repo')
    await workbenchApi.fileManager.toggleDir('C:/repo/src')
    await workbenchApi.fileManager.setSelectedPath('C:/repo/src/app.ts')
    await workbenchApi.fileManager.refreshCurrentDir()

    expect(runtimeMocks.fileManagerState.setCurrentDir).toHaveBeenCalledWith('C:/repo')
    expect(runtimeMocks.fileManagerState.toggleDir).toHaveBeenCalledWith('C:/repo/src')
    expect(runtimeMocks.fileManagerState.setSelectedPath).toHaveBeenCalledWith('C:/repo/src/app.ts')
    expect(runtimeMocks.fileManagerState.refreshCurrentDir).toHaveBeenCalled()
  })

  it('dispatches provider, app and log commands through the runtime', async () => {
    const providers = await workbenchApi.provider.list()
    const created = await workbenchApi.provider.create('Custom', 'codex', 'codex-appserver' as any)
    await workbenchApi.provider.update('provider-1', { isEnabled: true })
    await workbenchApi.provider.remove('provider-1')
    const isAvailable = await workbenchApi.provider.testExecutable('provider-1', 'C:/tools/codex.exe')
    const directory = await workbenchApi.app.selectDirectory()
    const files = await workbenchApi.app.selectFile()
    await workbenchApi.log.openFile()

    expect(providers).toEqual([{ id: 'provider-1', name: 'Codex' }])
    expect(created).toEqual({ id: 'provider-2', name: 'Custom', command: 'codex', adapterType: 'codex-appserver' })
    expect(isAvailable).toBe(true)
    expect(directory).toBe('C:/repo')
    expect(files).toEqual(['C:/tools/codex.exe'])
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('ProviderService.GetAll')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('ProviderService.Create', 'Custom', 'codex', 'codex-appserver')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('ProviderService.Update', 'provider-1', { isEnabled: true })
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('ProviderService.Delete', 'provider-1')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith(
      'ProviderService.TestExecutable',
      'provider-1',
      'C:/tools/codex.exe',
    )
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('app:selectDirectory')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('app:selectFile')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('LogService.GetLogFilePath')
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('app:openInExplorer', 'C:/logs/app.log')
  })

  it('shows shell panel before terminal creation', async () => {
    await workbenchApi.terminal.createTab('cmd.exe', 'C:/repo')

    expect(panelState.setShellPanelVisible).toHaveBeenCalledWith(true)
    expect(shellState.setPanelVisibility).toHaveBeenCalledWith(true)
    expect(shellState.createTab).toHaveBeenCalledWith('cmd.exe', 'C:/repo')
  })

  it('initializes terminal runtime through the command bus', async () => {
    const cleanup = await workbenchApi.terminal.initialize()

    expect(shellState.fetchShells).toHaveBeenCalled()
    expect(shellState.initListeners).toHaveBeenCalled()
    expect(typeof cleanup).toBe('function')
  })

  it('dispatches panel side changes through the runtime', async () => {
    await workbenchApi.panel.setSide('explorer', 'right')

    expect(panelState.setPanelSide).toHaveBeenCalledWith('explorer', 'right')
  })

  it('hides panels deterministically instead of toggling them back open', async () => {
    const initialShellHideCalls = panelState.setShellPanelVisible.mock.calls.length
    const initialShellVisibilitySyncCalls = shellState.setPanelVisibility.mock.calls.length

    await workbenchApi.panel.hide('sidebar')
    await workbenchApi.panel.hide('sidebar')
    await workbenchApi.panel.hide('detail')
    await workbenchApi.panel.hide('detail')
    await workbenchApi.panel.hide('shell')
    await workbenchApi.panel.hide('shell')

    expect(panelState.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(panelState.toggleDetailPanel).toHaveBeenCalledTimes(1)
    expect(panelState.setShellPanelVisible.mock.calls.length).toBe(initialShellHideCalls)
    expect(shellState.setPanelVisibility.mock.calls.length).toBe(initialShellVisibilitySyncCalls)

    panelState.shellPanelVisible = true
    await workbenchApi.panel.freeze('shell')

    expect(panelState.setShellPanelVisible).toHaveBeenCalledWith(false)
    expect(shellState.setPanelVisibility).toHaveBeenCalledWith(false)
  })

  it('resolves terminal cwd from the selected session when none is provided', async () => {
    await workbenchApi.terminal.createTab('cmd.exe')

    expect(shellState.createTab).toHaveBeenCalledWith('cmd.exe', 'C:/repo/session-1')
  })

  it('creates a tab and writes the command when terminal.run is used', async () => {
    const tabId = await workbenchApi.terminal.run('dir', { cwd: 'C:/repo' })

    expect(tabId).toBe('pty-1')
    expect(shellState.createTab).toHaveBeenCalledWith(undefined, 'C:/repo')
    expect(shellState.activateTab).toHaveBeenCalledWith('pty-1')
    expect(shellState.writeToTab).toHaveBeenCalledWith('pty-1', 'dir\r')
  })

  it('dispatches editor commands through the runtime', async () => {
    await workbenchApi.editor.openFile('C:/repo/app.ts')
    await workbenchApi.editor.openFileAtLine('C:/repo/app.ts', 12, 3)
    await workbenchApi.editor.save('tab-1')
    const items = await workbenchApi.editor.searchFiles('C:/repo', 'app')

    expect(runtimeMocks.fileTabState.openFile).toHaveBeenCalledWith('C:/repo/app.ts')
    expect(runtimeMocks.fileTabState.openFileAtLine).toHaveBeenCalledWith('C:/repo/app.ts', 12, 3)
    expect(runtimeMocks.fileTabState.saveTab).toHaveBeenCalledWith('tab-1')
    expect(runtimeMocks.layoutState.setPaneContent).toHaveBeenCalledWith('primary', 'files')
    expect((window.electronAPI as any).quickOpen?.search).toHaveBeenCalledWith('C:/repo', 'app')
    expect(items).toEqual([{ path: 'C:/repo/app.ts', name: 'app.ts', dir: '.' }])
  })

  it('dispatches workflow commands through the runtime', async () => {
    await workbenchApi.workflow.load()
    await workbenchApi.workflow.loadHistory(25)
    const workflow = await workbenchApi.workflow.create('Build', 'desc', '{"steps":[]}')
    await workbenchApi.workflow.update('wf-1', 'Build 2', 'desc 2', '{"steps":[]}')
    await workbenchApi.workflow.remove('wf-1')
    await workbenchApi.workflow.run('wf-1', '{"foo":"bar"}')
    await workbenchApi.workflow.stop('exec-1')
    await workbenchApi.workflow.approveStep('exec-1', 'step-1', true)
    const status = await workbenchApi.workflow.getStatus('exec-1')
    await workbenchApi.workflow.select('wf-1')

    expect(runtimeMocks.workflowState.load).toHaveBeenCalled()
    expect(runtimeMocks.workflowState.loadExecutionHistory).toHaveBeenCalledWith(25)
    expect(runtimeMocks.workflowState.create).toHaveBeenCalledWith('Build', 'desc', '{"steps":[]}')
    expect(runtimeMocks.workflowState.update).toHaveBeenCalledWith('wf-1', 'Build 2', 'desc 2', '{"steps":[]}')
    expect(runtimeMocks.workflowState.remove).toHaveBeenCalledWith('wf-1')
    expect(runtimeMocks.workflowState.start).toHaveBeenCalledWith('wf-1', '{"foo":"bar"}')
    expect(runtimeMocks.workflowState.stop).toHaveBeenCalledWith('exec-1')
    expect(runtimeMocks.workflowState.approveStep).toHaveBeenCalledWith('exec-1', 'step-1', true)
    expect(runtimeMocks.workflowState.getStatus).toHaveBeenCalledWith('exec-1')
    expect(runtimeMocks.workflowState.select).toHaveBeenCalledWith('wf-1')
    expect(workflow).toEqual({ id: 'wf-1' })
    expect(status).toEqual({ id: 'exec-1', status: 'running' })
  })

  it('dispatches task and ui commands through the runtime', async () => {
    await workbenchApi.task.load()
    await workbenchApi.task.create({ title: 'task' })
    await workbenchApi.task.move('task-1', 'done')
    await workbenchApi.task.remove('task-1')
    await workbenchApi.ui.toggleSearchPanel()
    await workbenchApi.ui.toggleHistoryPanel()
    await workbenchApi.ui.toggleQuickOpen()
    await workbenchApi.ui.setViewMode('tabs')
    await workbenchApi.ui.setSettingsVisible(true)
    await workbenchApi.ui.setTeamsMode(true)
    await workbenchApi.ui.setNewSessionDialogVisible(true)

    expect(runtimeMocks.taskState.load).toHaveBeenCalled()
    expect(runtimeMocks.taskState.create).toHaveBeenCalledWith({ title: 'task' })
    expect(runtimeMocks.taskState.moveTask).toHaveBeenCalledWith('task-1', 'done')
    expect(runtimeMocks.taskState.remove).toHaveBeenCalledWith('task-1')
    expect(runtimeMocks.uiState.toggleSearchPanel).toHaveBeenCalled()
    expect(runtimeMocks.uiState.toggleHistoryPanel).toHaveBeenCalled()
    expect(runtimeMocks.uiState.toggleQuickOpen).toHaveBeenCalled()
    expect(runtimeMocks.uiState.setViewMode).toHaveBeenCalledWith('tabs')
    expect(runtimeMocks.uiState.setShowSettings).toHaveBeenCalledWith(true)
    expect(runtimeMocks.uiState.setTeamsMode).toHaveBeenCalledWith(true)
    expect(runtimeMocks.uiState.setShowNewSessionDialog).toHaveBeenCalledWith(true)
  })

  it('dispatches navigation commands through the runtime', async () => {
    await workbenchApi.navigation.openSession('session-1')
    await workbenchApi.navigation.openTaskBoard('task-1')
    await workbenchApi.navigation.openTeams()

    expect(runtimeMocks.sessionState.select).toHaveBeenCalledWith('session-1')
    expect(runtimeMocks.uiState.setTeamsMode).toHaveBeenCalledWith(false)
    expect(runtimeMocks.uiState.setActiveView).toHaveBeenCalledWith('sessions')
    expect(runtimeMocks.uiState.setSelectedTaskId).toHaveBeenCalledWith('task-1')
    expect(runtimeMocks.uiState.setActiveView).toHaveBeenLastCalledWith('kanban')
    expect(runtimeMocks.uiState.setTeamsMode).toHaveBeenLastCalledWith(true)
  })
})

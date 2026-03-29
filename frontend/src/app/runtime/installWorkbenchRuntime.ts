import { useFileTabStore } from '../../stores/fileTabStore'
import { useFileManagerStore } from '../../stores/fileManagerStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { usePanelStore } from '../../stores/panelStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useShellTerminalStore } from '../../stores/shellTerminalStore'
import { useTaskStore } from '../../stores/taskStore'
import { useUIStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { workbenchCommandBus } from '../command-bus/commandBus'
import type { WorkbenchCommand } from '../command-bus/types'

type QuickOpenBridge = {
  search?: (rootDir: string, query: string) => Promise<unknown>
}

let runtimeInstalled = false

function syncShellPanelVisibility(visible: boolean) {
  usePanelStore.getState().setShellPanelVisible(visible)
  useShellTerminalStore.getState().setPanelVisibility(visible)
}

function ensureFilesPaneVisible() {
  const { layoutMode, primaryPane, setPaneContent } = useLayoutStore.getState()
  if (layoutMode === 'single' && primaryPane !== 'files') {
    setPaneContent('primary', 'files')
  }
}

function resolveTerminalCwd(preferredCwd?: string) {
  if (preferredCwd) return preferredCwd

  const { sessions, selectedId } = useSessionStore.getState()
  if (selectedId) {
    const selectedSession = sessions.find((session) => session.id === selectedId)
    if (selectedSession?.workingDirectory) return selectedSession.workingDirectory
  }

  for (const session of sessions) {
    if (session.workingDirectory) return session.workingDirectory
  }

  return ''
}

async function handleCommand(command: WorkbenchCommand) {
  switch (command.type) {
    case 'provider.list':
      return window.electronAPI.invoke('ProviderService.GetAll')

    case 'provider.create':
      return window.electronAPI.invoke(
        'ProviderService.Create',
        command.payload.name,
        command.payload.command,
        command.payload.adapterType,
      )

    case 'provider.update':
      return window.electronAPI.invoke(
        'ProviderService.Update',
        command.payload.providerId,
        command.payload.updates,
      )

    case 'provider.remove':
      return window.electronAPI.invoke('ProviderService.Delete', command.payload.providerId)

    case 'provider.test-executable':
      return Boolean(await window.electronAPI.invoke(
        'ProviderService.TestExecutable',
        command.payload.providerId,
        command.payload.executablePath,
      ))

    case 'app.select-directory':
      return window.electronAPI.invoke('app:selectDirectory')

    case 'app.select-file':
      return window.electronAPI.invoke('app:selectFile')

    case 'log.open-file': {
      const logPath = await window.electronAPI.invoke('LogService.GetLogFilePath')
      if (logPath) {
        await window.electronAPI.invoke('app:openInExplorer', logPath)
      }
      return
    }

    case 'file-manager.set-current-dir':
      return useFileManagerStore.getState().setCurrentDir(command.payload.dir)

    case 'file-manager.toggle-dir':
      return useFileManagerStore.getState().toggleDir(command.payload.dirPath)

    case 'file-manager.set-selected-path':
      useFileManagerStore.getState().setSelectedPath(command.payload.path)
      return

    case 'file-manager.refresh-current-dir':
      return useFileManagerStore.getState().refreshCurrentDir()

    case 'layout.set-mode':
      useLayoutStore.getState().setLayoutMode(command.payload.mode)
      return

    case 'layout.set-pane-content':
      useLayoutStore.getState().setPaneContent(command.payload.pane, command.payload.content)
      return

    case 'layout.swap-panes':
      useLayoutStore.getState().swapPanes()
      return

    case 'session.load':
      return useSessionStore.getState().load()

    case 'session.create':
      return useSessionStore.getState().create(command.payload.config)

    case 'session.init':
      return useSessionStore.getState().initProcess(command.payload.sessionId)

    case 'session.resume':
      return useSessionStore.getState().resumeSession(command.payload.sessionId)

    case 'session.end':
      return useSessionStore.getState().end(command.payload.sessionId)

    case 'session.remove':
      return useSessionStore.getState().remove(command.payload.sessionId)

    case 'session.rename':
      return useSessionStore.getState().rename(
        command.payload.sessionId,
        command.payload.name,
      )

    case 'session.smart-rename':
      return useSessionStore.getState().smartRename(command.payload.sessionId)

    case 'chat.append-message': {
      const { sessionId, text, images } = command.payload
      if (images && images.length > 0) {
        return useSessionStore.getState().sendMessage(sessionId, text, images)
      }
      return useSessionStore.getState().sendMessage(sessionId, text)
    }

    case 'chat.stop':
      return useSessionStore.getState().stopProcess(command.payload.sessionId)

    case 'editor.open-file':
      await useFileTabStore.getState().openFile(command.payload.path)
      ensureFilesPaneVisible()
      return

    case 'editor.open-file-at-line':
      await useFileTabStore.getState().openFileAtLine(
        command.payload.path,
        command.payload.lineNumber,
        command.payload.column,
      )
      ensureFilesPaneVisible()
      return

    case 'editor.save-file':
      return useFileTabStore.getState().saveTab(command.payload.tabId)

    case 'editor.search-files': {
      const { rootDir, query } = command.payload
      if (!rootDir || !query.trim()) return []

      const quickOpenSearch = (window.electronAPI as typeof window.electronAPI & {
        quickOpen?: QuickOpenBridge
      }).quickOpen?.search
      if (quickOpenSearch) {
        return quickOpenSearch(rootDir, query)
      }

      return window.electronAPI.invoke('QuickOpen.Search', rootDir, query)
    }

    case 'panel.activate': {
      const { panelId, side } = command.payload
      const resolvedSide = side ?? usePanelStore.getState().panelSides[panelId]
      if (resolvedSide === 'right') {
        usePanelStore.getState().setActivePanelRight(panelId)
        return
      }
      usePanelStore.getState().setActivePanelLeft(panelId)
      return
    }

    case 'panel.set-side':
      usePanelStore.getState().setPanelSide(command.payload.panelId, command.payload.side)
      return

    case 'panel.toggle-sidebar':
      usePanelStore.getState().toggleSidebar()
      return

    case 'panel.toggle-detail':
      usePanelStore.getState().toggleDetailPanel()
      return

    case 'panel.hide': {
      const panelState = usePanelStore.getState()
      if (command.payload.target === 'sidebar') {
        if (!panelState.sidebarCollapsed) {
          panelState.toggleSidebar()
        }
        return
      }
      if (command.payload.target === 'detail') {
        if (!panelState.detailPanelCollapsed) {
          panelState.toggleDetailPanel()
        }
        return
      }
      if (panelState.shellPanelVisible) {
        syncShellPanelVisibility(false)
      }
      return
    }

    case 'panel.set-shell-visible':
      syncShellPanelVisibility(command.payload.visible)
      return

    case 'panel.toggle-shell':
      syncShellPanelVisibility(!usePanelStore.getState().shellPanelVisible)
      return

    case 'terminal.initialize': {
      const store = useShellTerminalStore.getState()
      await store.fetchShells()
      return store.initListeners()
    }

    case 'terminal.create-tab':
      syncShellPanelVisibility(true)
      return useShellTerminalStore.getState().createTab(
        command.payload.shell,
        resolveTerminalCwd(command.payload.cwd),
      )

    case 'terminal.activate-tab':
      syncShellPanelVisibility(true)
      useShellTerminalStore.getState().activateTab(command.payload.tabId)
      return

    case 'terminal.close-tab':
      return useShellTerminalStore.getState().closeTab(command.payload.tabId)

    case 'terminal.write':
      return useShellTerminalStore.getState().writeToTab(
        command.payload.tabId,
        command.payload.data,
      )

    case 'terminal.run': {
      const store = useShellTerminalStore.getState()
      syncShellPanelVisibility(true)

      let tabId = command.payload.tabId || store.activeTabId
      if (!tabId) {
        tabId = await store.createTab(
          command.payload.shell,
          resolveTerminalCwd(command.payload.cwd),
        ) || null
      }
      if (!tabId) return null

      store.activateTab(tabId)

      const commandText = /[\r\n]$/.test(command.payload.command)
        ? command.payload.command
        : `${command.payload.command}\r`

      await store.writeToTab(tabId, commandText)
      return tabId
    }

    case 'terminal.stop':
      return useShellTerminalStore.getState().closeTab(command.payload.tabId)

    case 'workflow.run':
      return useWorkflowStore.getState().start(
        command.payload.workflowId,
        command.payload.variables,
      )

    case 'workflow.load':
      return useWorkflowStore.getState().load()

    case 'workflow.load-history':
      return useWorkflowStore.getState().loadExecutionHistory(command.payload?.limit)

    case 'workflow.create':
      return useWorkflowStore.getState().create(
        command.payload.name,
        command.payload.description,
        command.payload.definition,
      )

    case 'workflow.update':
      return useWorkflowStore.getState().update(
        command.payload.workflowId,
        command.payload.name,
        command.payload.description,
        command.payload.definition,
      )

    case 'workflow.remove':
      return useWorkflowStore.getState().remove(command.payload.workflowId)

    case 'workflow.get-status':
      return useWorkflowStore.getState().getStatus(command.payload.executionId)

    case 'workflow.select':
      useWorkflowStore.getState().select(command.payload.workflowId)
      return

    case 'workflow.stop':
      return useWorkflowStore.getState().stop(command.payload.executionId)

    case 'workflow.approve-step':
      return useWorkflowStore.getState().approveStep(
        command.payload.executionId,
        command.payload.stepId,
        command.payload.approved,
      )

    case 'task.load':
      return useTaskStore.getState().load()

    case 'task.create':
      return useTaskStore.getState().create(command.payload.config)

    case 'task.move':
      return useTaskStore.getState().moveTask(
        command.payload.taskId,
        command.payload.status,
      )

    case 'task.remove':
      return useTaskStore.getState().remove(command.payload.taskId)

    case 'ui.toggle-search-panel':
      useUIStore.getState().toggleSearchPanel()
      return

    case 'ui.toggle-history-panel':
      useUIStore.getState().toggleHistoryPanel()
      return

    case 'ui.toggle-quick-open':
      useUIStore.getState().toggleQuickOpen()
      return

    case 'ui.set-view-mode':
      useUIStore.getState().setViewMode(command.payload.mode)
      return

    case 'ui.set-settings-visible':
      useUIStore.getState().setShowSettings(command.payload.visible)
      return

    case 'ui.set-teams-mode':
      useUIStore.getState().setTeamsMode(command.payload.enabled)
      return

    case 'ui.set-new-session-dialog-visible':
      useUIStore.getState().setShowNewSessionDialog(command.payload.visible)
      return

    case 'navigation.open-session':
      useSessionStore.getState().select(command.payload.sessionId)
      useUIStore.getState().setTeamsMode(false)
      useUIStore.getState().setActiveView('sessions')
      return

    case 'navigation.open-task-board':
      useUIStore.getState().setSelectedTaskId(command.payload.taskId ?? null)
      useUIStore.getState().setActiveView('kanban')
      return

    case 'navigation.open-teams':
      useUIStore.getState().setTeamsMode(true)
      return
  }
}

export function installWorkbenchRuntime() {
  if (runtimeInstalled) return
  runtimeInstalled = true

  syncShellPanelVisibility(usePanelStore.getState().shellPanelVisible)

  let lastShellPanelVisible = usePanelStore.getState().shellPanelVisible
  usePanelStore.subscribe((state) => {
    if (state.shellPanelVisible === lastShellPanelVisible) return
    lastShellPanelVisible = state.shellPanelVisible
    useShellTerminalStore.getState().setPanelVisibility(state.shellPanelVisible)
  })

  workbenchCommandBus.subscribe(handleCommand)
}

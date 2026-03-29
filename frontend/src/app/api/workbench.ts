import type { LayoutMode, PaneContent, PanelId, PanelSide, ViewMode } from '../../stores/ui-helpers'
import type { AIProvider, AdapterType, Session, SessionConfig } from '../../../bindings/allbeingsfuture/internal/models/models'
import type { Workflow, WorkflowExecution } from '../../stores/workflowStore'
import { workbenchCommandBus } from '../command-bus/commandBus'
import type {
  TaskCreateInput,
  TerminalImagePayload,
  WorkbenchCommand,
} from '../command-bus/types'

export interface QuickOpenSearchItem {
  path: string
  name: string
  dir: string
}

export interface SessionResumeResult {
  success: boolean
  sessionId?: string
  error?: string
}

function dispatch(command: WorkbenchCommand) {
  return workbenchCommandBus.dispatch(command)
}

export const workbenchApi = {
  dispatch,
  provider: {
    list(): Promise<AIProvider[]> {
      return dispatch({ type: 'provider.list' }) as Promise<AIProvider[]>
    },
    create(name: string, command: string, adapterType: AdapterType): Promise<AIProvider | null> {
      return dispatch({
        type: 'provider.create',
        payload: { name, command, adapterType },
      }) as Promise<AIProvider | null>
    },
    update(providerId: string, updates: Record<string, unknown>): Promise<void> {
      return dispatch({
        type: 'provider.update',
        payload: { providerId, updates },
      }) as Promise<void>
    },
    remove(providerId: string): Promise<void> {
      return dispatch({
        type: 'provider.remove',
        payload: { providerId },
      }) as Promise<void>
    },
    testExecutable(providerId: string, executablePath: string): Promise<boolean> {
      return dispatch({
        type: 'provider.test-executable',
        payload: { providerId, executablePath },
      }) as Promise<boolean>
    },
  },
  app: {
    selectDirectory(): Promise<string> {
      return dispatch({ type: 'app.select-directory' }) as Promise<string>
    },
    selectFile(): Promise<string[]> {
      return dispatch({ type: 'app.select-file' }) as Promise<string[]>
    },
  },
  log: {
    openFile(): Promise<void> {
      return dispatch({ type: 'log.open-file' }) as Promise<void>
    },
  },
  fileManager: {
    setCurrentDir(dir: string | null) {
      return dispatch({
        type: 'file-manager.set-current-dir',
        payload: { dir },
      })
    },
    toggleDir(dirPath: string) {
      return dispatch({
        type: 'file-manager.toggle-dir',
        payload: { dirPath },
      })
    },
    setSelectedPath(path: string | null) {
      return dispatch({
        type: 'file-manager.set-selected-path',
        payload: { path },
      })
    },
    refreshCurrentDir() {
      return dispatch({ type: 'file-manager.refresh-current-dir' })
    },
  },
  layout: {
    setMode(mode: LayoutMode) {
      return dispatch({
        type: 'layout.set-mode',
        payload: { mode },
      })
    },
    setPaneContent(pane: 'primary' | 'secondary', content: PaneContent) {
      return dispatch({
        type: 'layout.set-pane-content',
        payload: { pane, content },
      })
    },
    swapPanes() {
      return dispatch({ type: 'layout.swap-panes' })
    },
  },
  session: {
    load(): Promise<void> {
      return dispatch({ type: 'session.load' }) as Promise<void>
    },
    create(config: SessionConfig): Promise<Session | null> {
      return dispatch({
        type: 'session.create',
        payload: { config },
      }) as Promise<Session | null>
    },
    init(sessionId: string): Promise<void> {
      return dispatch({
        type: 'session.init',
        payload: { sessionId },
      }) as Promise<void>
    },
    resume(sessionId: string): Promise<SessionResumeResult> {
      return dispatch({
        type: 'session.resume',
        payload: { sessionId },
      }) as Promise<SessionResumeResult>
    },
    end(sessionId: string): Promise<void> {
      return dispatch({
        type: 'session.end',
        payload: { sessionId },
      }) as Promise<void>
    },
    remove(sessionId: string): Promise<void> {
      return dispatch({
        type: 'session.remove',
        payload: { sessionId },
      }) as Promise<void>
    },
    rename(sessionId: string, name: string): Promise<void> {
      return dispatch({
        type: 'session.rename',
        payload: { sessionId, name },
      }) as Promise<void>
    },
    smartRename(sessionId: string): Promise<string | null> {
      return dispatch({
        type: 'session.smart-rename',
        payload: { sessionId },
      }) as Promise<string | null>
    },
  },
  chat: {
    appendMessage(sessionId: string, text: string, images?: TerminalImagePayload) {
      return dispatch({
        type: 'chat.append-message',
        payload: { sessionId, text, images },
      })
    },
    stop(sessionId: string) {
      return dispatch({
        type: 'chat.stop',
        payload: { sessionId },
      })
    },
  },
  editor: {
    openFile(path: string) {
      return dispatch({
        type: 'editor.open-file',
        payload: { path },
      })
    },
    openFileAtLine(path: string, lineNumber: number, column = 1) {
      return dispatch({
        type: 'editor.open-file-at-line',
        payload: { path, lineNumber, column },
      })
    },
    save(tabId: string) {
      return dispatch({
        type: 'editor.save-file',
        payload: { tabId },
      })
    },
    searchFiles(rootDir: string, query: string): Promise<QuickOpenSearchItem[]> {
      return dispatch({
        type: 'editor.search-files',
        payload: { rootDir, query },
      }) as Promise<QuickOpenSearchItem[]>
    },
  },
  panel: {
    setSide(panelId: PanelId, side: PanelSide) {
      return dispatch({
        type: 'panel.set-side',
        payload: { panelId, side },
      })
    },
    show(panelId: PanelId, side?: PanelSide) {
      return dispatch({
        type: 'panel.activate',
        payload: { panelId, side },
      })
    },
    toggleSidebar() {
      return dispatch({ type: 'panel.toggle-sidebar' })
    },
    toggleDetail() {
      return dispatch({ type: 'panel.toggle-detail' })
    },
    setShellVisible(visible: boolean) {
      return dispatch({
        type: 'panel.set-shell-visible',
        payload: { visible },
      })
    },
    toggleShell() {
      return dispatch({ type: 'panel.toggle-shell' })
    },
    hide(target: 'sidebar' | 'detail' | 'shell') {
      return dispatch({
        type: 'panel.hide',
        payload: { target },
      })
    },
    freeze(target: 'sidebar' | 'detail' | 'shell') {
      return dispatch({
        type: 'panel.hide',
        payload: { target },
      })
    },
  },
  terminal: {
    initialize(): Promise<() => void> {
      return dispatch({ type: 'terminal.initialize' }) as Promise<() => void>
    },
    createTab(shell?: string, cwd?: string) {
      return dispatch({
        type: 'terminal.create-tab',
        payload: { shell, cwd },
      })
    },
    activateTab(tabId: string) {
      return dispatch({
        type: 'terminal.activate-tab',
        payload: { tabId },
      })
    },
    closeTab(tabId: string) {
      return dispatch({
        type: 'terminal.close-tab',
        payload: { tabId },
      })
    },
    write(tabId: string, data: string) {
      return dispatch({
        type: 'terminal.write',
        payload: { tabId, data },
      })
    },
    run(command: string, options: { shell?: string; cwd?: string; tabId?: string } = {}) {
      return dispatch({
        type: 'terminal.run',
        payload: {
          command,
          shell: options.shell,
          cwd: options.cwd,
          tabId: options.tabId,
        },
      })
    },
    stop(tabId: string) {
      return dispatch({
        type: 'terminal.stop',
        payload: { tabId },
      })
    },
  },
  workflow: {
    load(): Promise<void> {
      return dispatch({ type: 'workflow.load' }) as Promise<void>
    },
    loadHistory(limit?: number): Promise<void> {
      return dispatch({
        type: 'workflow.load-history',
        payload: { limit },
      }) as Promise<void>
    },
    create(name: string, description: string, definition: string): Promise<Workflow | null> {
      return dispatch({
        type: 'workflow.create',
        payload: { name, description, definition },
      }) as Promise<Workflow | null>
    },
    update(
      workflowId: string,
      name: string,
      description: string,
      definition: string,
    ): Promise<void> {
      return dispatch({
        type: 'workflow.update',
        payload: { workflowId, name, description, definition },
      }) as Promise<void>
    },
    remove(workflowId: string): Promise<void> {
      return dispatch({
        type: 'workflow.remove',
        payload: { workflowId },
      }) as Promise<void>
    },
    run(workflowId: string, variables?: string) {
      return dispatch({
        type: 'workflow.run',
        payload: { workflowId, variables },
      })
    },
    stop(executionId: string) {
      return dispatch({
        type: 'workflow.stop',
        payload: { executionId },
      })
    },
    approveStep(executionId: string, stepId: string, approved: boolean) {
      return dispatch({
        type: 'workflow.approve-step',
        payload: { executionId, stepId, approved },
      })
    },
    getStatus(executionId: string): Promise<WorkflowExecution | null> {
      return dispatch({
        type: 'workflow.get-status',
        payload: { executionId },
      }) as Promise<WorkflowExecution | null>
    },
    select(workflowId: string | null): Promise<void> {
      return dispatch({
        type: 'workflow.select',
        payload: { workflowId },
      }) as Promise<void>
    },
  },
  task: {
    load() {
      return dispatch({ type: 'task.load' })
    },
    create(config: TaskCreateInput) {
      return dispatch({
        type: 'task.create',
        payload: { config },
      })
    },
    move(taskId: string, status: string) {
      return dispatch({
        type: 'task.move',
        payload: { taskId, status },
      })
    },
    remove(taskId: string) {
      return dispatch({
        type: 'task.remove',
        payload: { taskId },
      })
    },
  },
  ui: {
    toggleSearchPanel() {
      return dispatch({ type: 'ui.toggle-search-panel' })
    },
    toggleHistoryPanel() {
      return dispatch({ type: 'ui.toggle-history-panel' })
    },
    toggleQuickOpen() {
      return dispatch({ type: 'ui.toggle-quick-open' })
    },
    setViewMode(mode: ViewMode) {
      return dispatch({
        type: 'ui.set-view-mode',
        payload: { mode },
      })
    },
    setSettingsVisible(visible: boolean) {
      return dispatch({
        type: 'ui.set-settings-visible',
        payload: { visible },
      })
    },
    setTeamsMode(enabled: boolean) {
      return dispatch({
        type: 'ui.set-teams-mode',
        payload: { enabled },
      })
    },
    setNewSessionDialogVisible(visible: boolean) {
      return dispatch({
        type: 'ui.set-new-session-dialog-visible',
        payload: { visible },
      })
    },
  },
  navigation: {
    openSession(sessionId: string) {
      return dispatch({
        type: 'navigation.open-session',
        payload: { sessionId },
      })
    },
    openTaskBoard(taskId?: string | null) {
      return dispatch({
        type: 'navigation.open-task-board',
        payload: { taskId },
      })
    },
    openTeams() {
      return dispatch({ type: 'navigation.open-teams' })
    },
  },
}

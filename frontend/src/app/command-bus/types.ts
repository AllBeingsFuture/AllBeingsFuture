import type { LayoutMode, PaneContent, PanelId, PanelSide, ViewMode } from '../../stores/ui-helpers'
import type { AdapterType, SessionConfig } from '../../../bindings/allbeingsfuture/internal/models/models'

export type TerminalImagePayload = Array<{ data: string; mimeType: string }>
export type TaskCreateInput = {
  title?: string
  description?: string
  status?: 'todo' | 'in_progress' | 'waiting' | 'done'
  priority?: number | string
  sessionId?: string
  workingDirectory?: string
  providerId?: string
  assignedTo?: string
}

export type WorkbenchCommand =
  | {
      type: 'provider.list'
    }
  | {
      type: 'provider.create'
      payload: {
        name: string
        command: string
        adapterType: AdapterType
      }
    }
  | {
      type: 'provider.update'
      payload: {
        providerId: string
        updates: Record<string, unknown>
      }
    }
  | {
      type: 'provider.remove'
      payload: {
        providerId: string
      }
    }
  | {
      type: 'provider.test-executable'
      payload: {
        providerId: string
        executablePath: string
      }
    }
  | {
      type: 'app.select-directory'
    }
  | {
      type: 'app.select-file'
    }
  | {
      type: 'log.open-file'
    }
  | {
      type: 'file-manager.set-current-dir'
      payload: {
        dir: string | null
      }
    }
  | {
      type: 'file-manager.toggle-dir'
      payload: {
        dirPath: string
      }
    }
  | {
      type: 'file-manager.set-selected-path'
      payload: {
        path: string | null
      }
    }
  | {
      type: 'file-manager.refresh-current-dir'
    }
  | {
      type: 'layout.set-mode'
      payload: {
        mode: LayoutMode
      }
    }
  | {
      type: 'layout.set-pane-content'
      payload: {
        pane: 'primary' | 'secondary'
        content: PaneContent
      }
    }
  | {
      type: 'layout.swap-panes'
    }
  | {
      type: 'session.load'
    }
  | {
      type: 'session.create'
      payload: {
        config: SessionConfig
      }
    }
  | {
      type: 'session.init'
      payload: {
        sessionId: string
      }
    }
  | {
      type: 'session.resume'
      payload: {
        sessionId: string
      }
    }
  | {
      type: 'session.end'
      payload: {
        sessionId: string
      }
    }
  | {
      type: 'session.remove'
      payload: {
        sessionId: string
      }
    }
  | {
      type: 'session.rename'
      payload: {
        sessionId: string
        name: string
      }
    }
  | {
      type: 'session.smart-rename'
      payload: {
        sessionId: string
      }
    }
  | {
      type: 'chat.append-message'
      payload: {
        sessionId: string
        text: string
        images?: TerminalImagePayload
      }
    }
  | {
      type: 'chat.stop'
      payload: {
        sessionId: string
      }
    }
  | {
      type: 'editor.open-file'
      payload: {
        path: string
      }
    }
  | {
      type: 'editor.open-file-at-line'
      payload: {
        path: string
        lineNumber: number
        column?: number
      }
    }
  | {
      type: 'editor.save-file'
      payload: {
        tabId: string
      }
    }
  | {
      type: 'editor.search-files'
      payload: {
        rootDir: string
        query: string
      }
    }
  | {
      type: 'panel.set-side'
      payload: {
        panelId: PanelId
        side: PanelSide
      }
    }
  | {
      type: 'panel.hide'
      payload: {
        target: 'sidebar' | 'detail' | 'shell'
      }
    }
  | {
      type: 'panel.activate'
      payload: {
        panelId: PanelId
        side?: PanelSide
      }
    }
  | {
      type: 'panel.toggle-sidebar'
    }
  | {
      type: 'panel.toggle-detail'
    }
  | {
      type: 'panel.set-shell-visible'
      payload: {
        visible: boolean
      }
    }
  | {
      type: 'panel.toggle-shell'
    }
  | {
      type: 'terminal.initialize'
    }
  | {
      type: 'terminal.create-tab'
      payload: {
        shell?: string
        cwd?: string
      }
    }
  | {
      type: 'terminal.activate-tab'
      payload: {
        tabId: string
      }
    }
  | {
      type: 'terminal.close-tab'
      payload: {
        tabId: string
      }
    }
  | {
      type: 'terminal.write'
      payload: {
        tabId: string
        data: string
      }
    }
  | {
      type: 'terminal.run'
      payload: {
        command: string
        shell?: string
        cwd?: string
        tabId?: string
      }
    }
  | {
      type: 'terminal.stop'
      payload: {
        tabId: string
      }
    }
  | {
      type: 'workflow.load'
    }
  | {
      type: 'workflow.load-history'
      payload?: {
        limit?: number
      }
    }
  | {
      type: 'workflow.create'
      payload: {
        name: string
        description: string
        definition: string
      }
    }
  | {
      type: 'workflow.update'
      payload: {
        workflowId: string
        name: string
        description: string
        definition: string
      }
    }
  | {
      type: 'workflow.remove'
      payload: {
        workflowId: string
      }
    }
  | {
      type: 'workflow.run'
      payload: {
        workflowId: string
        variables?: string
      }
    }
  | {
      type: 'workflow.stop'
      payload: {
        executionId: string
      }
    }
  | {
      type: 'workflow.approve-step'
      payload: {
        executionId: string
        stepId: string
        approved: boolean
      }
    }
  | {
      type: 'workflow.get-status'
      payload: {
        executionId: string
      }
    }
  | {
      type: 'workflow.select'
      payload: {
        workflowId: string | null
      }
    }
  | {
      type: 'task.load'
    }
  | {
      type: 'task.create'
      payload: {
        config: TaskCreateInput
      }
    }
  | {
      type: 'task.move'
      payload: {
        taskId: string
        status: string
      }
    }
  | {
      type: 'task.remove'
      payload: {
        taskId: string
      }
    }
  | {
      type: 'ui.toggle-search-panel'
    }
  | {
      type: 'ui.toggle-history-panel'
    }
  | {
      type: 'ui.toggle-quick-open'
    }
  | {
      type: 'ui.set-view-mode'
      payload: {
        mode: ViewMode
      }
    }
  | {
      type: 'ui.set-settings-visible'
      payload: {
        visible: boolean
      }
    }
  | {
      type: 'ui.set-teams-mode'
      payload: {
        enabled: boolean
      }
    }
  | {
      type: 'ui.set-new-session-dialog-visible'
      payload: {
        visible: boolean
      }
    }
  | {
      type: 'navigation.open-session'
      payload: {
        sessionId: string
      }
    }
  | {
      type: 'navigation.open-task-board'
      payload: {
        taskId?: string | null
      }
    }
  | {
      type: 'navigation.open-teams'
    }

export type WorkbenchCommandHandler = (
  command: WorkbenchCommand,
) => Promise<unknown> | unknown

/**
 * Electron Preload Script
 *
 * Exposes a safe IPC bridge to the renderer process via contextBridge.
 *
 * The renderer calls window.electronAPI.invoke(channel, ...args)
 * which maps to ipcMain.handle(channel, ...) in the main process.
 *
 * Also provides event listening for push events from main → renderer.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Keep in sync with preload.cjs and ipcMain.handle / webContents.send names.
const INVOKE_CHANNELS = new Set([
  // app / window (main.ts)
  'app:quit',
  'app:selectDirectory',
  'app:selectFile',
  'app:openInExplorer',
  'app:openInTerminal',
  'app:openExternal',
  'clipboard:writeText',
  'clipboard:readText',
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
  // Session
  'SessionService.GetAll',
  'SessionService.GetByID',
  'SessionService.Create',
  'SessionService.Delete',
  'SessionService.End',
  'SessionService.UpdateName',
  'SessionService.UpdateStatus',
  'SessionService.SetWorktreeInfo',
  'SessionService.MarkWorktreeMerged',
  // Process / agents
  'ProcessService.InitSession',
  'ProcessService.SendMessage',
  'ProcessService.SendMessageWithImages',
  'ProcessService.GetChatState',
  'ProcessService.StopProcess',
  'agent:permission:respond',
  'ProcessService.ResumeSession',
  'ProcessService.SpawnChildSession',
  'ProcessService.SendToChild',
  'ProcessService.ListAllAgents',
  'ProcessService.CloseChildSession',
  // Provider
  'ProviderService.GetAll',
  'ProviderService.GetByID',
  'ProviderService.Create',
  'ProviderService.Update',
  'ProviderService.Delete',
  'ProviderService.TestExecutable',
  // Settings
  'SettingsService.GetAll',
  'SettingsService.Update',
  'SettingsService.UpdateBatch',
  'SettingsService.GetAutoWorktree',
  'SettingsService.SetAutoWorktree',
  'SettingsService.SetAutoLaunch',
  'SettingsService.GetProxyEnv',
  'SettingsService.SendNotification',
  // Task
  'TaskService.GetAll',
  'TaskService.GetByID',
  'TaskService.Create',
  'TaskService.Update',
  'TaskService.Delete',
  // Git
  'GitService.IsGitRepo',
  'GitService.GetRepoRoot',
  'GitService.EnsureRepo',
  'GitService.GetCurrentBranch',
  'GitService.GetMainBranch',
  'GitService.GetStatus',
  'GitService.GetDiff',
  'GitService.Commit',
  'GitService.CreateWorktree',
  'GitService.RemoveWorktree',
  'GitService.ListWorktrees',
  'GitService.CheckMerge',
  'GitService.MergeWorktree',
  // Log
  'LogService.GetRecent',
  'LogService.GetLogFilePath',
  'LogService.Clear',
  // Workflow
  'WorkflowService.CreateWorkflow',
  'WorkflowService.GetAllWorkflows',
  'WorkflowService.GetWorkflowByID',
  'WorkflowService.UpdateWorkflow',
  'WorkflowService.DeleteWorkflow',
  'WorkflowService.StartWorkflow',
  'WorkflowService.StopWorkflow',
  'WorkflowService.ApproveStep',
  'WorkflowService.GetWorkflowStatus',
  'WorkflowService.GetActiveWorkflows',
  'WorkflowService.GetExecutionHistory',
  // Mission
  'MissionService.CreateMission',
  'MissionService.GetMission',
  'MissionService.ListMissions',
  'MissionService.DeleteMission',
  'MissionService.ConfirmBrainstorm',
  'MissionService.ConfirmTeamDesign',
  'MissionService.ConfirmPhases',
  'MissionService.StartMission',
  'MissionService.PauseMission',
  'MissionService.ResumeMission',
  'MissionService.AbortMission',
  'MissionService.SkipCurrentPhase',
  'MissionService.ListRoleTemplates',
  // Team
  'TeamService.CreateDefinition',
  'TeamService.ListDefinitions',
  'TeamService.UpdateDefinition',
  'TeamService.DeleteDefinition',
  'TeamService.AddRole',
  'TeamService.UpdateRole',
  'TeamService.DeleteRole',
  'TeamService.StartInstance',
  'TeamService.ListInstances',
  'TeamService.GetMessages',
  'TeamService.GetTasks',
  // MCP
  'MCPService.List',
  'MCPService.Get',
  'MCPService.Install',
  'MCPService.Uninstall',
  'MCPService.UpdateConfig',
  'MCPService.ToggleEnabled',
  'MCPService.GetRuntimeInfo',
  // Skill
  'SkillService.List',
  'SkillService.Get',
  'SkillService.Install',
  'SkillService.Delete',
  'SkillService.ToggleEnabled',
  'SkillService.GetRuntimeInfo',
  // Update
  'UpdateService.Init',
  'UpdateService.GetState',
  'UpdateService.CheckForUpdates',
  'UpdateService.OpenDownloadPage',
  // System settings
  'SystemSettingsService.GetConfig',
  'SystemSettingsService.GetAll',
  'SystemSettingsService.Get',
  'SystemSettingsService.Update',
  'SystemSettingsService.UpdateBatch',
  'SystemSettingsService.ValidateConfig',
  // Feedback
  'FeedbackService.SubmitGithubIssue',
  // Sticker
  'StickerService.Initialize',
  'StickerService.Search',
  'StickerService.SearchByMood',
  'StickerService.GetCategories',
  'StickerService.GetMoods',
  'StickerService.GetStatus',
  'StickerService.DownloadAndCache',
  'StickerService.RefreshIndex',
  'StickerService.ClearCache',
  // File transfer
  'FileTransferService.PrepareFile',
  'FileTransferService.ValidatePlatformLimit',
  'FileTransferService.SaveClipboardImage',
  'FileTransferService.SaveDroppedFile',
  // Tracker
  'FileChangeTracker.OnSessionStateChange',
  'FileChangeTracker.GetSessionChanges',
  'FileChangeTracker.RecordWorktreeChanges',
  'FileChangeTracker.HandleFsChange',
  'FileChangeTracker.RemoveSession',
  'FileChangeTracker.UpdateSessionActivity',
  'FileChangeTracker.FindSessionIDByWorkingDir',
  // Workspace
  'WorkspaceService.List',
  'WorkspaceService.Create',
  'WorkspaceService.Update',
  'WorkspaceService.Delete',
  'WorkspaceService.ScanRepos',
  'WorkspaceService.ImportVscode',
  'WorkspaceService.IsGitRepo',
  // Quick open
  'QuickOpen.Search',
])

const EVENT_CHANNELS = new Set([
  'chat:update',
  'chat:patch',
  'chat:message-queued',
  'agent:stream',
  'agent:update',
  'files-dropped',
  'parser:activity',
  'parser:intervention',
  'parser:status-change',
  'tracker:filesUpdated',
  'tray:new-session',
  'notification:select-session',
])

const SEND_CHANNELS = new Set([
  'native-files-dropped',
])

function assertInvokeChannel(channel: string): void {
  if (!INVOKE_CHANNELS.has(channel)) {
    throw new Error(`IPC invoke channel not allowed: ${channel}`)
  }
}

function assertEventChannel(channel: string): void {
  if (!EVENT_CHANNELS.has(channel)) {
    throw new Error(`IPC event channel not allowed: ${channel}`)
  }
}

function assertSendChannel(channel: string): void {
  if (!SEND_CHANNELS.has(channel)) {
    throw new Error(`IPC send channel not allowed: ${channel}`)
  }
}

// ---- IPC Bridge ----

const electronAPI = {
  /**
   * Generic invoke: calls ipcMain.handle(channel, ...args)
   * All service bindings use this.
   */
  invoke: (channel: string, ...args: any[]) => {
    assertInvokeChannel(channel)
    return ipcRenderer.invoke(channel, ...args)
  },

  /**
   * Listen to events pushed from main process.
   * Returns an unsubscribe function.
   */
  on: (channel: string, callback: (...args: any[]) => void) => {
    assertEventChannel(channel)
    const listener = (_event: Electron.IpcRendererEvent, ...args: any[]) => {
      callback(...args)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  /**
   * Listen to an event once.
   */
  once: (channel: string, callback: (...args: any[]) => void) => {
    assertEventChannel(channel)
    ipcRenderer.once(channel, (_event, ...args) => {
      callback(...args)
    })
  },

  /**
   * Send a one-way message to main (no response).
   */
  send: (channel: string, ...args: any[]) => {
    assertSendChannel(channel)
    ipcRenderer.send(channel, ...args)
  },

  quickOpen: {
    search: (rootDir: string, query: string) => {
      assertInvokeChannel('QuickOpen.Search')
      return ipcRenderer.invoke('QuickOpen.Search', rootDir, query)
    },
  },

  /**
   * Get the file system path for a File object (Electron 29+).
   * Returns empty string if the File has no backing path.
   */
  getPathForFile: (file: File): string => {
    try {
      const p = webUtils.getPathForFile(file)
      if (p) return p
    } catch { /* ignore */ }
    return (file as any).path || ''
  },
}

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// ---- Drop Safety Net ----
// Prevent the browser from navigating to dropped files.
// All file handling is done in React's onDrop handler (MessageInput).
document.addEventListener('dragover', (event) => {
  event.preventDefault()
})
document.addEventListener('drop', (event) => {
  event.preventDefault()
})

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI

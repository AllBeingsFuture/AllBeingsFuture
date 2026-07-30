/**
 * Electron Preload Script (CommonJS)
 *
 * Exposes a safe IPC bridge to the renderer process via contextBridge.
 * Must be CJS to work reliably inside asar in packaged Electron apps.
 *
 * Keep channel allowlists in sync with preload.ts.
 */

const { contextBridge, ipcRenderer } = require('electron')

const INVOKE_CHANNELS = new Set([
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
  'SessionService.GetAll',
  'SessionService.GetByID',
  'SessionService.Create',
  'SessionService.Delete',
  'SessionService.End',
  'SessionService.UpdateName',
  'SessionService.UpdateStatus',
  'SessionService.SetWorktreeInfo',
  'SessionService.MarkWorktreeMerged',
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
  'ProviderService.GetAll',
  'ProviderService.GetByID',
  'ProviderService.Create',
  'ProviderService.Update',
  'ProviderService.Delete',
  'ProviderService.TestExecutable',
  'SettingsService.GetAll',
  'SettingsService.Update',
  'SettingsService.UpdateBatch',
  'SettingsService.GetAutoWorktree',
  'SettingsService.SetAutoWorktree',
  'SettingsService.SetAutoLaunch',
  'SettingsService.GetProxyEnv',
  'SettingsService.SendNotification',
  'TaskService.GetAll',
  'TaskService.GetByID',
  'TaskService.Create',
  'TaskService.Update',
  'TaskService.Delete',
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
  'LogService.GetRecent',
  'LogService.GetLogFilePath',
  'LogService.Clear',
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
  'MCPService.List',
  'MCPService.Get',
  'MCPService.Install',
  'MCPService.Uninstall',
  'MCPService.UpdateConfig',
  'MCPService.ToggleEnabled',
  'MCPService.GetRuntimeInfo',
  'SkillService.List',
  'SkillService.Get',
  'SkillService.Install',
  'SkillService.Delete',
  'SkillService.ToggleEnabled',
  'SkillService.GetRuntimeInfo',
  'UpdateService.Init',
  'UpdateService.GetState',
  'UpdateService.CheckForUpdates',
  'UpdateService.OpenDownloadPage',
  'SystemSettingsService.GetConfig',
  'SystemSettingsService.GetAll',
  'SystemSettingsService.Get',
  'SystemSettingsService.Update',
  'SystemSettingsService.UpdateBatch',
  'SystemSettingsService.ValidateConfig',
  'FeedbackService.SubmitGithubIssue',
  'StickerService.Initialize',
  'StickerService.Search',
  'StickerService.SearchByMood',
  'StickerService.GetCategories',
  'StickerService.GetMoods',
  'StickerService.GetStatus',
  'StickerService.DownloadAndCache',
  'StickerService.RefreshIndex',
  'StickerService.ClearCache',
  'FileTransferService.PrepareFile',
  'FileTransferService.ValidatePlatformLimit',
  'FileTransferService.SaveClipboardImage',
  'FileTransferService.SaveDroppedFile',
  'FileChangeTracker.OnSessionStateChange',
  'FileChangeTracker.GetSessionChanges',
  'FileChangeTracker.RecordWorktreeChanges',
  'FileChangeTracker.HandleFsChange',
  'FileChangeTracker.RemoveSession',
  'FileChangeTracker.UpdateSessionActivity',
  'FileChangeTracker.FindSessionIDByWorkingDir',
  'WorkspaceService.List',
  'WorkspaceService.Create',
  'WorkspaceService.Update',
  'WorkspaceService.Delete',
  'WorkspaceService.ScanRepos',
  'WorkspaceService.ImportVscode',
  'WorkspaceService.IsGitRepo',
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

function assertInvokeChannel(channel) {
  if (!INVOKE_CHANNELS.has(channel)) {
    throw new Error(`IPC invoke channel not allowed: ${channel}`)
  }
}

function assertEventChannel(channel) {
  if (!EVENT_CHANNELS.has(channel)) {
    throw new Error(`IPC event channel not allowed: ${channel}`)
  }
}

function assertSendChannel(channel) {
  if (!SEND_CHANNELS.has(channel)) {
    throw new Error(`IPC send channel not allowed: ${channel}`)
  }
}

const electronAPI = {
  invoke: (channel, ...args) => {
    assertInvokeChannel(channel)
    return ipcRenderer.invoke(channel, ...args)
  },

  on: (channel, callback) => {
    assertEventChannel(channel)
    const listener = (_event, ...args) => {
      callback(...args)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  once: (channel, callback) => {
    assertEventChannel(channel)
    ipcRenderer.once(channel, (_event, ...args) => {
      callback(...args)
    })
  },

  send: (channel, ...args) => {
    assertSendChannel(channel)
    ipcRenderer.send(channel, ...args)
  },

  quickOpen: {
    search: (rootDir, query) => {
      assertInvokeChannel('QuickOpen.Search')
      return ipcRenderer.invoke('QuickOpen.Search', rootDir, query)
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

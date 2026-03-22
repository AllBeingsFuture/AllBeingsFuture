// ===================== AI Provider =====================

export type AdapterType =
  | 'claude-sdk'
  | 'codex-appserver'
  | 'gemini-headless'
  | 'opencode-sdk'
  | 'openai-api'

export interface AIProvider {
  id: string
  name: string
  command: string
  isBuiltin: boolean
  adapterType: AdapterType
  envOverrides: string
  executablePath: string
  nodeVersion: string
  autoAcceptFlag: string
  resumeFlag: string
  defaultArgs: string
  autoAcceptArg: string
  resumeArg: string
  sessionIdDetection: string
  resumeFormat: string
  sessionIdPattern: string
  gitBashPath: string
  defaultModel: string
  maxOutputTokens: number
  reasoningEffort: string
  preferResponsesApi: boolean
  sortOrder: number
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

// ===================== Session =====================

export type SessionStatus =
  | 'starting' | 'running' | 'idle'
  | 'waiting_input' | 'completed' | 'error' | 'terminated'

export type SessionMode = 'normal' | 'supervisor' | 'mission'

export interface Session {
  id: string
  name: string
  workingDirectory: string
  providerId: string
  status: SessionStatus
  mode: SessionMode
  initialPrompt: string
  autoAccept: boolean
  worktreePath: string
  worktreeBranch: string
  worktreeBaseCommit: string
  worktreeBaseBranch: string
  worktreeMerged: boolean
  worktreeSourceRepo: string
  startedAt: string
  endedAt: string | null
}

export interface SessionConfig {
  name: string
  workingDirectory: string
  providerId: string
  mode: SessionMode
  initialPrompt: string
  autoAccept: boolean
  worktreeEnabled: boolean
  gitRepoPath: string
  gitBranch: string
}

// ===================== Agent Teams =====================

export interface TeamRoleDefinition {
  id: string
  teamId: string
  roleName: string
  displayName: string
  systemPrompt: string
  providerId: string
  color: string
  sortOrder: number
}

export interface TeamDefinition {
  id: string
  name: string
  description: string
  roles: TeamRoleDefinition[]
  createdAt: string
  updatedAt: string
}

export type TeamInstanceStatus = 'starting' | 'running' | 'paused' | 'completed' | 'failed'
export type MemberStatus = 'pending' | 'starting' | 'running' | 'idle' | 'completed' | 'failed'

export interface TeamMember {
  id: string
  instanceId: string
  roleName: string
  displayName: string
  agentId: string
  childSessionId: string
  status: MemberStatus
  color: string
  joinedAt: string
}

export interface TeamInstance {
  id: string
  teamId: string
  name: string
  workingDirectory: string
  task: string
  status: TeamInstanceStatus
  members: TeamMember[]
  startedAt: string
  endedAt: string | null
}

export type TaskItemType = 'goal' | 'task'
export type TaskItemStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

export interface TeamTaskItem {
  id: string
  instanceId: string
  title: string
  description: string
  type: TaskItemType
  status: TaskItemStatus
  assignedTo: string
  completedBy: string
  dependencies: string[]
  createdAt: string
}

export type TeamMessageType = 'chat' | 'task_assign' | 'task_complete' | 'broadcast'

export interface TeamMessage {
  id: string
  instanceId: string
  taskId: string
  fromRole: string
  toRole: string
  content: string
  messageType: TeamMessageType
  timestamp: string
}

// ===================== Settings =====================

export type ProxyType = 'none' | 'http' | 'socks5'
export type VoiceTranscriptionMode = 'openai' | 'volcengine'

export interface AppSettings {
  proxyType: ProxyType
  proxyHost: string
  proxyPort: string
  proxyUsername: string
  proxyPassword: string
  voiceTranscriptionMode: VoiceTranscriptionMode
  voiceTranscriptionProviderId: string
  autoWorktree: boolean
  alwaysReplyInChinese: boolean
  autoLaunch: boolean
  notificationEnabled: boolean
  fontSize: number
  theme: string
}

// ===================== Git Worktree =====================

export interface WorktreeInfo {
  path: string
  branch: string
  headCommit: string
  isMain: boolean
}

export interface GitStatus {
  staged: string[]
  unstaged: string[]
  untracked: string[]
  branch: string
  ahead: number
  behind: number
}

export interface MergeResult {
  success: boolean
  mergedBranch: string
  targetBranch: string
  hasConflicts: boolean
  conflictFiles: string[]
  autoResolved: boolean
  message: string
}

export interface CreateWorktreeResult {
  worktreePath: string
  branch: string
  baseCommit: string
}

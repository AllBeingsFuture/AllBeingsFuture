// Slim runtime models (build-only).
import { createArray, createNullable, createMap, identity } from '../../../electron-api';

export const AdapterType = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", AdapterOpenAIAPI: "openai-api", AdapterAcp: "acp", AdapterAcpStdio: "acp-stdio", };
export const MemberStatus = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", MemberPending: "pending", MemberStarting: "starting", MemberRunning: "running", MemberIdle: "idle", MemberCompleted: "completed", MemberFailed: "failed", };
export const ProxyType = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", ProxyNone: "none", ProxyHTTP: "http", ProxySocks5: "socks5", };
export const SessionMode = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", SessionModeNormal: "normal", SessionModeSupervisor: "supervisor", SessionModeMission: "mission", };
export const SessionStatus = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", SessionStarting: "starting", SessionRunning: "running", SessionIdle: "idle", SessionWaitingInput: "waiting_input", SessionCompleted: "completed", SessionError: "error", SessionTerminated: "terminated", };
export const TaskItemStatus = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", TaskPending: "pending", TaskInProgress: "in_progress", TaskCompleted: "completed", TaskBlocked: "blocked", };
export const TaskItemType = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", TaskTypeGoal: "goal", TaskTypeTask: "task", };
export const TeamInstanceStatus = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", TeamStarting: "starting", TeamRunning: "running", TeamPaused: "paused", TeamCompleted: "completed", TeamFailed: "failed", };
export const TeamMessageType = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", MsgChat: "chat", MsgTaskAssign: "task_assign", MsgTaskComplete: "task_complete", MsgBroadcast: "broadcast", };
export const VoiceTranscriptionMode = { /** * The Go zero value for the underlying type of the enum. */ $zero: "", VoiceOpenAI: "openai", VoiceVolcengine: "volcengine", };

export class AIProvider {
  constructor(s = {}) {
    Object.assign(this, {id: "", name: "", command: "", isBuiltin: false, adapterType: AdapterType.$zero, envOverrides: "", executablePath: "", nodeVersion: "", autoAcceptFlag: "", resumeFlag: "", defaultArgs: "", autoAcceptArg: "", resumeArg: "", sessionIdDetection: "", resumeFormat: "", sessionIdPattern: "", gitBashPath: "", defaultModel: "", maxOutputTokens: 0, reasoningEffort: "", preferResponsesApi: false, sortOrder: 0, isEnabled: false, createdAt: null, updatedAt: null}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new AIProvider(p);
  }
}

export class AppSettings {
  constructor(s = {}) {
    Object.assign(this, {proxyType: ProxyType.$zero, proxyHost: "", proxyPort: "", proxyUsername: "", proxyPassword: "", voiceTranscriptionMode: VoiceTranscriptionMode.$zero, voiceTranscriptionProviderId: "", autoWorktree: false, alwaysReplyInChinese: false, autoLaunch: false, notificationEnabled: false, fontSize: 0, theme: "", appSettingsVersion: "", defaultSessionMode: "", telegramBotToken: "", telegramAllowedChatIds: "", telegramWebhookUrl: "", telegramWebhookSecret: "", telegramEnabled: false, telegramMode: "", telegramAllowedUserIds: "", telegramCommandPrefix: "", telegramNotifyOnDone: false, qqbotEnabled: false, qqbotHttpEndpoint: "", qqbotWsEndpoint: "", qqbotAccessToken: "", qqbotMode: "", qqbotAllowedUserIds: "", qqbotAllowedGroupIds: "", qqbotCommandPrefix: "", qqbotNotifyOnDone: false, qqofficialEnabled: false, qqofficialAppId: "", qqofficialAppSecret: "", qqofficialSandbox: false, qqofficialCommandPrefix: "", qqofficialNotifyOnDone: false, supervisorEnabled: false, supervisorMaxTokens: 0, supervisorMaxIterations: 0, supervisorMaxToolCalls: 0, supervisorMaxDurationSeconds: 0, proactiveEnabled: false, proactiveMaxDailyMessages: 0, proactiveMinIntervalMinutes: 0, proactiveQuietHoursStart: 0, proactiveQuietHoursEnd: 0, proactiveIdleThresholdHours: 0}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new AppSettings(p);
  }
}

export class ChatMessage {
  constructor(s = {}) {
    Object.assign(this, {role: "", content: "", partial: false}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new ChatMessage(p);
  }
}

export class ChatState {
  constructor(s = {}) {
    Object.assign(this, {messages: [], streaming: false, error: ""}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new ChatState(p);
  }
}

export class CreateWorktreeResult {
  constructor(s = {}) {
    Object.assign(this, {worktreePath: "", branch: "", baseCommit: ""}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new CreateWorktreeResult(p);
  }
}

export class GitStatus {
  constructor(s = {}) {
    Object.assign(this, {staged: [], unstaged: [], untracked: [], branch: "", ahead: 0, behind: 0}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new GitStatus(p);
  }
}

export class MergeResult {
  constructor(s = {}) {
    Object.assign(this, {success: false, mergedBranch: "", targetBranch: "", hasConflicts: false, conflictFiles: [], autoResolved: false, message: "", linesAdded: 0, linesRemoved: 0}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new MergeResult(p);
  }
}

export class Session {
  constructor(s = {}) {
    Object.assign(this, {id: "", name: "", workingDirectory: "", providerId: "", status: SessionStatus.$zero, mode: SessionMode.$zero, initialPrompt: "", autoAccept: false, worktreePath: "", worktreeBranch: "", worktreeBaseCommit: "", worktreeBaseBranch: "", worktreeMerged: false, worktreeSourceRepo: "", taskId: "", nameLocked: false, estimatedTokens: 0, config: "", claudeSessionId: "", exitCode: null, parentSessionId: "", startedAt: null, endedAt: null}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new Session(p);
  }
}

export class SessionConfig {
  constructor(s = {}) {
    Object.assign(this, {name: "", workingDirectory: "", providerId: "", mode: SessionMode.$zero, initialPrompt: "", autoAccept: false, worktreeEnabled: false, gitRepoPath: "", gitBranch: "", taskId: "", nameLocked: false, estimatedTokens: 0, config: "", claudeSessionId: ""}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new SessionConfig(p);
  }
}

export class StickerResult {
  constructor(s = {}) {
    Object.assign(this, {name: "", category: "", url: ""}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new StickerResult(p);
  }
}

export class StickerStatus {
  constructor(s = {}) {
    Object.assign(this, {initialized: false, totalStickers: 0, keywords: 0, categories: 0, cachedFiles: 0, dataDir: ""}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new StickerStatus(p);
  }
}

export class TeamDefinition {
  constructor(s = {}) {
    Object.assign(this, {id: "", name: "", description: "", roles: [], createdAt: null, updatedAt: null}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new TeamDefinition(p);
  }
}

export class TeamInstance {
  constructor(s = {}) {
    Object.assign(this, {id: "", teamId: "", name: "", workingDirectory: "", task: "", status: TeamInstanceStatus.$zero, members: [], startedAt: null, endedAt: null}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new TeamInstance(p);
  }
}

export class TeamMember {
  constructor(s = {}) {
    Object.assign(this, {id: "", instanceId: "", roleName: "", displayName: "", agentId: "", childSessionId: "", status: MemberStatus.$zero, color: "", joinedAt: null}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new TeamMember(p);
  }
}

export class TeamMessage {
  constructor(s = {}) {
    Object.assign(this, {id: "", instanceId: "", taskId: "", fromRole: "", toRole: "", content: "", messageType: TeamMessageType.$zero, timestamp: null}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new TeamMessage(p);
  }
}

export class TeamRoleDefinition {
  constructor(s = {}) {
    Object.assign(this, {id: "", teamId: "", roleName: "", displayName: "", systemPrompt: "", providerId: "", color: "", sortOrder: 0}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new TeamRoleDefinition(p);
  }
}

export class TeamTaskItem {
  constructor(s = {}) {
    Object.assign(this, {id: "", instanceId: "", title: "", description: "", type: TaskItemType.$zero, status: TaskItemStatus.$zero, assignedTo: "", completedBy: "", dependencies: [], createdAt: null}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new TeamTaskItem(p);
  }
}

export class WorktreeInfo {
  constructor(s = {}) {
    Object.assign(this, {path: "", branch: "", headCommit: "", isMain: false}, s);
  }
  static createFrom(s = {}) {
    const p = typeof s === "string" ? JSON.parse(s) : s;
    return new WorktreeInfo(p);
  }
}

const $$createType0 = createMap(identity, identity);
const $$createType1 = ChatMessage.createFrom;
const $$createType2 = createArray($$createType1);
const $$createType3 = createArray(identity);
const $$createType41 = TeamRoleDefinition.createFrom;
const $$createType42 = createArray($$createType41);
const $$createType43 = TeamMember.createFrom;
const $$createType44 = createArray($$createType43);

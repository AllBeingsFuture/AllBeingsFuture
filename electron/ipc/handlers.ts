/**
 * IPC Handlers - routes all renderer IPC calls to the appropriate service
 *
 * Each ipcMain.handle(channel, ...) maps to a service method.
 */

import { ipcMain, BrowserWindow, shell } from 'electron'
import { execSync } from 'child_process'
import { readdir, rm } from 'node:fs/promises'
import path from 'path'
import type { Database } from '../services/database.js'
import type { BridgeManager } from '../bridge/bridge.js'

// Core services
import { SessionService } from '../services/session.js'
import { ProviderService } from '../services/provider.js'
import { SettingsService } from '../services/settings.js'
import { ProcessService } from '../services/process.js'
import { TaskService } from '../services/task.js'
import { GitService } from '../services/git.js'
import { PTYService } from '../services/pty.js'
import { LogService } from '../services/log.js'

// Expanded services
import { WorkflowService } from '../services/workflow.js'
import { MissionService } from '../services/mission.js'
import { TeamService } from '../services/team.js'
import { MCPService } from '../services/mcp.js'
import { SkillService } from '../services/skill.js'

// New services
import { AuthService } from '../services/auth.js'
import { UpdateService } from '../services/update.js'
import { SystemSettingsService } from '../services/system-settings.js'
import { PolicyService } from '../services/policy.js'
import { SupervisorService } from '../services/supervisor.js'
import { NotificationService } from '../services/notification.js'
import { StickerService } from '../services/sticker.js'
import { SuggestionService } from '../services/suggestion.js'
import { ProactiveService } from '../services/proactive.js'
import { QueueService } from '../services/queue.js'
import { FileTransferService } from '../services/file-transfer.js'
import { TrackerService } from '../services/tracker.js'
import { UsageService } from '../services/usage.js'
import { BotService } from '../services/bot.js'
import { BotPushService } from '../services/bot-push.js'
import { TelegramService } from '../services/telegram.js'
import { QQBotService } from '../services/qqbot.js'
import { QQOfficialService } from '../services/qqofficial.js'
import { WorkspaceService } from '../services/workspace.js'

type GithubIssuePayload = {
  owner: string
  repo: string
  token: string
  title: string
  body: string
}

type GithubIssueResult = {
  number: number
  url: string
  title: string
}

function normalizeManagedPath(target: string): string {
  if (!target) return ''
  return path.resolve(target).replace(/\\/g, '/').replace(/\/+$/, '')
}

function isManagedWorktreePath(repoPath: string, worktreePath: string): boolean {
  const repoRoot = normalizeManagedPath(repoPath)
  const candidate = normalizeManagedPath(worktreePath)
  return candidate.startsWith(`${repoRoot}/.allbeingsfuture-worktrees/`)
    || candidate.startsWith(`${repoRoot}/.abf-worktrees/`)
}

function normalizeGithubIssuePayload(payload: GithubIssuePayload): GithubIssuePayload {
  return {
    owner: payload.owner.trim(),
    repo: payload.repo.trim(),
    token: payload.token.trim(),
    title: payload.title.trim(),
    body: payload.body.trim(),
  }
}

function formatGithubIssueError(status: number, message: string): string {
  switch (status) {
    case 400:
      return `GitHub 请求无效：${message}`
    case 401:
      return 'GitHub Token 无效或已过期，请检查后重试'
    case 403:
      return `GitHub 拒绝了请求：${message}`
    case 404:
      return '目标仓库不存在，或当前 Token 没有访问该仓库的权限'
    case 410:
      return 'GitHub Issues 在该仓库上不可用'
    case 422:
      return `GitHub 校验失败或触发了反滥用限制：${message}`
    case 503:
      return 'GitHub 服务暂时不可用，请稍后再试'
    default:
      return `GitHub API ${status}：${message}`
  }
}

async function submitGithubIssue(payload: GithubIssuePayload): Promise<GithubIssueResult> {
  const normalized = normalizeGithubIssuePayload(payload)
  if (!normalized.owner || !normalized.repo) {
    throw new Error('缺少 GitHub 仓库信息')
  }
  if (!normalized.token) {
    throw new Error('缺少 GitHub Token')
  }
  if (!normalized.title) {
    throw new Error('缺少 Issue 标题')
  }
  if (!normalized.body) {
    throw new Error('缺少 Issue 内容')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(normalized.owner)}/${encodeURIComponent(normalized.repo)}/issues`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${normalized.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'AllBeingsFuture',
          'X-GitHub-Api-Version': '2026-03-10',
        },
        body: JSON.stringify({
          title: normalized.title,
          body: normalized.body,
        }),
        signal: controller.signal,
      },
    )

    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      const message = typeof data.message === 'string' && data.message
        ? data.message
        : response.statusText
      throw new Error(formatGithubIssueError(response.status, message))
    }

    const number = Number(data.number ?? 0)
    const url = typeof data.html_url === 'string' ? data.html_url : ''
    const title = typeof data.title === 'string' ? data.title : normalized.title

    if (!number || !url) {
      throw new Error('GitHub 返回了异常响应，未拿到已创建 Issue 的编号或链接')
    }

    return { number, url, title }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('GitHub 请求超时，请检查网络后重试')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function registerAllIpcHandlers(
  db: Database,
  bridgeManager: BridgeManager,
  getWindow: () => BrowserWindow | null,
): { botPushService: BotPushService; processService: ProcessService } {
  // ---- Initialize ALL services ----
  const sessionService = new SessionService(db)
  const providerService = new ProviderService(db)
  const settingsService = new SettingsService(db)
  const processService = new ProcessService(db, sessionService, providerService, settingsService, bridgeManager, getWindow)
  const taskService = new TaskService(db)
  const gitService = new GitService()
  const ptyService = new PTYService(getWindow)
  const logService = new LogService()
  const workflowService = new WorkflowService(db)
  const missionService = new MissionService(db)
  const teamService = new TeamService(db)
  const mcpService = new MCPService(db)
  const skillService = new SkillService(db)
  const authService = new AuthService(db)
  const updateService = new UpdateService()
  const systemSettingsService = new SystemSettingsService(db)
  const policyService = new PolicyService(db)
  const supervisorService = new SupervisorService()
  const notificationService = new NotificationService(getWindow)
  const stickerService = new StickerService()
  const suggestionService = new SuggestionService()
  const proactiveService = new ProactiveService()
  const queueService = new QueueService(db)
  const fileTransferService = new FileTransferService()
  const trackerService = new TrackerService(getWindow, db)
  const usageService = new UsageService(db)
  const botService = new BotService(db)
  const botPushService = new BotPushService(botService)
  const telegramService = new TelegramService(db, botService, sessionService, providerService, processService)
  const qqBotService = new QQBotService(db)
  const qqOfficialService = new QQOfficialService(db)
  const workspaceService = new WorkspaceService(db)

  // Initialize async services
  stickerService.initialize().catch(() => {})
  updateService.init()

  // Seed builtin MCP servers and skills on startup (idempotent)
  try { mcpService.seedBuiltins() } catch {}
  try { skillService.seedBuiltins() } catch {}

  const cleanupManagedWorktreesOnStartup = async () => {
    const sessions = sessionService.getAll()
    const keepPathsByRepo = new Map<string, Set<string>>()
    const knownRepos = new Set<string>()

    for (const session of sessions) {
      const repoPath = normalizeManagedPath(session.worktreeSourceRepo || '')
      if (!repoPath) continue

      knownRepos.add(repoPath)
      if (!keepPathsByRepo.has(repoPath)) keepPathsByRepo.set(repoPath, new Set())

      if (session.worktreePath && !session.worktreeMerged) {
        keepPathsByRepo.get(repoPath)!.add(normalizeManagedPath(session.worktreePath))
      }
    }

    try {
      const workspaces = await workspaceService.list()
      for (const workspace of workspaces) {
        for (const repo of workspace.repos || []) {
          const repoPath = normalizeManagedPath(repo?.repoPath || '')
          if (repoPath) knownRepos.add(repoPath)
        }
      }
    } catch {}

    for (const repoPath of knownRepos) {
      const keepPaths = keepPathsByRepo.get(repoPath) || new Set<string>()
      let worktrees: any[] = []
      const registeredPaths = new Set<string>()

      try {
        worktrees = await gitService.listWorktrees(repoPath)
      } catch {
        continue
      }

      for (const worktree of worktrees) {
        const worktreePath = normalizeManagedPath(worktree?.path || '')
        if (worktreePath) registeredPaths.add(worktreePath)
        if (!worktreePath || worktree?.isMain || !isManagedWorktreePath(repoPath, worktreePath) || keepPaths.has(worktreePath)) {
          continue
        }

        try {
          await gitService.removeWorktree(repoPath, worktreePath, true, worktree?.branch || '')
        } catch (err) {
          console.warn('[startup-worktree-cleanup] failed to remove worktree', { repoPath, worktreePath, err })
        }
      }

      for (const managedDirName of ['.allbeingsfuture-worktrees', '.abf-worktrees']) {
        const managedDirPath = path.join(repoPath, managedDirName)
        let entries: Array<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }> = []

        try {
          entries = await readdir(managedDirPath, { withFileTypes: true })
        } catch {
          continue
        }

        for (const entry of entries) {
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

          const orphanPath = normalizeManagedPath(path.join(managedDirPath, entry.name))
          if (!orphanPath || keepPaths.has(orphanPath) || registeredPaths.has(orphanPath)) continue

          try {
            await rm(orphanPath, { recursive: true, force: true })
          } catch (err) {
            console.warn('[startup-worktree-cleanup] failed to remove orphan directory', { repoPath, orphanPath, err })
          }
        }
      }
    }
  }

  void cleanupManagedWorktreesOnStartup().catch(err => {
    console.warn('[startup-worktree-cleanup] failed', err)
  })

  telegramService.start()

  // ==============================================================
  // SessionService
  // ==============================================================
  ipcMain.handle('SessionService.GetAll', () => sessionService.getAll())
  ipcMain.handle('SessionService.GetByID', (_e, id: string) => sessionService.getById(id))
  ipcMain.handle('SessionService.Create', (_e, config: any) => sessionService.create(config))
  ipcMain.handle('SessionService.Delete', (_e, id: string) => sessionService.delete(id))
  ipcMain.handle('SessionService.End', (_e, id: string) => sessionService.end(id))
  ipcMain.handle('SessionService.UpdateName', (_e, id: string, name: string) => sessionService.updateName(id, name))
  ipcMain.handle('SessionService.UpdateStatus', (_e, id: string, status: string) => sessionService.updateStatus(id, status))
  ipcMain.handle('SessionService.SetWorktreeInfo', (_e, id: string, p: string, branch: string, baseCommit: string, baseBranch: string, sourceRepo: string) =>
    sessionService.setWorktreeInfo(id, p, branch, baseCommit, baseBranch, sourceRepo))
  ipcMain.handle('SessionService.MarkWorktreeMerged', (_e, id: string) => sessionService.markWorktreeMerged(id))

  // ==============================================================
  // ProcessService
  // ==============================================================
  ipcMain.handle('ProcessService.InitSession', (_e, sessionId: string) => processService.initSession(sessionId))
  ipcMain.handle('ProcessService.SendMessage', (_e, sessionId: string, message: string) => processService.sendMessage(sessionId, message))
  ipcMain.handle('ProcessService.SendMessageWithImages', (_e, sessionId: string, message: string, images: any[]) => processService.sendMessageWithImages(sessionId, message, images))
  ipcMain.handle('ProcessService.GetChatState', (_e, sessionId: string) => processService.getChatState(sessionId))
  ipcMain.handle('ProcessService.IsStreaming', (_e, sessionId: string) => processService.isStreaming(sessionId))
  ipcMain.handle('ProcessService.StopProcess', (_e, sessionId: string) => processService.stopProcess(sessionId))
  ipcMain.handle('ProcessService.ResumeSession', (_e, oldSessionId: string) => processService.resumeSession(oldSessionId))
  ipcMain.handle('ProcessService.SpawnChildSession', (_e, parentSessionId: string, options: any) => processService.spawnChildSession(parentSessionId, options))
  ipcMain.handle('ProcessService.SendToChild', (_e, parentSessionId: string, childSessionId: string, message: string) => processService.sendToChild(parentSessionId, childSessionId, message))
  ipcMain.handle('ProcessService.GetChildSessions', (_e, parentSessionId: string) => processService.getChildSessions(parentSessionId))
  ipcMain.handle('ProcessService.ListAllAgents', () => processService.listAllAgents())
  ipcMain.handle('ProcessService.GetAgentsBySession', (_e, sessionId: string) => processService.getAgentsBySession(sessionId))
  ipcMain.handle('ProcessService.CloseChildSession', (_e, parentSessionId: string, childSessionId: string) => processService.closeChildSession(parentSessionId, childSessionId))
  ipcMain.handle('ProcessService.GetResourceStatus', () => processService.getResourceStatus())

  // ==============================================================
  // ProviderService
  // ==============================================================
  ipcMain.handle('ProviderService.GetAll', () => providerService.getAll())
  ipcMain.handle('ProviderService.GetByID', (_e, id: string) => providerService.getById(id))
  ipcMain.handle('ProviderService.Create', (_e, name: string, command: string, adapterType: string) => providerService.create(name, command, adapterType))
  ipcMain.handle('ProviderService.Update', (_e, id: string, updates: any) => providerService.update(id, updates))
  ipcMain.handle('ProviderService.Delete', (_e, id: string) => providerService.delete(id))
  ipcMain.handle('ProviderService.TestExecutable', (_e, id: string, executablePath: string) => providerService.testExecutable(id, executablePath))

  // ==============================================================
  // SettingsService
  // ==============================================================
  ipcMain.handle('SettingsService.GetAll', () => settingsService.getAll())
  ipcMain.handle('SettingsService.Update', (_e, key: string, value: string) => settingsService.update(key, value))
  ipcMain.handle('SettingsService.UpdateBatch', (_e, settings: any) => settingsService.updateBatch(settings))
  ipcMain.handle('SettingsService.GetAutoWorktree', () => settingsService.getAutoWorktree())
  ipcMain.handle('SettingsService.SetAutoWorktree', (_e, enabled: boolean) => settingsService.setAutoWorktree(enabled))
  ipcMain.handle('SettingsService.SetAutoLaunch', (_e, enabled: boolean) => settingsService.setAutoLaunch(enabled))
  ipcMain.handle('SettingsService.GetAutoLaunch', () => settingsService.getAutoLaunch())
  ipcMain.handle('SettingsService.GetProxyEnv', () => settingsService.getProxyEnv())
  ipcMain.handle('SettingsService.SendNotification', (_e, title: string, body: string) => settingsService.sendNotification(title, body))

  // ==============================================================
  // TaskService
  // ==============================================================
  ipcMain.handle('TaskService.GetAll', () => taskService.getAll())
  ipcMain.handle('TaskService.GetByID', (_e, id: string) => taskService.getById(id))
  ipcMain.handle('TaskService.Create', (_e, data: any) => taskService.create(data))
  ipcMain.handle('TaskService.Update', (_e, id: string, data: any) => taskService.update(id, data))
  ipcMain.handle('TaskService.Delete', (_e, id: string) => taskService.delete(id))

  // ==============================================================
  // GitService (full API)
  // ==============================================================
  ipcMain.handle('GitService.IsGitRepo', (_e, p: string) => gitService.isGitRepo(p))
  ipcMain.handle('GitService.GetRepoRoot', (_e, p: string) => gitService.getRepoRoot(p))
  ipcMain.handle('GitService.GetCurrentBranch', (_e, repoPath: string) => gitService.getCurrentBranch(repoPath))
  ipcMain.handle('GitService.GetMainBranch', (_e, repoPath: string) => gitService.getMainBranch(repoPath))
  ipcMain.handle('GitService.GetStatus', (_e, repoPath: string) => gitService.getStatus(repoPath))
  ipcMain.handle('GitService.GetDiff', (_e, repoPath: string, base: string, head: string) => gitService.getDiff(repoPath, base, head))
  ipcMain.handle('GitService.Commit', (_e, repoPath: string, message: string) => gitService.commit(repoPath, message))
  ipcMain.handle('GitService.CreateWorktree', (_e, repoPath: string, branchName: string, taskId: string) => gitService.createWorktree(repoPath, branchName, taskId))
  ipcMain.handle('GitService.RemoveWorktree', (_e, repoPath: string, worktreePath: string, deleteBranch: boolean) => gitService.removeWorktree(repoPath, worktreePath, deleteBranch))
  ipcMain.handle('GitService.ListWorktrees', (_e, repoPath: string) => gitService.listWorktrees(repoPath))
  ipcMain.handle('GitService.CheckMerge', (_e, repoPath: string, worktreeBranch: string, targetBranch: string) => gitService.checkMerge(repoPath, worktreeBranch, targetBranch))
  ipcMain.handle('GitService.MergeWorktree', async (_e, repoPath: string, worktreeBranch: string, targetBranch: string) => {
    const result = await gitService.mergeWorktree(repoPath, worktreeBranch, targetBranch)
    if (result?.success) {
      const sourceRepo = await gitService.getRepoRoot(repoPath).catch(() => normalizeManagedPath(repoPath))
      sessionService.markWorktreeMergedByRepoAndBranch(sourceRepo, worktreeBranch)
    }
    return result
  })

  // ==============================================================
  // PTYService
  // ==============================================================
  ipcMain.handle('PTYService.GetShells', () => ptyService.getShells())
  ipcMain.handle('PTYService.Create', (_e, shell: string, cwd: string) => ptyService.create(shell, cwd))
  ipcMain.handle('PTYService.Write', (_e, id: string, data: string) => ptyService.write(id, data))
  ipcMain.handle('PTYService.Resize', (_e, id: string, cols: number, rows: number) => ptyService.resize(id, cols, rows))
  ipcMain.handle('PTYService.Kill', (_e, id: string) => ptyService.kill(id))

  // ==============================================================
  // LogService
  // ==============================================================
  ipcMain.handle('LogService.GetRecent', (_e, limit: number) => logService.getRecent(limit))
  ipcMain.handle('LogService.GetLogFilePath', () => logService.getLogFilePath())
  ipcMain.handle('LogService.Clear', () => logService.clear())

  // ==============================================================
  // WorkflowService (full API)
  // ==============================================================
  ipcMain.handle('WorkflowService.CreateWorkflow', (_e, name: string, desc: string, defJSON: string) => workflowService.createWorkflow(name, desc, defJSON))
  ipcMain.handle('WorkflowService.GetAllWorkflows', () => workflowService.getAllWorkflows())
  ipcMain.handle('WorkflowService.GetWorkflowByID', (_e, id: string) => workflowService.getWorkflowByID(id))
  ipcMain.handle('WorkflowService.UpdateWorkflow', (_e, id: string, name: string, desc: string, defJSON: string) => workflowService.updateWorkflow(id, name, desc, defJSON))
  ipcMain.handle('WorkflowService.DeleteWorkflow', (_e, id: string) => workflowService.deleteWorkflow(id))
  ipcMain.handle('WorkflowService.StartWorkflow', (_e, wfId: string, varsJSON: string) => workflowService.startWorkflow(wfId, varsJSON))
  ipcMain.handle('WorkflowService.StopWorkflow', (_e, execId: string) => workflowService.stopWorkflow(execId))
  ipcMain.handle('WorkflowService.ApproveStep', (_e, execId: string, stepId: string, approved: boolean) => workflowService.approveStep(execId, stepId, approved))
  ipcMain.handle('WorkflowService.GetWorkflowStatus', (_e, execId: string) => workflowService.getWorkflowStatus(execId))
  ipcMain.handle('WorkflowService.GetActiveWorkflows', () => workflowService.getActiveWorkflows())
  ipcMain.handle('WorkflowService.GetExecutionHistory', (_e, limit: number) => workflowService.getExecutionHistory(limit))

  // ==============================================================
  // MissionService (full API)
  // ==============================================================
  ipcMain.handle('MissionService.CreateMission', (_e, input: any) => missionService.createMission(input))
  ipcMain.handle('MissionService.GetMission', (_e, id: string) => missionService.getMission(id))
  ipcMain.handle('MissionService.ListMissions', () => missionService.listMissions())
  ipcMain.handle('MissionService.DeleteMission', (_e, id: string) => missionService.deleteMission(id))
  ipcMain.handle('MissionService.ConfirmBrainstorm', (_e, id: string, data: any) => missionService.confirmBrainstorm(id, data))
  ipcMain.handle('MissionService.ConfirmTeamDesign', (_e, id: string, data: any) => missionService.confirmTeamDesign(id, data))
  ipcMain.handle('MissionService.ConfirmPhases', (_e, id: string, plan: any) => missionService.confirmPhases(id, plan))
  ipcMain.handle('MissionService.StartMission', (_e, id: string) => missionService.startMission(id))
  ipcMain.handle('MissionService.PauseMission', (_e, id: string) => missionService.pauseMission(id))
  ipcMain.handle('MissionService.ResumeMission', (_e, id: string) => missionService.resumeMission(id))
  ipcMain.handle('MissionService.AbortMission', (_e, id: string) => missionService.abortMission(id))
  ipcMain.handle('MissionService.SkipCurrentPhase', (_e, id: string) => missionService.skipCurrentPhase(id))
  ipcMain.handle('MissionService.UpdatePlan', (_e, id: string, plan: any) => missionService.updatePlan(id, plan))
  ipcMain.handle('MissionService.ListRoleTemplates', () => missionService.listRoleTemplates())
  ipcMain.handle('MissionService.GetRoleTemplate', (_e, id: string) => missionService.getRoleTemplate(id))
  ipcMain.handle('MissionService.GetRoleTemplatesByCategory', (_e, cat: string) => missionService.getRoleTemplatesByCategory(cat))

  // ==============================================================
  // TeamService (full API)
  // ==============================================================
  ipcMain.handle('TeamService.CreateDefinition', (_e, name: string, desc: string, roles: any[]) => teamService.createDefinition(name, desc, roles))
  ipcMain.handle('TeamService.GetDefinition', (_e, id: string) => teamService.getDefinition(id))
  ipcMain.handle('TeamService.ListDefinitions', () => teamService.listDefinitions())
  ipcMain.handle('TeamService.UpdateDefinition', (_e, id: string, name: string, desc: string) => teamService.updateDefinition(id, name, desc))
  ipcMain.handle('TeamService.DeleteDefinition', (_e, id: string) => teamService.deleteDefinition(id))
  ipcMain.handle('TeamService.AddRole', (_e, teamId: string, role: any) => teamService.addRole(teamId, role))
  ipcMain.handle('TeamService.UpdateRole', (_e, roleId: string, role: any) => teamService.updateRole(roleId, role))
  ipcMain.handle('TeamService.DeleteRole', (_e, roleId: string) => teamService.deleteRole(roleId))
  ipcMain.handle('TeamService.StartInstance', (_e, teamId: string, workDir: string, task: string) => teamService.startInstance(teamId, workDir, task))
  ipcMain.handle('TeamService.GetInstance', (_e, id: string) => teamService.getInstance(id))
  ipcMain.handle('TeamService.ListInstances', () => teamService.listInstances())
  ipcMain.handle('TeamService.UpdateInstanceStatus', (_e, id: string, status: string) => teamService.updateInstanceStatus(id, status))
  ipcMain.handle('TeamService.GetMembers', (_e, instId: string) => teamService.getMembers(instId))
  ipcMain.handle('TeamService.UpdateMemberStatus', (_e, memberId: string, status: string) => teamService.updateMemberStatus(memberId, status))
  ipcMain.handle('TeamService.SendMessage', (_e, instId: string, from: string, to: string, content: string, msgType: string) => teamService.sendMessage(instId, from, to, content, msgType))
  ipcMain.handle('TeamService.GetMessages', (_e, instId: string, limit: number) => teamService.getMessages(instId, limit))
  ipcMain.handle('TeamService.CreateTask', (_e, instId: string, title: string, desc: string, taskType: string, assignedTo: string) => teamService.createTask(instId, title, desc, taskType, assignedTo))
  ipcMain.handle('TeamService.GetTasks', (_e, instId: string) => teamService.getTasks(instId))
  ipcMain.handle('TeamService.UpdateTaskStatus', (_e, taskId: string, status: string, completedBy: string) => teamService.updateTaskStatus(taskId, status, completedBy))

  // ==============================================================
  // MCPService (full API)
  // ==============================================================
  ipcMain.handle('MCPService.List', () => mcpService.list())
  ipcMain.handle('MCPService.Get', (_e, id: string) => mcpService.get(id))
  ipcMain.handle('MCPService.Install', (_e, srv: any) => mcpService.install(srv))
  ipcMain.handle('MCPService.Uninstall', (_e, id: string) => mcpService.uninstall(id))
  ipcMain.handle('MCPService.UpdateConfig', (_e, id: string, config: any) => mcpService.updateConfig(id, config))
  ipcMain.handle('MCPService.ToggleEnabled', (_e, id: string, enabled: boolean) => mcpService.toggleEnabled(id, enabled))
  ipcMain.handle('MCPService.GetRuntimeInfo', (_e, id: string) => mcpService.getRuntimeInfo(id))
  ipcMain.handle('MCPService.SeedBuiltins', () => mcpService.seedBuiltins())

  // ==============================================================
  // SkillService (full API)
  // ==============================================================
  ipcMain.handle('SkillService.List', () => skillService.list())
  ipcMain.handle('SkillService.Get', (_e, id: string) => skillService.get(id))
  ipcMain.handle('SkillService.Install', (_e, sk: any) => skillService.install(sk))
  ipcMain.handle('SkillService.Delete', (_e, id: string) => skillService.delete(id))
  ipcMain.handle('SkillService.ToggleEnabled', (_e, id: string, enabled: boolean) => skillService.toggleEnabled(id, enabled))
  ipcMain.handle('SkillService.GetRuntimeInfo', (_e, id: string) => skillService.getRuntimeInfo(id))
  ipcMain.handle('SkillService.SeedBuiltins', () => skillService.seedBuiltins())
  ipcMain.handle('SkillService.Execute', (_e, skillId: string, userInput: string) => skillService.execute(skillId, userInput))
  ipcMain.handle('SkillService.MatchCommand', (_e, input: string) => skillService.matchCommand(input))

  // ==============================================================
  // AuthService
  // ==============================================================
  ipcMain.handle('AuthService.GetState', () => authService.getState())
  ipcMain.handle('AuthService.UpdateState', (_e, state: any) => authService.updateState(state))
  ipcMain.handle('AuthService.ClearState', () => authService.clearState())
  ipcMain.handle('AuthService.CanAccess', (_e, feature: string) => authService.canAccess(feature))
  ipcMain.handle('AuthService.IsAnonymousAllowed', () => authService.isAnonymousAllowed())

  // ==============================================================
  // UpdateService
  // ==============================================================
  ipcMain.handle('UpdateService.Init', () => updateService.init())
  ipcMain.handle('UpdateService.GetState', () => updateService.getState())
  ipcMain.handle('UpdateService.CheckForUpdates', (_e, manual: boolean) => updateService.checkForUpdates(manual))
  ipcMain.handle('UpdateService.OpenDownloadPage', () => updateService.openDownloadPage())

  // ==============================================================
  // SystemSettingsService
  // ==============================================================
  ipcMain.handle('SystemSettingsService.GetConfig', () => systemSettingsService.getConfig())
  ipcMain.handle('SystemSettingsService.GetAll', () => systemSettingsService.getAll())
  ipcMain.handle('SystemSettingsService.Get', (_e, key: string) => systemSettingsService.get(key))
  ipcMain.handle('SystemSettingsService.Update', (_e, key: string, value: string) => systemSettingsService.update(key, value))
  ipcMain.handle('SystemSettingsService.UpdateBatch', (_e, settings: Record<string, string>) => systemSettingsService.updateBatch(settings))
  ipcMain.handle('SystemSettingsService.ValidateConfig', () => systemSettingsService.validateConfig())

  // ==============================================================
  // FeedbackService
  // ==============================================================
  ipcMain.handle('FeedbackService.SubmitGithubIssue', (_e, payload: GithubIssuePayload) => submitGithubIssue(payload))

  // ==============================================================
  // PolicyService
  // ==============================================================
  ipcMain.handle('PolicyService.GetConfig', () => policyService.getConfig())
  ipcMain.handle('PolicyService.UpdateConfig', (_e, config: any) => policyService.updateConfig(config))
  ipcMain.handle('PolicyService.ReloadConfig', () => policyService.reloadConfig())
  ipcMain.handle('PolicyService.CheckToolAllowed', (_e, toolName: string, params: any) => policyService.checkToolAllowed(toolName, params))
  ipcMain.handle('PolicyService.AddBlockedCommand', (_e, cmd: string) => policyService.addBlockedCommand(cmd))
  ipcMain.handle('PolicyService.RemoveBlockedCommand', (_e, cmd: string) => policyService.removeBlockedCommand(cmd))
  ipcMain.handle('PolicyService.AddBlockedPath', (_e, pattern: string) => policyService.addBlockedPath(pattern))
  ipcMain.handle('PolicyService.RemoveBlockedPath', (_e, pattern: string) => policyService.removeBlockedPath(pattern))
  ipcMain.handle('PolicyService.AddDangerousPattern', (_e, toolName: string, pattern: string) => policyService.addDangerousPattern(toolName, pattern))
  ipcMain.handle('PolicyService.GetAuditLog', (_e, limit: number) => policyService.getAuditLog(limit))
  ipcMain.handle('PolicyService.ClearAuditLog', () => policyService.clearAuditLog())
  ipcMain.handle('PolicyService.SetAutoConfirm', (_e, auto: boolean) => policyService.setAutoConfirm(auto))

  // ==============================================================
  // SupervisorService
  // ==============================================================
  ipcMain.handle('SupervisorService.StartSession', (_e, sid: string) => supervisorService.startSession(sid))
  ipcMain.handle('SupervisorService.StopSession', (_e, sid: string) => supervisorService.stopSession(sid))
  ipcMain.handle('SupervisorService.RecordToolCall', (_e, sid: string, tool: string, params: any, ok: boolean, iter: number) => supervisorService.recordToolCall(sid, tool, params, ok, iter))
  ipcMain.handle('SupervisorService.RecordResponse', (_e, sid: string, text: string) => supervisorService.recordResponse(sid, text))
  ipcMain.handle('SupervisorService.RecordTokens', (_e, sid: string, tokens: number) => supervisorService.recordTokens(sid, tokens))
  ipcMain.handle('SupervisorService.RecordConsecutiveToolRounds', (_e, sid: string, rounds: number) => supervisorService.recordConsecutiveToolRounds(sid, rounds))
  ipcMain.handle('SupervisorService.Evaluate', (_e, sid: string, iter: number) => supervisorService.evaluate(sid, iter))
  ipcMain.handle('SupervisorService.CheckBudget', (_e, sid: string) => supervisorService.checkBudget(sid))
  ipcMain.handle('SupervisorService.AssertToolAllowed', (_e, sid: string, tool: string, params: any) => supervisorService.assertToolAllowed(sid, tool, params))
  ipcMain.handle('SupervisorService.GetStatus', (_e, sid: string) => supervisorService.getStatus(sid))
  ipcMain.handle('SupervisorService.GetAllStatuses', () => supervisorService.getAllStatuses())
  ipcMain.handle('SupervisorService.GetEvents', (_e, sid: string) => supervisorService.getEvents(sid))
  ipcMain.handle('SupervisorService.SetEnabled', (_e, sid: string, enabled: boolean) => supervisorService.setEnabled(sid, enabled))
  ipcMain.handle('SupervisorService.SetBudgetConfig', (_e, sid: string, config: any) => supervisorService.setBudgetConfig(sid, config))
  ipcMain.handle('SupervisorService.SetPolicyConfig', (_e, sid: string, config: any) => supervisorService.setPolicyConfig(sid, config))
  ipcMain.handle('SupervisorService.ResetSession', (_e, sid: string) => supervisorService.resetSession(sid))
  ipcMain.handle('SupervisorService.Cleanup', () => supervisorService.cleanup())

  // ==============================================================
  // NotificationService
  // ==============================================================
  ipcMain.handle('NotificationService.UpdateConfig', (_e, enabled: boolean, sound: boolean, dnd: boolean, dndStart: string, dndEnd: string, types: any) =>
    notificationService.updateConfig(enabled, sound, dnd, dndStart, dndEnd, types))
  ipcMain.handle('NotificationService.OnConfirmationNeeded', (_e, sid: string, name: string) => notificationService.onConfirmationNeeded(sid, name))
  ipcMain.handle('NotificationService.OnTaskCompleted', (_e, sid: string, name: string) => notificationService.onTaskCompleted(sid, name))
  ipcMain.handle('NotificationService.OnError', (_e, sid: string, name: string, err: string) => notificationService.onError(sid, name, err))
  ipcMain.handle('NotificationService.OnSessionStuck', (_e, sid: string, name: string) => notificationService.onSessionStuck(sid, name))
  ipcMain.handle('NotificationService.Acknowledge', (_e, sid: string, ntype: string) => notificationService.acknowledge(sid, ntype))

  // ==============================================================
  // StickerService
  // ==============================================================
  ipcMain.handle('StickerService.Initialize', () => stickerService.initialize())
  ipcMain.handle('StickerService.Search', (_e, query: string, category: string, limit: number) => stickerService.search(query, category, limit))
  ipcMain.handle('StickerService.SearchByMood', (_e, mood: string, limit: number) => stickerService.searchByMood(mood, limit))
  ipcMain.handle('StickerService.GetCategories', () => stickerService.getCategories())
  ipcMain.handle('StickerService.GetMoods', () => stickerService.getMoods())
  ipcMain.handle('StickerService.GetStatus', () => stickerService.getStatus())
  ipcMain.handle('StickerService.DownloadAndCache', (_e, url: string) => stickerService.downloadAndCache(url))
  ipcMain.handle('StickerService.RefreshIndex', () => stickerService.refreshIndex())
  ipcMain.handle('StickerService.ClearCache', () => stickerService.clearCache())

  // ==============================================================
  // SuggestionService
  // ==============================================================
  ipcMain.handle('SuggestionService.Start', () => suggestionService.start())
  ipcMain.handle('SuggestionService.Stop', () => suggestionService.stop())
  ipcMain.handle('SuggestionService.OnActivity', (_e, sid: string, actType: string, detail: string) => suggestionService.onActivity(sid, actType, detail))
  ipcMain.handle('SuggestionService.UpdateSessionInfo', (_e, sid: string, name: string, status: string, workDir: string) => suggestionService.updateSessionInfo(sid, name, status, workDir))
  ipcMain.handle('SuggestionService.Dismiss', (_e, suggestionId: string) => suggestionService.dismiss(suggestionId))
  ipcMain.handle('SuggestionService.GetActiveSuggestion', () => suggestionService.getActiveSuggestion())

  // ==============================================================
  // ProactiveService
  // ==============================================================
  ipcMain.handle('ProactiveService.GetConfig', () => proactiveService.getConfig())
  ipcMain.handle('ProactiveService.SetConfig', (_e, config: any) => proactiveService.setConfig(config))
  ipcMain.handle('ProactiveService.GetStatus', () => proactiveService.getStatus())
  ipcMain.handle('ProactiveService.GetRecords', (_e, limit: number) => proactiveService.getRecords(limit))
  ipcMain.handle('ProactiveService.Heartbeat', () => proactiveService.heartbeat())
  ipcMain.handle('ProactiveService.ProcessUserResponse', (_e, text: string, delay: number) => proactiveService.processUserResponse(text, delay))
  ipcMain.handle('ProactiveService.SetEnabled', (_e, enabled: boolean) => proactiveService.setEnabled(enabled))
  ipcMain.handle('ProactiveService.Start', () => proactiveService.start())
  ipcMain.handle('ProactiveService.Stop', () => proactiveService.stop())
  ipcMain.handle('ProactiveService.UpdateUserInteraction', () => proactiveService.updateUserInteraction())

  // ==============================================================
  // QueueService
  // ==============================================================
  ipcMain.handle('QueueService.Enqueue', (_e, name: string, taskType: string, payload: any) => queueService.enqueue(name, taskType, payload))
  ipcMain.handle('QueueService.GetByID', (_e, id: string) => queueService.getById(id))
  ipcMain.handle('QueueService.List', (_e, status: string, limit: number) => queueService.list(status, limit))
  ipcMain.handle('QueueService.ClaimNext', (_e, workerId: string) => queueService.claimNext(workerId))
  ipcMain.handle('QueueService.Complete', (_e, id: string, status: any, lastError: string) => queueService.complete(id, status, lastError))
  ipcMain.handle('QueueService.Retry', (_e, id: string, lastError: string) => queueService.retry(id, lastError))

  // ==============================================================
  // FileTransferService
  // ==============================================================
  ipcMain.handle('FileTransferService.PrepareFile', (_e, filePath: string) => fileTransferService.prepareFile(filePath))
  ipcMain.handle('FileTransferService.ValidatePlatformLimit', (_e, file: any, platform: string) => fileTransferService.validatePlatformLimit(file, platform))
  ipcMain.handle('FileTransferService.SaveClipboardImage', (_e, base64: string, mime: string) => fileTransferService.saveClipboardImage(base64, mime))
  ipcMain.handle('FileTransferService.SaveDroppedFile', (_e, filename: string, base64: string) => fileTransferService.saveDroppedFile(filename, base64))

  // ==============================================================
  // TrackerService
  // ==============================================================
  ipcMain.handle('TrackerService.OnSessionStateChange', (_e, sid: string, status: string, workDir: string) => trackerService.onSessionStateChange(sid, status, workDir))
  ipcMain.handle('TrackerService.GetSessionChanges', (_e, sid: string) => trackerService.getSessionChanges(sid))
  ipcMain.handle('TrackerService.RecordWorktreeChanges', (_e, sid: string, mainRepo: string, files: string[]) => trackerService.recordWorktreeChanges(sid, mainRepo, files))
  ipcMain.handle('TrackerService.HandleFsChange', (_e, watchedDir: string, filename: string) => trackerService.handleFsChange(watchedDir, filename))
  ipcMain.handle('TrackerService.RemoveSession', (_e, sid: string) => trackerService.removeSession(sid))
  ipcMain.handle('TrackerService.UpdateSessionActivity', (_e, sid: string) => trackerService.updateSessionActivity(sid))
  ipcMain.handle('TrackerService.FindSessionIDByWorkingDir', (_e, dir: string) => trackerService.findSessionIDByWorkingDir(dir))

  // FileChangeTracker.* aliases (frontend bindings use this prefix)
  ipcMain.handle('FileChangeTracker.OnSessionStateChange', (_e, sid: string, status: string, workDir: string) => trackerService.onSessionStateChange(sid, status, workDir))
  ipcMain.handle('FileChangeTracker.GetSessionChanges', (_e, sid: string) => trackerService.getSessionChanges(sid))
  ipcMain.handle('FileChangeTracker.RecordWorktreeChanges', (_e, sid: string, mainRepo: string, files: string[]) => trackerService.recordWorktreeChanges(sid, mainRepo, files))
  ipcMain.handle('FileChangeTracker.HandleFsChange', (_e, watchedDir: string, filename: string) => trackerService.handleFsChange(watchedDir, filename))
  ipcMain.handle('FileChangeTracker.RemoveSession', (_e, sid: string) => trackerService.removeSession(sid))
  ipcMain.handle('FileChangeTracker.UpdateSessionActivity', (_e, sid: string) => trackerService.updateSessionActivity(sid))
  ipcMain.handle('FileChangeTracker.FindSessionIDByWorkingDir', (_e, dir: string) => trackerService.findSessionIDByWorkingDir(dir))
  ipcMain.handle('FileChangeTracker.Destroy', () => { /* no-op */ })
  ipcMain.handle('FileChangeTracker.OnFilesUpdated', () => { /* event subscription - no-op */ })

  // ==============================================================
  // UsageService
  // ==============================================================
  ipcMain.handle('UsageService.GetSummary', () => usageService.getSummary())
  ipcMain.handle('UsageService.GetHistory', (_e, days: number) => usageService.getHistory(days))
  ipcMain.handle('UsageService.GetSessionMessages', (_e, sessionId: string) => usageService.getSessionMessages(sessionId))

  // ==============================================================
  // BotService
  // ==============================================================
  ipcMain.handle('BotService.List', () => botService.list())
  ipcMain.handle('BotService.GetCatalog', () => botService.getCatalog())
  ipcMain.handle('BotService.Create', (_e, bot: any) => botService.create(bot))
  ipcMain.handle('BotService.Update', (_e, botId: string, bot: any) => botService.update(botId, bot))
  ipcMain.handle('BotService.Delete', (_e, botId: string) => botService.delete(botId))
  ipcMain.handle('BotService.Toggle', (_e, botId: string, enabled: boolean) => botService.toggle(botId, enabled))
  ipcMain.handle('BotService.TestPush', (_e, botId: string) => botPushService.testPush(botId))

  // ==============================================================
  // TelegramService
  // ==============================================================
  ipcMain.handle('TelegramService.Start', () => telegramService.start())
  ipcMain.handle('TelegramService.Stop', () => telegramService.stop())
  ipcMain.handle('TelegramService.Reload', () => telegramService.reload())
  ipcMain.handle('TelegramService.Restart', () => telegramService.restart())
  ipcMain.handle('TelegramService.Status', () => telegramService.status())
  ipcMain.handle('TelegramService.GetConfig', () => telegramService.getConfig())
  ipcMain.handle('TelegramService.UpdateConfig', (_e, key: string, value: any) => telegramService.updateConfig(key, value))
  ipcMain.handle('TelegramService.GetAllowedUsers', () => telegramService.getAllowedUsers())
  ipcMain.handle('TelegramService.AddAllowedUser', (_e, uid: string, uname: string, role: string) => telegramService.addAllowedUser(uid, uname, role))
  ipcMain.handle('TelegramService.RemoveAllowedUser', (_e, uid: string) => telegramService.removeAllowedUser(uid))
  ipcMain.handle('TelegramService.GetAIProviders', () => telegramService.getAIProviders())
  ipcMain.handle('TelegramService.AddAIProvider', (_e, name: string, apiKey: string, model: string) => telegramService.addAIProvider(name, apiKey, model))
  ipcMain.handle('TelegramService.UpdateAIProvider', (_e, id: string, updates: any) => telegramService.updateAIProvider(id, updates))
  ipcMain.handle('TelegramService.DeleteAIProvider', (_e, id: string) => telegramService.deleteAIProvider(id))

  // ==============================================================
  // QQBotService
  // ==============================================================
  ipcMain.handle('QQBotService.Start', () => qqBotService.start())
  ipcMain.handle('QQBotService.Stop', () => qqBotService.stop())
  ipcMain.handle('QQBotService.Reload', () => qqBotService.reload())
  ipcMain.handle('QQBotService.Restart', () => qqBotService.restart())
  ipcMain.handle('QQBotService.Status', () => qqBotService.status())
  ipcMain.handle('QQBotService.GetConfig', () => qqBotService.getConfig())
  ipcMain.handle('QQBotService.UpdateConfig', (_e, key: string, value: any) => qqBotService.updateConfig(key, value))
  ipcMain.handle('QQBotService.GetAllowedUsers', () => qqBotService.getAllowedUsers())
  ipcMain.handle('QQBotService.AddAllowedUser', (_e, uid: string, nick: string, role: string) => qqBotService.addAllowedUser(uid, nick, role))
  ipcMain.handle('QQBotService.RemoveAllowedUser', (_e, uid: string) => qqBotService.removeAllowedUser(uid))
  ipcMain.handle('QQBotService.GetAllowedGroups', () => qqBotService.getAllowedGroups())
  ipcMain.handle('QQBotService.AddAllowedGroup', (_e, gid: string, gname: string, role: string) => qqBotService.addAllowedGroup(gid, gname, role))
  ipcMain.handle('QQBotService.RemoveAllowedGroup', (_e, gid: string) => qqBotService.removeAllowedGroup(gid))

  // ==============================================================
  // QQOfficialService
  // ==============================================================
  ipcMain.handle('QQOfficialService.Start', () => qqOfficialService.start())
  ipcMain.handle('QQOfficialService.Stop', () => qqOfficialService.stop())
  ipcMain.handle('QQOfficialService.Reload', () => qqOfficialService.reload())
  ipcMain.handle('QQOfficialService.Restart', () => qqOfficialService.restart())
  ipcMain.handle('QQOfficialService.Status', () => qqOfficialService.status())
  ipcMain.handle('QQOfficialService.GetConfig', () => qqOfficialService.getConfig())
  ipcMain.handle('QQOfficialService.UpdateConfig', (_e, key: string, value: any) => qqOfficialService.updateConfig(key, value))

  // ==============================================================
  // WorkspaceService
  // ==============================================================
  ipcMain.handle('WorkspaceService.List', () => workspaceService.list())
  ipcMain.handle('WorkspaceService.Create', (_e, data: any) => workspaceService.create(data))
  ipcMain.handle('WorkspaceService.Update', (_e, id: string, data: any) => workspaceService.update(id, data))
  ipcMain.handle('WorkspaceService.Delete', (_e, id: string) => workspaceService.delete(id))
  ipcMain.handle('WorkspaceService.ScanRepos', (_e, dir: string) => workspaceService.scanRepos(dir))
  ipcMain.handle('WorkspaceService.ImportVscode', (_e, filePath: string) => workspaceService.importVscode(filePath))
  ipcMain.handle('WorkspaceService.IsGitRepo', (_e, dir: string) => workspaceService.isGitRepo(dir))

  // ==============================================================
  // QuickOpen - file fuzzy search
  // ==============================================================
  ipcMain.handle('QuickOpen.Search', (_e, rootDir: string, query: string) => {
    if (!rootDir || !query.trim()) return []
    try {
      // Try git ls-files first (faster, respects .gitignore)
      const stdout = execSync('git ls-files --cached --others --exclude-standard', {
        cwd: rootDir,
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024,
      })
      const files = stdout.split('\n').filter(Boolean)
      const lowerQuery = query.toLowerCase()
      const matched = files
        .filter((f) => {
          const name = f.split('/').pop() || f
          return name.toLowerCase().includes(lowerQuery)
        })
        .slice(0, 50)
        .map((f) => ({
          path: path.join(rootDir, f).replace(/\\/g, '/'),
          name: f.split('/').pop() || f,
          dir: f.split('/').slice(0, -1).join('/') || '.',
        }))
      return matched
    } catch {
      return []
    }
  })

  ipcMain.handle('QuickOpen.OpenFile', (_e, filePath: string) => {
    if (filePath) shell.openPath(filePath)
  })

  return { botPushService, processService }
}

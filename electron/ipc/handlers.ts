/**
 * IPC Handlers - routes all renderer IPC calls to the appropriate service
 *
 * Each ipcMain.handle(channel, ...) maps to a service method.
 */

import { ipcMain, BrowserWindow } from 'electron'
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
import { LogService } from '../services/log.js'

// Expanded services
import { WorkflowService } from '../services/workflow.js'
import { MissionService } from '../services/mission.js'
import { TeamService } from '../services/team.js'
import { MCPService } from '../services/mcp.js'
import { SkillService } from '../services/skill.js'

// New services
import { UpdateService } from '../services/update.js'
import { SystemSettingsService } from '../services/system-settings.js'
import { StickerService } from '../services/sticker.js'
import { FileTransferService } from '../services/file-transfer.js'
import { TrackerService } from '../services/tracker.js'
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
): { processService: ProcessService } {
  // ---- Initialize ALL services ----
  const sessionService = new SessionService(db)
  const providerService = new ProviderService(db)
  const settingsService = new SettingsService(db)
  const mcpService = new MCPService(db)
  const skillService = new SkillService(db)
  const processService = new ProcessService(
    db,
    sessionService,
    providerService,
    settingsService,
    mcpService,
    skillService,
    bridgeManager,
    getWindow,
  )
  const taskService = new TaskService(db)
  const gitService = new GitService()
  const logService = new LogService()
  const workflowService = new WorkflowService(db)
  const missionService = new MissionService(db)
  const teamService = new TeamService(db)
  const updateService = new UpdateService()
  const systemSettingsService = new SystemSettingsService(db)
  const stickerService = new StickerService()
  const fileTransferService = new FileTransferService()
  const trackerService = new TrackerService(getWindow, db)
  const workspaceService = new WorkspaceService(db)

  // Initialize async services
  stickerService.initialize().catch(() => {})
  updateService.init()

  // Purge any previously seeded built-in MCP/skills; catalogs are no longer shipped
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

  // ==============================================================
  // SessionService
  // ==============================================================
  ipcMain.handle('SessionService.GetAll', () => sessionService.getAll())
  ipcMain.handle('SessionService.GetByID', (_e, id: string) => sessionService.getById(id))
  ipcMain.handle('SessionService.Create', (_e, config: any) => sessionService.create(config))
  ipcMain.handle('SessionService.Delete', async (_e, id: string) => {
    // True teardown: destroy adapter + remove software-prompt files (not stop-only)
    await processService.disposeSession(id).catch(() => {})
    // Also dispose any child sessions still tracked (DB cascade deletes rows next)
    for (const child of processService.getChildSessions(id)) {
      await processService.disposeSession(child.id).catch(() => {})
    }
    sessionService.delete(id)
  })
  ipcMain.handle('SessionService.End', async (_e, id: string) => {
    await processService.disposeSession(id).catch(() => {})
    sessionService.end(id)
  })
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
  ipcMain.handle('ProcessService.StopProcess', (_e, sessionId: string) => processService.stopProcess(sessionId))
  // Provider-neutral permission response for ACP (and future adapters).
  ipcMain.handle('agent:permission:respond', (_e, payload: { sessionId: string; requestId: string; optionId: string }) =>
    processService.respondToPermission(payload))
  ipcMain.handle('ProcessService.ResumeSession', (_e, oldSessionId: string) => processService.resumeSession(oldSessionId))
  ipcMain.handle('ProcessService.SpawnChildSession', (_e, parentSessionId: string, options: any) => processService.spawnChildSession(parentSessionId, options))
  ipcMain.handle('ProcessService.SendToChild', (_e, parentSessionId: string, childSessionId: string, message: string) => processService.sendToChild(parentSessionId, childSessionId, message))
  ipcMain.handle('ProcessService.ListAllAgents', () => processService.listAllAgents())
  // Explicit user/UI close of a persistent child (same path as agent-control close_agent).
  ipcMain.handle('ProcessService.CloseChildSession', (_e, parentSessionId: string, childSessionId: string) =>
    processService.closeChildSession(parentSessionId, childSessionId))
  // IsStreaming / GetChildSessions / GetAgentsBySession / GetResourceStatus: in-process only

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
  ipcMain.handle('GitService.EnsureRepo', (_e, p: string) => gitService.ensureRepo(p))
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
  ipcMain.handle('MissionService.ListRoleTemplates', () => missionService.listRoleTemplates())

  // ==============================================================
  // TeamService (wired API only)
  // ==============================================================
  ipcMain.handle('TeamService.CreateDefinition', (_e, name: string, desc: string, roles: any[]) => teamService.createDefinition(name, desc, roles))
  ipcMain.handle('TeamService.ListDefinitions', () => teamService.listDefinitions())
  ipcMain.handle('TeamService.UpdateDefinition', (_e, id: string, name: string, desc: string) => teamService.updateDefinition(id, name, desc))
  ipcMain.handle('TeamService.DeleteDefinition', (_e, id: string) => teamService.deleteDefinition(id))
  ipcMain.handle('TeamService.AddRole', (_e, teamId: string, role: any) => teamService.addRole(teamId, role))
  ipcMain.handle('TeamService.UpdateRole', (_e, roleId: string, role: any) => teamService.updateRole(roleId, role))
  ipcMain.handle('TeamService.DeleteRole', (_e, roleId: string) => teamService.deleteRole(roleId))
  ipcMain.handle('TeamService.StartInstance', (_e, teamId: string, workDir: string, task: string) => teamService.startInstance(teamId, workDir, task))
  ipcMain.handle('TeamService.ListInstances', () => teamService.listInstances())
  ipcMain.handle('TeamService.GetMessages', (_e, instId: string, limit: number) => teamService.getMessages(instId, limit))
  ipcMain.handle('TeamService.GetTasks', (_e, instId: string) => teamService.getTasks(instId))

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

  // ==============================================================
  // SkillService (full API)
  // ==============================================================
  ipcMain.handle('SkillService.List', () => skillService.list())
  ipcMain.handle('SkillService.Get', (_e, id: string) => skillService.get(id))
  ipcMain.handle('SkillService.Install', (_e, sk: any) => skillService.install(sk))
  ipcMain.handle('SkillService.Delete', (_e, id: string) => skillService.delete(id))
  ipcMain.handle('SkillService.ToggleEnabled', (_e, id: string, enabled: boolean) => skillService.toggleEnabled(id, enabled))
  ipcMain.handle('SkillService.GetRuntimeInfo', (_e, id: string) => skillService.getRuntimeInfo(id))
  // Execute / MatchCommand / SeedBuiltins: used in-process (process + startup purge), not via renderer IPC

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
  // FileTransferService
  // ==============================================================
  ipcMain.handle('FileTransferService.PrepareFile', (_e, filePath: string) => fileTransferService.prepareFile(filePath))
  ipcMain.handle('FileTransferService.ValidatePlatformLimit', (_e, file: any, platform: string) => fileTransferService.validatePlatformLimit(file, platform))
  ipcMain.handle('FileTransferService.SaveClipboardImage', (_e, base64: string, mime: string) => fileTransferService.saveClipboardImage(base64, mime))
  ipcMain.handle('FileTransferService.SaveDroppedFile', (_e, filename: string, base64: string) => fileTransferService.saveDroppedFile(filename, base64))

  // ==============================================================
  // FileChangeTracker (frontend TrackerService binding uses this prefix)
  // ==============================================================
  ipcMain.handle('FileChangeTracker.OnSessionStateChange', (_e, sid: string, status: string, workDir: string) => trackerService.onSessionStateChange(sid, status, workDir))
  ipcMain.handle('FileChangeTracker.GetSessionChanges', (_e, sid: string) => trackerService.getSessionChanges(sid))
  ipcMain.handle('FileChangeTracker.RecordWorktreeChanges', (_e, sid: string, mainRepo: string, files: string[]) => trackerService.recordWorktreeChanges(sid, mainRepo, files))
  ipcMain.handle('FileChangeTracker.HandleFsChange', (_e, watchedDir: string, filename: string) => trackerService.handleFsChange(watchedDir, filename))
  ipcMain.handle('FileChangeTracker.RemoveSession', (_e, sid: string) => trackerService.removeSession(sid))
  ipcMain.handle('FileChangeTracker.UpdateSessionActivity', (_e, sid: string) => trackerService.updateSessionActivity(sid))
  ipcMain.handle('FileChangeTracker.FindSessionIDByWorkingDir', (_e, dir: string) => trackerService.findSessionIDByWorkingDir(dir))

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

  return { processService }
}

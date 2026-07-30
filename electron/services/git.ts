/**
 * GitService - Comprehensive Git operations
 * Replaces Go internal/services/git.go
 * Full API matching frontend/bindings/allbeingsfuture/internal/services/gitservice.ts
 */

import { execFile } from 'node:child_process'
import { access, constants, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { detectGitCmdPath } from '../bridge/runtime.js'

const execFileAsync = promisify(execFile)

let resolvedGitPath = ''

function getGitExecutable(): string {
  if (resolvedGitPath) return resolvedGitPath

  if (process.platform === 'win32') {
    const cmdDir = detectGitCmdPath()
    if (cmdDir) {
      resolvedGitPath = path.join(cmdDir, 'git.exe')
      return resolvedGitPath
    }
  }

  resolvedGitPath = 'git'
  return resolvedGitPath
}

function normalizeFilePath(target: string): string {
  if (!target) return ''
  return path.resolve(target).replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * True only for ABF-managed worktrees under the repo's isolation root.
 * Parent main checkout / arbitrary dirs are never safe to force-remove.
 */
export function isManagedAbfWorktreePath(sourceRepo: string, worktreePath: string): boolean {
  const repoRoot = normalizeFilePath(sourceRepo)
  const candidate = normalizeFilePath(worktreePath)
  if (!repoRoot || !candidate) return false
  return candidate.startsWith(`${repoRoot}/.allbeingsfuture-worktrees/`)
    || candidate.startsWith(`${repoRoot}/.abf-worktrees/`)
}

/**
 * ABF session / child-agent isolation branches (`worktree-*`).
 * These exist only for local worktree isolation and must never be published to origin
 * (pushing them creates remote branches that look like accidental PRs).
 */
export function isAbfIsolationBranch(branch: string): boolean {
  const name = (branch || '').replace(/^refs\/heads\//, '').trim()
  return name.startsWith('worktree-')
}

export class GitService {
  private async getWorktreeBranch(repoPath: string, worktreePath: string): Promise<string> {
    const normalizedWorktreePath = normalizeFilePath(worktreePath)
    const worktree = (await this.listWorktrees(repoPath))
      .find(item => normalizeFilePath(item.path) === normalizedWorktreePath)
    return worktree?.branch || ''
  }

  /**
   * If an isolation branch was mistakenly pushed to origin, delete it.
   * No-op for non-isolation branches or when remote ref is absent.
   */
  private async deleteRemoteIsolationBranch(repoPath: string, branch: string): Promise<string | null> {
    if (!isAbfIsolationBranch(branch)) return null
    const remoteHeads = await this.git(['ls-remote', '--heads', 'origin', branch], repoPath).catch(() => '')
    if (!remoteHeads.trim()) return null
    try {
      await this.git(['push', 'origin', '--delete', branch], repoPath)
      return `已删除远端隔离分支 origin/${branch}`
    } catch (err: any) {
      const detail = err?.stderr || err?.message || String(err)
      return `删除远端隔离分支 origin/${branch} 失败: ${detail}`
    }
  }

  private async git(args: string[], cwd: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(getGitExecutable(), args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      })
      return stdout.trim()
    } catch (err: any) {
      throw new Error(`git ${args[0]} failed: ${err.stderr || err.message}`)
    }
  }

  async isGitRepo(dirPath: string): Promise<boolean> {
    try {
      await this.git(['rev-parse', '--is-inside-work-tree'], dirPath)
      return true
    } catch {
      return false
    }
  }

  async getRepoRoot(dirPath: string): Promise<string> {
    return this.getPrimaryRepoPath(dirPath)
  }

  /**
   * 确保目录是 Git 仓库：已是仓库则返回主仓库根路径；
   * 否则在该目录 git init，并创建首个提交（worktree 需要 HEAD）。
   */
  async ensureRepo(dirPath: string): Promise<string> {
    const normalized = normalizeFilePath(dirPath)
    if (!normalized) throw new Error('目录路径为空')

    try {
      await access(normalized, constants.F_OK)
    } catch {
      throw new Error(`目录不存在: ${normalized}`)
    }

    const existing = await this.getRepoRoot(normalized).catch(() => '')
    if (existing) return existing

    await this.git(['init', '-b', 'main'], normalized)

    const hasHead = await this.git(['rev-parse', '--verify', 'HEAD'], normalized)
      .then(() => true)
      .catch(() => false)

    if (!hasHead) {
      // 尽量纳入现有文件；无文件时用空提交保证后续 worktree 可用
      await this.git(['add', '-A'], normalized).catch(() => {})
      try {
        await this.git([
          '-c', 'user.email=allbeingsfuture@local',
          '-c', 'user.name=AllBeingsFuture',
          'commit',
          '--allow-empty',
          '-m',
          'chore: initialize repository for worktree isolation',
        ], normalized)
      } catch (err: any) {
        throw new Error(`初始化 Git 仓库后创建首个提交失败: ${err?.message || String(err)}`)
      }
    }

    return this.getPrimaryRepoPath(normalized)
  }

  private async getPrimaryRepoPath(dirPath: string): Promise<string> {
    const worktreeRoot = normalizeFilePath(await this.git(['rev-parse', '--show-toplevel'], dirPath))
    const commonDirRaw = await this.git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dirPath).catch(() => '')
    if (!commonDirRaw) return worktreeRoot

    const commonDir = normalizeFilePath(path.isAbsolute(commonDirRaw) ? commonDirRaw : path.resolve(worktreeRoot, commonDirRaw))
    if (path.basename(commonDir).toLowerCase() !== '.git') {
      return worktreeRoot
    }

    return normalizeFilePath(path.dirname(commonDir))
  }

  async getCurrentBranch(repoPath: string): Promise<string> {
    return this.git(['branch', '--show-current'], repoPath).catch(() => 'HEAD')
  }

  /** Resolve a commit-ish (default HEAD) in the given worktree/repo path. */
  async revParse(repoPath: string, rev = 'HEAD'): Promise<string> {
    return this.git(['rev-parse', rev], repoPath)
  }

  async getMainBranch(repoPath: string): Promise<string> {
    for (const name of ['main', 'master']) {
      try {
        await this.git(['rev-parse', '--verify', name], repoPath)
        return name
      } catch {}
    }
    return this.getCurrentBranch(repoPath)
  }

  async getStatus(repoPath: string): Promise<any> {
    const branch = await this.getCurrentBranch(repoPath).catch(() => 'unknown')
    const statusRaw = await this.git(['status', '--porcelain', '-u'], repoPath).catch(() => '')
    const staged: string[] = []
    const unstaged: string[] = []
    const untracked: string[] = []

    for (const line of statusRaw.split('\n').filter(Boolean)) {
      if (line.length < 3) continue

      const state = line.slice(0, 2)
      const filePath = line.slice(3).trim()
      if (!filePath || state === '!!') continue

      if (state === '??') {
        untracked.push(filePath)
        continue
      }

      if (state[0] && state[0] !== ' ') staged.push(filePath)
      if (state[1] && state[1] !== ' ') unstaged.push(filePath)
    }

    const aheadBehindRaw = await this.git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], repoPath).catch(() => '')
    const [aheadRaw = '0', behindRaw = '0'] = aheadBehindRaw.trim().split(/\s+/)

    return {
      staged,
      unstaged,
      untracked,
      branch,
      ahead: parseInt(aheadRaw, 10) || 0,
      behind: parseInt(behindRaw, 10) || 0,
    }
  }

  async getDiff(repoPath: string, base: string, head: string): Promise<string> {
    if (base && head) {
      return this.git(['diff', `${base}...${head}`], repoPath).catch(() => '')
    }
    return this.git(['diff'], repoPath).catch(() => '')
  }

  async commit(repoPath: string, message: string): Promise<string> {
    await this.git(['add', '-A'], repoPath)
    await this.git(['commit', '-m', message], repoPath)
    return this.git(['rev-parse', 'HEAD'], repoPath)
  }

  /**
   * Create an isolated worktree under .allbeingsfuture-worktrees.
   * @param startPoint Optional commit-ish (parent branch/HEAD) so nested children
   *   inherit the direct parent's committed state instead of the main-repo HEAD.
   */
  async createWorktree(
    repoPath: string,
    branchName: string,
    taskId?: string,
    startPoint?: string,
  ): Promise<any> {
    const baseRepoPath = await this.getPrimaryRepoPath(repoPath)
    const safeName = branchName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || `session-${Date.now()}`
    const worktreePath = path.join(baseRepoPath, '.allbeingsfuture-worktrees', safeName).replace(/\\/g, '/')
    const branch = `worktree-${safeName}`

    await this.git(['worktree', 'prune'], baseRepoPath).catch(() => {})
    await mkdir(path.dirname(worktreePath), { recursive: true })
    const start = (startPoint || '').trim()
    if (start) {
      await this.git(['worktree', 'add', worktreePath, '-b', branch, start], baseRepoPath)
    } else {
      await this.git(['worktree', 'add', worktreePath, '-b', branch], baseRepoPath)
    }
    const baseCommit = await this.git(['rev-parse', 'HEAD'], worktreePath)
    const baseBranch = start || await this.getCurrentBranch(baseRepoPath)

    return { worktreePath, branch, baseCommit, baseBranch, taskId: taskId || '' }
  }

  async removeWorktree(repoPath: string, worktreePath: string, deleteBranch: boolean = true, branchName?: string): Promise<void> {
    const normalizedWorktreePath = worktreePath ? normalizeFilePath(worktreePath) : ''
    // Empty path: no-op (callers may pass optional/missing worktree).
    if (!normalizedWorktreePath) return

    const baseRepoPath = await this.getPrimaryRepoPath(repoPath).catch(() => normalizeFilePath(repoPath))
    const repoRoot = normalizeFilePath(baseRepoPath)

    if (!repoRoot) {
      throw new Error('removeWorktree refused: empty repository path')
    }
    if (normalizedWorktreePath === repoRoot) {
      throw new Error(`removeWorktree refused: path is the main repository checkout (${normalizedWorktreePath})`)
    }
    if (!isManagedAbfWorktreePath(repoRoot, normalizedWorktreePath)) {
      throw new Error(
        `removeWorktree refused: path is not an ABF-managed worktree under ${repoRoot}/.allbeingsfuture-worktrees or .abf-worktrees: ${normalizedWorktreePath}`,
      )
    }

    const branchToDelete = deleteBranch
      ? (branchName || await this.getWorktreeBranch(baseRepoPath, normalizedWorktreePath).catch(() => '') || `worktree-${path.basename(normalizedWorktreePath)}`)
      : ''

    try {
      await this.git(['worktree', 'remove', normalizedWorktreePath, '--force'], baseRepoPath)
    } catch (removeErr: any) {
      // Fallback rm only after managed-path gate passed above.
      try {
        await rm(normalizedWorktreePath, { recursive: true, force: true })
      } catch (fsErr: any) {
        const removeMessage = removeErr?.stderr || removeErr?.message || String(removeErr)
        const fsMessage = fsErr?.message || String(fsErr)
        throw new Error(`删除 Worktree 失败: ${removeMessage}; 回退删除目录也失败: ${fsMessage}`)
      }
    }

    await this.git(['worktree', 'prune'], baseRepoPath).catch(() => {})

    if (deleteBranch && branchToDelete) {
      await this.git(['branch', '-D', branchToDelete], baseRepoPath).catch(() => {})
      // Safety net: agents sometimes push worktree-* isolation branches to origin.
      await this.deleteRemoteIsolationBranch(baseRepoPath, branchToDelete)
    }
  }

  async listWorktrees(repoPath: string): Promise<any[]> {
    const baseRepoPath = await this.getPrimaryRepoPath(repoPath)
    await this.git(['worktree', 'prune'], baseRepoPath).catch(() => {})
    const output = await this.git(['worktree', 'list', '--porcelain'], baseRepoPath).catch(() => '')
    if (!output) return []

    const repoRoot = normalizeFilePath(baseRepoPath)
    const worktrees: any[] = []
    let current: any = {}

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current)
        current = { path: line.slice(9) }
      } else if (line.startsWith('HEAD ')) {
        current.headCommit = line.slice(5)
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '')
      } else if (line.startsWith('prunable ')) {
        current.prunable = true
      } else if (line === 'bare') {
        current.bare = true
      } else if (line === 'detached') {
        current.detached = true
      }
    }
    if (current.path) worktrees.push(current)
    return worktrees
      .filter(worktree => !worktree.prunable)
      .map((worktree) => ({
      path: normalizeFilePath(worktree.path),
      branch: worktree.branch || '',
      headCommit: worktree.headCommit || '',
      isMain: normalizeFilePath(worktree.path) === repoRoot,
      }))
  }

  async checkMerge(repoPath: string, worktreeBranch: string, targetBranch: string): Promise<any> {
    const baseRepoPath = await this.getPrimaryRepoPath(repoPath)
    try {
      const mergeBase = await this.git(['merge-base', targetBranch, worktreeBranch], baseRepoPath)
      const diff = await this.git(['diff', '--stat', `${mergeBase}..${worktreeBranch}`], baseRepoPath).catch(() => '')
      const message = diff
        ? `可以将 ${worktreeBranch} 合并到 ${targetBranch}`
        : `${worktreeBranch} 与 ${targetBranch} 没有待合并差异`

      return {
        success: true,
        mergedBranch: worktreeBranch,
        targetBranch,
        hasConflicts: false,
        conflictFiles: [],
        autoResolved: false,
        message,
      }
    } catch (err: any) {
      return {
        success: false,
        mergedBranch: worktreeBranch,
        targetBranch,
        hasConflicts: true,
        conflictFiles: [],
        autoResolved: false,
        message: err.message || '合并检查失败',
      }
    }
  }

  async mergeWorktree(repoPath: string, worktreeBranch: string, targetBranch: string): Promise<any> {
    const baseRepoPath = await this.getPrimaryRepoPath(repoPath)
    const worktree = (await this.listWorktrees(baseRepoPath).catch(() => []))
      .find(item => item.branch === worktreeBranch && !item.isMain)
    const currentBranch = await this.getCurrentBranch(baseRepoPath)
    if (currentBranch !== targetBranch) {
      await this.git(['checkout', targetBranch], baseRepoPath)
    }

    try {
      const mergeOutput = await this.git(['merge', worktreeBranch, '--no-ff'], baseRepoPath)
      const notes: string[] = []

      if (worktree?.path) {
        try {
          await this.removeWorktree(baseRepoPath, worktree.path, true, worktreeBranch)
          notes.push(`已自动清理 ${worktree.path}`)
        } catch (cleanupErr: any) {
          notes.push(`自动清理 Worktree 失败: ${cleanupErr?.message || String(cleanupErr)}`)
          // removeWorktree may have failed before remote cleanup — still try.
          const remoteNote = await this.deleteRemoteIsolationBranch(baseRepoPath, worktreeBranch)
          if (remoteNote) notes.push(remoteNote)
        }
      } else {
        notes.push('未找到对应 Worktree，跳过自动清理')
        // Branch-only merge path: still scrub a mistaken remote isolation ref.
        const remoteNote = await this.deleteRemoteIsolationBranch(baseRepoPath, worktreeBranch)
        if (remoteNote) notes.push(remoteNote)
        await this.git(['branch', '-D', worktreeBranch], baseRepoPath).catch(() => {})
      }

      return {
        success: true,
        mergedBranch: worktreeBranch,
        targetBranch,
        hasConflicts: false,
        conflictFiles: [],
        autoResolved: false,
        message: [mergeOutput || `已将 ${worktreeBranch} 合并到 ${targetBranch}`, ...notes].filter(Boolean).join('；'),
      }
    } catch (err: any) {
      const conflictOutput = await this.git(['diff', '--name-only', '--diff-filter=U'], baseRepoPath).catch(() => '')
      const conflictFiles = conflictOutput.split('\n').filter(Boolean)
      await this.git(['merge', '--abort'], baseRepoPath).catch(() => {})
      return {
        success: false,
        mergedBranch: worktreeBranch,
        targetBranch,
        hasConflicts: conflictFiles.length > 0,
        conflictFiles,
        autoResolved: false,
        message: err.stderr || err.message || `合并 ${worktreeBranch} 失败`,
      }
    }
  }

  // Legacy methods
  async merge(workDir: string, branch: string): Promise<any> {
    const result = await this.git(['merge', branch, '--no-ff'], workDir)
    return { success: true, output: result }
  }

  async deleteBranch(workDir: string, branch: string): Promise<void> {
    await this.git(['branch', '-d', branch], workDir)
  }

  async getWorktreeDiff(worktreePath: string): Promise<any> {
    const diff = await this.git(['diff', '--stat', 'HEAD'], worktreePath).catch(() => '')
    return { diff }
  }

  async getRemoteStatus(workDir: string): Promise<any> {
    await this.git(['fetch', '--quiet'], workDir).catch(() => {})
    const ahead = await this.git(['rev-list', '--count', 'HEAD...@{upstream}'], workDir).catch(() => '0')
    return { ahead: parseInt(ahead, 10) || 0 }
  }
}

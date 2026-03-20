/**
 * GitService - Comprehensive Git operations
 * Replaces Go internal/services/git.go
 * Full API matching frontend/bindings/allbeingsfuture/internal/services/gitservice.ts
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export class GitService {
  private async git(args: string[], cwd: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
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
    return this.git(['rev-parse', '--show-toplevel'], dirPath)
  }

  async getCurrentBranch(repoPath: string): Promise<string> {
    return this.git(['branch', '--show-current'], repoPath).catch(() => 'HEAD')
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
    const files = statusRaw.split('\n').filter(Boolean).map(line => ({
      status: line.substring(0, 2).trim(),
      path: line.substring(3),
    }))
    return { branch, files, clean: files.length === 0 }
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

  async createWorktree(repoPath: string, branchName: string, taskId?: string): Promise<any> {
    const safeName = branchName.replace(/[^a-zA-Z0-9_-]/g, '-')
    const worktreePath = `${repoPath}/.allbeingsfuture-worktrees/${safeName}`
    const branch = `worktree-${safeName}`

    await this.git(['worktree', 'add', worktreePath, '-b', branch], repoPath)
    const baseCommit = await this.git(['rev-parse', 'HEAD'], repoPath)
    const baseBranch = await this.getCurrentBranch(repoPath)

    return { path: worktreePath, branch, baseCommit, baseBranch, taskId: taskId || '' }
  }

  async removeWorktree(repoPath: string, worktreePath: string, deleteBranch: boolean = true): Promise<void> {
    await this.git(['worktree', 'remove', worktreePath, '--force'], repoPath).catch(async () => {
      const { rm } = await import('node:fs/promises')
      await rm(worktreePath, { recursive: true, force: true }).catch(() => {})
      await this.git(['worktree', 'prune'], repoPath)
    })

    if (deleteBranch) {
      const worktreeName = worktreePath.split('/').pop() || ''
      const branchName = `worktree-${worktreeName}`
      await this.git(['branch', '-D', branchName], repoPath).catch(() => {})
    }
  }

  async listWorktrees(repoPath: string): Promise<any[]> {
    const output = await this.git(['worktree', 'list', '--porcelain'], repoPath).catch(() => '')
    if (!output) return []

    const worktrees: any[] = []
    let current: any = {}

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current)
        current = { path: line.slice(9) }
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice(5)
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '')
      } else if (line === 'bare') {
        current.bare = true
      } else if (line === 'detached') {
        current.detached = true
      }
    }
    if (current.path) worktrees.push(current)
    return worktrees
  }

  async checkMerge(repoPath: string, worktreeBranch: string, targetBranch: string): Promise<any> {
    try {
      const mergeBase = await this.git(['merge-base', targetBranch, worktreeBranch], repoPath)
      const diff = await this.git(['diff', '--stat', `${mergeBase}..${worktreeBranch}`], repoPath)
      return { canMerge: true, conflicts: [], diff, mergeBase }
    } catch (err: any) {
      return { canMerge: false, conflicts: [err.message], diff: '', mergeBase: '' }
    }
  }

  async mergeWorktree(repoPath: string, worktreeBranch: string, targetBranch: string): Promise<any> {
    const currentBranch = await this.getCurrentBranch(repoPath)
    if (currentBranch !== targetBranch) {
      await this.git(['checkout', targetBranch], repoPath)
    }

    try {
      const result = await this.git(['merge', worktreeBranch, '--no-ff'], repoPath)
      return { success: true, output: result, conflicts: [] }
    } catch (err: any) {
      await this.git(['merge', '--abort'], repoPath).catch(() => {})
      return { success: false, output: err.message, conflicts: [err.stderr || err.message] }
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

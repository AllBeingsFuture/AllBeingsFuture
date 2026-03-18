import { create } from 'zustand'
import { GitService } from '../../bindings/allbeingsfuture/internal/services'
import type { WorktreeInfo, GitStatus, MergeResult, CreateWorktreeResult } from '../../bindings/allbeingsfuture/internal/models/models'

interface GitState {
  worktrees: WorktreeInfo[]
  status: GitStatus | null
  currentRepo: string
  loading: boolean

  setRepo: (path: string) => void
  loadStatus: (repoPath?: string) => Promise<void>
  loadWorktrees: (repoPath?: string) => Promise<void>
  isGitRepo: (path: string) => Promise<boolean>
  createWorktree: (repoPath: string, branch: string, taskId: string) => Promise<CreateWorktreeResult | null>
  removeWorktree: (repoPath: string, worktreePath: string, deleteBranch: boolean) => Promise<void>
  mergeWorktree: (repoPath: string, branch: string, target: string) => Promise<MergeResult | null>
  checkMerge: (repoPath: string, branch: string, target: string) => Promise<MergeResult | null>
}

export const useGitStore = create<GitState>((set, get) => ({
  worktrees: [],
  status: null,
  currentRepo: '',
  loading: false,

  setRepo: (path) => set({ currentRepo: path }),

  loadStatus: async (repoPath) => {
    const repo = repoPath ?? get().currentRepo
    if (!repo) return
    try {
      const status = await GitService.GetStatus(repo)
      if (status) set({ status })
    } catch { /* ignore */ }
  },

  loadWorktrees: async (repoPath) => {
    const repo = repoPath ?? get().currentRepo
    if (!repo) return
    set({ loading: true })
    try {
      const wts = await GitService.ListWorktrees(repo)
      set({ worktrees: wts ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  isGitRepo: async (path) => {
    try {
      const result = await GitService.IsGitRepo(path)
      return result ?? false
    } catch {
      return false
    }
  },

  createWorktree: async (repoPath, branch, taskId) => {
    try {
      const result = await GitService.CreateWorktree(repoPath, branch, taskId)
      if (result) await get().loadWorktrees(repoPath)
      return result
    } catch {
      return null
    }
  },

  removeWorktree: async (repoPath, worktreePath, deleteBranch) => {
    await GitService.RemoveWorktree(repoPath, worktreePath, deleteBranch)
    await get().loadWorktrees(repoPath)
  },

  mergeWorktree: async (repoPath, branch, target) => {
    try {
      const result = await GitService.MergeWorktree(repoPath, branch, target)
      if (result?.success) await get().loadWorktrees(repoPath)
      return result
    } catch {
      return null
    }
  },

  checkMerge: async (repoPath, branch, target) => {
    try {
      return await GitService.CheckMerge(repoPath, branch, target)
    } catch {
      return null
    }
  },
}))

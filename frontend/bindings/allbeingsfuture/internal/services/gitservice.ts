import { ipc, createNullable, createArray } from '../../../electron-api';
import { CreateWorktreeResult, GitStatus, MergeResult, WorktreeInfo } from "../models/models.js";

/**
 * Check if a merge is possible.
 */
export function CheckMerge(repoPath: string, worktreeBranch: string, targetBranch: string): Promise<MergeResult | null> {
    return ipc("GitService.CheckMerge", repoPath, worktreeBranch, targetBranch).then(createNullable(MergeResult.createFrom));
}

/**
 * Create a commit.
 */
export function Commit(repoPath: string, message: string): Promise<string> {
    return ipc("GitService.Commit", repoPath, message);
}

/**
 * Create a new worktree.
 */
export function CreateWorktree(repoPath: string, branchName: string, taskID: string): Promise<CreateWorktreeResult | null> {
    return ipc("GitService.CreateWorktree", repoPath, branchName, taskID).then(createNullable(CreateWorktreeResult.createFrom));
}

/**
 * Get the current branch name.
 */
export function GetCurrentBranch(repoPath: string): Promise<string> {
    return ipc("GitService.GetCurrentBranch", repoPath);
}

/**
 * Get the diff between two refs.
 */
export function GetDiff(repoPath: string, base: string, head: string): Promise<string> {
    return ipc("GitService.GetDiff", repoPath, base, head);
}

/**
 * Get the main branch name.
 */
export function GetMainBranch(repoPath: string): Promise<string> {
    return ipc("GitService.GetMainBranch", repoPath);
}

/**
 * Get the repository root path.
 */
export function GetRepoRoot(path: string): Promise<string> {
    return ipc("GitService.GetRepoRoot", path);
}

/**
 * Ensure the directory is a git repository (init + initial commit if needed).
 */
export function EnsureRepo(path: string): Promise<string> {
    return ipc("GitService.EnsureRepo", path);
}

/**
 * Get the git status.
 */
export function GetStatus(repoPath: string): Promise<GitStatus | null> {
    return ipc("GitService.GetStatus", repoPath).then(createNullable(GitStatus.createFrom));
}

/**
 * Check if a path is a git repository.
 */
export function IsGitRepo(path: string): Promise<boolean> {
    return ipc("GitService.IsGitRepo", path);
}

/**
 * List all worktrees.
 */
export function ListWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
    return ipc("GitService.ListWorktrees", repoPath).then(createArray(WorktreeInfo.createFrom));
}

/**
 * Merge a worktree branch.
 */
export function MergeWorktree(repoPath: string, worktreeBranch: string, targetBranch: string): Promise<MergeResult | null> {
    return ipc("GitService.MergeWorktree", repoPath, worktreeBranch, targetBranch).then(createNullable(MergeResult.createFrom));
}

/**
 * Remove a worktree.
 */
export function RemoveWorktree(repoPath: string, worktreePath: string, deleteBranch: boolean): Promise<void> {
    return ipc("GitService.RemoveWorktree", repoPath, worktreePath, deleteBranch);
}

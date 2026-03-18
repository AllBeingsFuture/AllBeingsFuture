import { ipc, createNullable, createArray } from '../../../electron-api';
import * as models from "../models/models.js";

/**
 * Check if a merge is possible.
 */
export function CheckMerge(repoPath: string, worktreeBranch: string, targetBranch: string): Promise<models.MergeResult | null> {
    return ipc("GitService.CheckMerge", repoPath, worktreeBranch, targetBranch).then(createNullable(models.MergeResult.createFrom));
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
export function CreateWorktree(repoPath: string, branchName: string, taskID: string): Promise<models.CreateWorktreeResult | null> {
    return ipc("GitService.CreateWorktree", repoPath, branchName, taskID).then(createNullable(models.CreateWorktreeResult.createFrom));
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
 * Get the git status.
 */
export function GetStatus(repoPath: string): Promise<models.GitStatus | null> {
    return ipc("GitService.GetStatus", repoPath).then(createNullable(models.GitStatus.createFrom));
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
export function ListWorktrees(repoPath: string): Promise<models.WorktreeInfo[]> {
    return ipc("GitService.ListWorktrees", repoPath).then(createArray(models.WorktreeInfo.createFrom));
}

/**
 * Merge a worktree branch.
 */
export function MergeWorktree(repoPath: string, worktreeBranch: string, targetBranch: string): Promise<models.MergeResult | null> {
    return ipc("GitService.MergeWorktree", repoPath, worktreeBranch, targetBranch).then(createNullable(models.MergeResult.createFrom));
}

/**
 * Remove a worktree.
 */
export function RemoveWorktree(repoPath: string, worktreePath: string, deleteBranch: boolean): Promise<void> {
    return ipc("GitService.RemoveWorktree", repoPath, worktreePath, deleteBranch);
}

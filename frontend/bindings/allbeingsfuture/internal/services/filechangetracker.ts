import { ipc, createArray } from '../../../electron-api';
import * as models from "../models/models.js";

/**
 * Destroy the file change tracker.
 */
export function Destroy(): Promise<void> {
    return ipc("FileChangeTracker.Destroy");
}

/**
 * Find a session ID by working directory.
 */
export function FindSessionIDByWorkingDir(worktreeDir: string): Promise<string> {
    return ipc("FileChangeTracker.FindSessionIDByWorkingDir", worktreeDir);
}

/**
 * Get tracked file changes for a session.
 */
export function GetSessionChanges(sessionID: string): Promise<models.TrackedFileChange[]> {
    return ipc("FileChangeTracker.GetSessionChanges", sessionID).then(createArray(models.TrackedFileChange.createFrom));
}

/**
 * Handle a filesystem change event.
 */
export function HandleFsChange(watchedDir: string, filename: string): Promise<void> {
    return ipc("FileChangeTracker.HandleFsChange", watchedDir, filename);
}

/**
 * Register a listener for file update events.
 */
export function OnFilesUpdated(listener: any): Promise<void> {
    return ipc("FileChangeTracker.OnFilesUpdated", listener);
}

/**
 * Handle a session state change.
 */
export function OnSessionStateChange(sessionID: string, status: string, workingDir: string): Promise<void> {
    return ipc("FileChangeTracker.OnSessionStateChange", sessionID, status, workingDir);
}

/**
 * Record worktree changes for a session.
 */
export function RecordWorktreeChanges(sessionID: string, mainRepoPath: string, files: models.FileChangeRecord[]): Promise<void> {
    return ipc("FileChangeTracker.RecordWorktreeChanges", sessionID, mainRepoPath, files);
}

/**
 * Remove a session.
 */
export function RemoveSession(sessionID: string): Promise<void> {
    return ipc("FileChangeTracker.RemoveSession", sessionID);
}

/**
 * Update session activity timestamp.
 */
export function UpdateSessionActivity(sessionID: string): Promise<void> {
    return ipc("FileChangeTracker.UpdateSessionActivity", sessionID);
}

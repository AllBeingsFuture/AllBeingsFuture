import { ipc } from '../../../electron-api'

export function OnSessionStateChange(sessionID: string, status: string, workingDir: string): Promise<void> {
    return ipc("FileChangeTracker.OnSessionStateChange", sessionID, status, workingDir)
}

export function GetSessionChanges(sessionID: string): Promise<any[]> {
    return ipc("FileChangeTracker.GetSessionChanges", sessionID)
}

export function RecordWorktreeChanges(sessionID: string, mainRepoPath: string, files: any[]): Promise<void> {
    return ipc("FileChangeTracker.RecordWorktreeChanges", sessionID, mainRepoPath, files)
}

export function HandleFsChange(watchedDir: string, filename: string): Promise<void> {
    return ipc("FileChangeTracker.HandleFsChange", watchedDir, filename)
}

export function RemoveSession(sessionID: string): Promise<void> {
    return ipc("FileChangeTracker.RemoveSession", sessionID)
}

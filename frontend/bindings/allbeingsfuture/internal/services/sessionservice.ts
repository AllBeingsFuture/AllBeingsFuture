import { ipc, createNullable, createArray } from '../../../electron-api'
import * as models from "../models/models.js"

export function Create(config: models.SessionConfig): Promise<models.Session | null> {
    return ipc("SessionService.Create", config).then(createNullable(models.Session.createFrom))
}

export function Delete(id: string): Promise<void> {
    return ipc("SessionService.Delete", id)
}

export function End(id: string): Promise<void> {
    return ipc("SessionService.End", id)
}

export function UpdateName(id: string, name: string): Promise<void> {
    return ipc("SessionService.UpdateName", id, name)
}

export function GetAll(): Promise<models.Session[]> {
    return ipc("SessionService.GetAll").then(createArray(models.Session.createFrom))
}

export function GetByID(id: string): Promise<models.Session | null> {
    return ipc("SessionService.GetByID", id).then(createNullable(models.Session.createFrom))
}

export function MarkWorktreeMerged(id: string): Promise<void> {
    return ipc("SessionService.MarkWorktreeMerged", id)
}

export function SetWorktreeInfo(id: string, worktreePath: string, branch: string, baseCommit: string, baseBranch: string, sourceRepo: string): Promise<void> {
    return ipc("SessionService.SetWorktreeInfo", id, worktreePath, branch, baseCommit, baseBranch, sourceRepo)
}

export function UpdateStatus(id: string, status: models.SessionStatus): Promise<void> {
    return ipc("SessionService.UpdateStatus", id, status)
}

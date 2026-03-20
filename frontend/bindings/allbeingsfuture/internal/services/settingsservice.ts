import { ipc, createNullable } from '../../../electron-api'
import * as models from "../models/models.js"

export function GetAll(): Promise<models.AppSettings | null> {
    return ipc("SettingsService.GetAll").then(createNullable(models.AppSettings.createFrom))
}

export function GetAutoWorktree(): Promise<boolean> {
    return ipc("SettingsService.GetAutoWorktree")
}

export function GetProxyEnv(): Promise<[string, string]> {
    return ipc("SettingsService.GetProxyEnv")
}

export function SendNotification(title: string, body: string): Promise<void> {
    return ipc("SettingsService.SendNotification", title, body)
}

export function SetAutoLaunch(enabled: boolean): Promise<void> {
    return ipc("SettingsService.SetAutoLaunch", enabled)
}

export function SetAutoWorktree(enabled: boolean): Promise<void> {
    return ipc("SettingsService.SetAutoWorktree", enabled)
}

export function Update(key: string, value: string): Promise<void> {
    return ipc("SettingsService.Update", key, value)
}

export function UpdateBatch(settings: { [_ in string]?: string }): Promise<void> {
    return ipc("SettingsService.UpdateBatch", settings)
}

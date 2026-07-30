import { ipc, createNullable } from '../../../electron-api'
import { AppSettings } from "../models/models.js"

export function GetAll(): Promise<AppSettings | null> {
    return ipc("SettingsService.GetAll").then(createNullable(AppSettings.createFrom))
}

export function GetAutoWorktree(): Promise<boolean> {
    return ipc("SettingsService.GetAutoWorktree")
}

export function SendNotification(title: string, body: string): Promise<void> {
    return ipc("SettingsService.SendNotification", title, body)
}

export function Update(key: string, value: string): Promise<void> {
    return ipc("SettingsService.Update", key, value)
}

export function UpdateBatch(settings: { [_ in string]?: string }): Promise<void> {
    return ipc("SettingsService.UpdateBatch", settings)
}

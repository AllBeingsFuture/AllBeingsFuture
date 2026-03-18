import { ipc } from '../../../electron-api'

export function GetConfig(): Promise<any> {
    return ipc("SystemSettingsService.GetConfig")
}

export function GetAll(): Promise<any> {
    return ipc("SystemSettingsService.GetAll")
}

export function Get(key: string): Promise<string> {
    return ipc("SystemSettingsService.Get", key)
}

export function Update(key: string, value: string): Promise<void> {
    return ipc("SystemSettingsService.Update", key, value)
}

export function UpdateBatch(settings: any): Promise<void> {
    return ipc("SystemSettingsService.UpdateBatch", settings)
}

export function ValidateConfig(): Promise<void> {
    return ipc("SystemSettingsService.ValidateConfig")
}

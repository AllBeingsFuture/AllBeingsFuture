import { ipc } from '../../../electron-api'

export function Start(): Promise<void> {
    return ipc("TelegramService.Start")
}

export function Stop(): Promise<void> {
    return ipc("TelegramService.Stop")
}

export function Reload(): Promise<void> {
    return ipc("TelegramService.Reload")
}

export function Status(): Promise<any> {
    return ipc("TelegramService.Status")
}

export function GetConfig(): Promise<Record<string, any>> {
    return ipc("TelegramService.GetConfig")
}

export function UpdateConfig(key: string, value: string): Promise<void> {
    return ipc("TelegramService.UpdateConfig", key, value)
}

export function Restart(): Promise<any> {
    return ipc("TelegramService.Restart")
}

export function GetAllowedUsers(): Promise<any[]> {
    return ipc("TelegramService.GetAllowedUsers")
}

export function AddAllowedUser(userId: number, username: string, role: string): Promise<any> {
    return ipc("TelegramService.AddAllowedUser", userId, username, role)
}

export function RemoveAllowedUser(userId: number): Promise<any> {
    return ipc("TelegramService.RemoveAllowedUser", userId)
}

export function GetAIProviders(): Promise<any[]> {
    return ipc("TelegramService.GetAIProviders")
}

export function AddAIProvider(id: string, name: string, apiEndpoint: string, apiKey: string, model: string, maxTokens: number, priority: number): Promise<any> {
    return ipc("TelegramService.AddAIProvider", id, name, apiEndpoint, apiKey, model, maxTokens, priority)
}

export function UpdateAIProvider(id: string, updates: string): Promise<any> {
    return ipc("TelegramService.UpdateAIProvider", id, updates)
}

export function DeleteAIProvider(id: string): Promise<any> {
    return ipc("TelegramService.DeleteAIProvider", id)
}

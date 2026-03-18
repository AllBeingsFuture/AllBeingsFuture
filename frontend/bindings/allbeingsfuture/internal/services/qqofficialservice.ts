import { ipc, createMap, identity } from '../../../electron-api'

export function GetConfig(): Promise<{ [_ in string]?: any }> {
    return ipc("QQOfficialService.GetConfig").then(createMap(identity, identity))
}

export function Reload(): Promise<void> {
    return ipc("QQOfficialService.Reload")
}

export function Restart(): Promise<{ [_ in string]?: any }> {
    return ipc("QQOfficialService.Restart").then(createMap(identity, identity))
}

export function Start(): Promise<void> {
    return ipc("QQOfficialService.Start")
}

export function Status(): Promise<{ [_ in string]?: any }> {
    return ipc("QQOfficialService.Status").then(createMap(identity, identity))
}

export function Stop(): Promise<void> {
    return ipc("QQOfficialService.Stop")
}

export function UpdateConfig(key: string, value: string): Promise<void> {
    return ipc("QQOfficialService.UpdateConfig", key, value)
}

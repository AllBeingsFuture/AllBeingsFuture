import { ipc } from '../../../electron-api'

export function Init(): Promise<void> {
    return ipc("UpdateService.Init")
}

export function CheckForUpdates(manual: boolean): Promise<any> {
    return ipc("UpdateService.CheckForUpdates", manual)
}

export function GetState(): Promise<any> {
    return ipc("UpdateService.GetState")
}

export function OpenDownloadPage(): Promise<string> {
    return ipc("UpdateService.OpenDownloadPage")
}

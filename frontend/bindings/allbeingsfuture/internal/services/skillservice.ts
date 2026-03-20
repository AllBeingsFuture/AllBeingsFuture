import { ipc } from '../../../electron-api'

export function List(): Promise<any[]> {
    return ipc("SkillService.List")
}

export function Get(id: string): Promise<any> {
    return ipc("SkillService.Get", id)
}

export function Install(sk: any): Promise<void> {
    return ipc("SkillService.Install", sk)
}

export function Delete(id: string): Promise<void> {
    return ipc("SkillService.Delete", id)
}

export function ToggleEnabled(id: string, enabled: boolean): Promise<void> {
    return ipc("SkillService.ToggleEnabled", id, enabled)
}

export function GetRuntimeInfo(id: string): Promise<any> {
    return ipc("SkillService.GetRuntimeInfo", id)
}

export function SeedBuiltins(): Promise<void> {
    return ipc("SkillService.SeedBuiltins")
}

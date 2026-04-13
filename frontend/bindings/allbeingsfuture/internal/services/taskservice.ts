import { ipc } from '../../../electron-api'

export function Create(config: any): Promise<any> {
    return ipc("TaskService.Create", config)
}

export function GetAll(): Promise<any[]> {
    return ipc("TaskService.GetAll")
}

export function GetByID(id: string): Promise<any> {
    return ipc("TaskService.GetByID", id)
}

export function Update(id: string, upd: any): Promise<any> {
    return ipc("TaskService.Update", id, upd)
}

export function Delete(id: string): Promise<void> {
    return ipc("TaskService.Delete", id)
}

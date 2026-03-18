import { ipc } from '../../../electron-api'

export function Enqueue(name: string, taskType: string, payload: any): Promise<any> {
    return ipc("QueueService.Enqueue", name, taskType, payload)
}

export function GetByID(id: string): Promise<any> {
    return ipc("QueueService.GetByID", id)
}

export function List(status: string, limit: number): Promise<any[]> {
    return ipc("QueueService.List", status, limit)
}

export function ClaimNext(workerID: string): Promise<any> {
    return ipc("QueueService.ClaimNext", workerID)
}

export function Complete(id: string, status: string, lastError: string): Promise<void> {
    return ipc("QueueService.Complete", id, status, lastError)
}

export function Retry(id: string, lastError: string): Promise<void> {
    return ipc("QueueService.Retry", id, lastError)
}

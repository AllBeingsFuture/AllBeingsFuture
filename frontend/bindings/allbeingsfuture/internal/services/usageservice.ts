import { ipc } from '../../../electron-api'
import type {
  UsageSummary,
  UsageHistory,
} from '../../../../src/types/usageTypes'

export function GetSummary(): Promise<UsageSummary | null> {
    return ipc("UsageService.GetSummary")
}

export function GetHistory(days: number): Promise<UsageHistory | null> {
    return ipc("UsageService.GetHistory", days)
}

export function GetSessionMessages(sessionId: string): Promise<any[]> {
    return ipc("UsageService.GetSessionMessages", sessionId)
}

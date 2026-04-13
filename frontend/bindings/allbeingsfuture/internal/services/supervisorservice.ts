import { ipc, createNullable, createArray } from '../../../electron-api'
import * as models from "../models/models.js"

export function AssertToolAllowed(sessionID: string, toolName: string, params: string): Promise<models.PolicyResult> {
    return ipc("SupervisorService.AssertToolAllowed", sessionID, toolName, params).then(models.PolicyResult.createFrom)
}

export function CheckBudget(sessionID: string): Promise<models.BudgetStatus | null> {
    return ipc("SupervisorService.CheckBudget", sessionID).then(createNullable(models.BudgetStatus.createFrom))
}

export function Cleanup(): Promise<void> {
    return ipc("SupervisorService.Cleanup")
}

export function Evaluate(sessionID: string, iteration: number): Promise<models.Intervention | null> {
    return ipc("SupervisorService.Evaluate", sessionID, iteration).then(createNullable(models.Intervention.createFrom))
}

export function GetAllStatuses(): Promise<models.SupervisorStatus[]> {
    return ipc("SupervisorService.GetAllStatuses").then(createArray(models.SupervisorStatus.createFrom))
}

export function GetEvents(sessionID: string): Promise<models.SupervisionEvent[]> {
    return ipc("SupervisorService.GetEvents", sessionID).then(createArray(models.SupervisionEvent.createFrom))
}

export function GetStatus(sessionID: string): Promise<models.SupervisorStatus> {
    return ipc("SupervisorService.GetStatus", sessionID).then(models.SupervisorStatus.createFrom)
}

export function RecordConsecutiveToolRounds(sessionID: string, rounds: number): Promise<void> {
    return ipc("SupervisorService.RecordConsecutiveToolRounds", sessionID, rounds)
}

export function RecordResponse(sessionID: string, text: string): Promise<void> {
    return ipc("SupervisorService.RecordResponse", sessionID, text)
}

export function RecordTokens(sessionID: string, tokens: number): Promise<void> {
    return ipc("SupervisorService.RecordTokens", sessionID, tokens)
}

export function RecordToolCall(sessionID: string, toolName: string, params: string, success: boolean, iteration: number): Promise<void> {
    return ipc("SupervisorService.RecordToolCall", sessionID, toolName, params, success, iteration)
}

export function ResetSession(sessionID: string): Promise<void> {
    return ipc("SupervisorService.ResetSession", sessionID)
}

export function SetBudgetConfig(sessionID: string, config: models.ResourceBudgetConfig): Promise<void> {
    return ipc("SupervisorService.SetBudgetConfig", sessionID, config)
}

export function SetEnabled(sessionID: string, enabled: boolean): Promise<void> {
    return ipc("SupervisorService.SetEnabled", sessionID, enabled)
}

export function SetPolicyConfig(sessionID: string, config: models.PolicyConfig): Promise<void> {
    return ipc("SupervisorService.SetPolicyConfig", sessionID, config)
}

export function StartSession(sessionID: string): Promise<void> {
    return ipc("SupervisorService.StartSession", sessionID)
}

export function StopSession(sessionID: string): Promise<void> {
    return ipc("SupervisorService.StopSession", sessionID)
}

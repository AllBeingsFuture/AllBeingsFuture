import { ipc } from '../../../electron-api'

export function Start(): Promise<void> {
    return ipc("SuggestionService.Start")
}

export function Stop(): Promise<void> {
    return ipc("SuggestionService.Stop")
}

export function OnActivity(sessionID: string, actType: string, detail: string): Promise<void> {
    return ipc("SuggestionService.OnActivity", sessionID, actType, detail)
}

export function UpdateSessionInfo(sessionID: string, name: string, status: string, workDir: string): Promise<void> {
    return ipc("SuggestionService.UpdateSessionInfo", sessionID, name, status, workDir)
}

export function Dismiss(suggestionID: string): Promise<void> {
    return ipc("SuggestionService.Dismiss", suggestionID)
}

export function GetActiveSuggestion(): Promise<any> {
    return ipc("SuggestionService.GetActiveSuggestion")
}

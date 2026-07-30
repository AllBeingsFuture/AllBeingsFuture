import { ipc, createNullable } from '../../../electron-api';
import { ChatState } from "../models/models.js";

export function GetChatState(sessionId: string): Promise<ChatState | null> {
    return ipc("ProcessService.GetChatState", sessionId).then(createNullable(ChatState.createFrom));
}

export function InitSession(sessionId: string): Promise<void> {
    return ipc("ProcessService.InitSession", sessionId);
}

export function SendMessage(sessionId: string, message: string): Promise<void> {
    return ipc("ProcessService.SendMessage", sessionId, message);
}

export function StopProcess(sessionId: string): Promise<void> {
    return ipc("ProcessService.StopProcess", sessionId);
}

export function SendMessageWithImages(sessionId: string, message: string, images: Array<{ data: string; mimeType: string }>): Promise<void> {
    return ipc("ProcessService.SendMessageWithImages", sessionId, message, images);
}

export function ResumeSession(oldSessionId: string): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    return ipc("ProcessService.ResumeSession", oldSessionId);
}

export function SpawnChildSession(parentSessionId: string, options: { name: string; prompt: string }): Promise<{ childSessionId: string }> {
    return ipc("ProcessService.SpawnChildSession", parentSessionId, options);
}

export function SendToChild(parentSessionId: string, childSessionId: string, message: string): Promise<void> {
    return ipc("ProcessService.SendToChild", parentSessionId, childSessionId, message);
}

export function ListAllAgents(): Promise<any[]> {
    return ipc("ProcessService.ListAllAgents");
}

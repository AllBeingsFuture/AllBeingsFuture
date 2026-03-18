import { ipc, createNullable } from '../../../electron-api';
import * as models from "../models/models.js";

/**
 * Get the chat state for a session.
 */
export function GetChatState(sessionId: string): Promise<models.ChatState | null> {
    return ipc("ProcessService.GetChatState", sessionId).then(createNullable(models.ChatState.createFrom));
}

/**
 * Initialize a session.
 */
export function InitSession(sessionId: string): Promise<void> {
    return ipc("ProcessService.InitSession", sessionId);
}

/**
 * Check if a session is streaming.
 */
export function IsStreaming(sessionId: string): Promise<boolean> {
    return ipc("ProcessService.IsStreaming", sessionId);
}

/**
 * Send a message to a session.
 */
export function SendMessage(sessionId: string, message: string): Promise<void> {
    return ipc("ProcessService.SendMessage", sessionId, message);
}

/**
 * Stop the process for a session.
 */
export function StopProcess(sessionId: string): Promise<void> {
    return ipc("ProcessService.StopProcess", sessionId);
}

/**
 * Send a message with images to a session.
 */
export function SendMessageWithImages(sessionId: string, message: string, images: Array<{ data: string; mimeType: string }>): Promise<void> {
    return ipc("ProcessService.SendMessageWithImages", sessionId, message, images);
}

/**
 * Resume a session.
 */
export function ResumeSession(oldSessionId: string): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    return ipc("ProcessService.ResumeSession", oldSessionId);
}

/**
 * Spawn a persistent child session with its own live adapter.
 */
export function SpawnChildSession(parentSessionId: string, options: { name: string; prompt: string }): Promise<{ childSessionId: string }> {
    return ipc("ProcessService.SpawnChildSession", parentSessionId, options);
}

/**
 * Send a message to a child session from its parent.
 */
export function SendToChild(parentSessionId: string, childSessionId: string, message: string): Promise<void> {
    return ipc("ProcessService.SendToChild", parentSessionId, childSessionId, message);
}

/**
 * Get all child sessions for a parent.
 */
export function GetChildSessions(parentSessionId: string): Promise<any[]> {
    return ipc("ProcessService.GetChildSessions", parentSessionId);
}

/**
 * List all agents.
 */
export function ListAllAgents(): Promise<any[]> {
    return ipc("ProcessService.ListAllAgents");
}

/**
 * Get agents spawned by a specific session.
 */
export function GetAgentsBySession(sessionId: string): Promise<any[]> {
    return ipc("ProcessService.GetAgentsBySession", sessionId);
}

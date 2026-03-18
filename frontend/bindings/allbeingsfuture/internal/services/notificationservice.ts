import { ipc } from '../../../electron-api';

/**
 * Update notification configuration.
 */
export function UpdateConfig(enabled: boolean, sound: boolean, dndEnabled: boolean, dndStart: string, dndEnd: string, types: any): Promise<void> {
    return ipc("NotificationService.UpdateConfig", enabled, sound, dndEnabled, dndStart, dndEnd, types);
}

/**
 * Handle confirmation needed notification.
 */
export function OnConfirmationNeeded(sessionID: string, sessionName: string): Promise<void> {
    return ipc("NotificationService.OnConfirmationNeeded", sessionID, sessionName);
}

/**
 * Handle task completed notification.
 */
export function OnTaskCompleted(sessionID: string, sessionName: string): Promise<void> {
    return ipc("NotificationService.OnTaskCompleted", sessionID, sessionName);
}

/**
 * Handle error notification.
 */
export function OnError(sessionID: string, sessionName: string, errorMsg: string): Promise<void> {
    return ipc("NotificationService.OnError", sessionID, sessionName, errorMsg);
}

/**
 * Handle session stuck notification.
 */
export function OnSessionStuck(sessionID: string, sessionName: string): Promise<void> {
    return ipc("NotificationService.OnSessionStuck", sessionID, sessionName);
}

/**
 * Acknowledge a notification.
 */
export function Acknowledge(sessionID: string, ntype: string): Promise<boolean> {
    return ipc("NotificationService.Acknowledge", sessionID, ntype);
}

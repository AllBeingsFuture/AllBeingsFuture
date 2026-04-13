import { ipc } from '../../../electron-api';

/**
 * Start the QQ bot.
 */
export function Start(): Promise<void> {
    return ipc("QQBotService.Start");
}

/**
 * Stop the QQ bot.
 */
export function Stop(): Promise<void> {
    return ipc("QQBotService.Stop");
}

/**
 * Reload the QQ bot configuration.
 */
export function Reload(): Promise<void> {
    return ipc("QQBotService.Reload");
}

/**
 * Get the QQ bot status.
 */
export function Status(): Promise<any> {
    return ipc("QQBotService.Status");
}

/**
 * Get the QQ bot configuration.
 */
export function GetConfig(): Promise<Record<string, any>> {
    return ipc("QQBotService.GetConfig");
}

/**
 * Update a QQ bot configuration value.
 */
export function UpdateConfig(key: string, value: string): Promise<void> {
    return ipc("QQBotService.UpdateConfig", key, value);
}

/**
 * Restart the QQ bot.
 */
export function Restart(): Promise<any> {
    return ipc("QQBotService.Restart");
}

/**
 * Get allowed users.
 */
export function GetAllowedUsers(): Promise<any[]> {
    return ipc("QQBotService.GetAllowedUsers");
}

/**
 * Add an allowed user.
 */
export function AddAllowedUser(userId: number, nickname: string, role: string): Promise<any> {
    return ipc("QQBotService.AddAllowedUser", userId, nickname, role);
}

/**
 * Remove an allowed user.
 */
export function RemoveAllowedUser(userId: number): Promise<any> {
    return ipc("QQBotService.RemoveAllowedUser", userId);
}

/**
 * Get allowed groups.
 */
export function GetAllowedGroups(): Promise<any[]> {
    return ipc("QQBotService.GetAllowedGroups");
}

/**
 * Add an allowed group.
 */
export function AddAllowedGroup(groupId: number, groupName: string, role: string): Promise<any> {
    return ipc("QQBotService.AddAllowedGroup", groupId, groupName, role);
}

/**
 * Remove an allowed group.
 */
export function RemoveAllowedGroup(groupId: number): Promise<any> {
    return ipc("QQBotService.RemoveAllowedGroup", groupId);
}

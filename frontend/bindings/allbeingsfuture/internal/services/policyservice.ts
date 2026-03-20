import { ipc, createNullable, createArray } from '../../../electron-api';
import * as models from "../models/models.js";

/**
 * Add a blocked command.
 */
export function AddBlockedCommand(cmd: string): Promise<void> {
    return ipc("PolicyService.AddBlockedCommand", cmd);
}

/**
 * Add a blocked path pattern.
 */
export function AddBlockedPath(pattern: string): Promise<void> {
    return ipc("PolicyService.AddBlockedPath", pattern);
}

/**
 * Add a dangerous pattern for a tool.
 */
export function AddDangerousPattern(toolName: string, pattern: string): Promise<void> {
    return ipc("PolicyService.AddDangerousPattern", toolName, pattern);
}

/**
 * Check if a tool is allowed by policy.
 */
export function CheckToolAllowed(toolName: string, params: { [_ in string]?: any }): Promise<models.PolicyResult | null> {
    return ipc("PolicyService.CheckToolAllowed", toolName, params).then(createNullable(models.PolicyResult.createFrom));
}

/**
 * Clear the audit log.
 */
export function ClearAuditLog(): Promise<void> {
    return ipc("PolicyService.ClearAuditLog");
}

/**
 * Get audit log entries.
 */
export function GetAuditLog(limit: number): Promise<models.PolicyAuditEntry[]> {
    return ipc("PolicyService.GetAuditLog", limit).then(createArray(models.PolicyAuditEntry.createFrom));
}

/**
 * Get the policy configuration.
 */
export function GetConfig(): Promise<models.PolicyConfig | null> {
    return ipc("PolicyService.GetConfig").then(createNullable(models.PolicyConfig.createFrom));
}

/**
 * Reload the policy configuration from disk.
 */
export function ReloadConfig(): Promise<void> {
    return ipc("PolicyService.ReloadConfig");
}

/**
 * Remove a blocked command.
 */
export function RemoveBlockedCommand(cmd: string): Promise<void> {
    return ipc("PolicyService.RemoveBlockedCommand", cmd);
}

/**
 * Remove a blocked path pattern.
 */
export function RemoveBlockedPath(pattern: string): Promise<void> {
    return ipc("PolicyService.RemoveBlockedPath", pattern);
}

/**
 * Set auto-confirm mode.
 */
export function SetAutoConfirm(auto: boolean): Promise<void> {
    return ipc("PolicyService.SetAutoConfirm", auto);
}

/**
 * Update the policy configuration.
 */
export function UpdateConfig(config: models.PolicyConfig): Promise<void> {
    return ipc("PolicyService.UpdateConfig", config);
}

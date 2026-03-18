import { ipc, createArray } from '../../../electron-api';
import * as models from "../models/models.js";

/**
 * Get the proactive configuration.
 */
export function GetConfig(): Promise<models.ProactiveConfig> {
    return ipc("ProactiveService.GetConfig").then(models.ProactiveConfig.createFrom);
}

/**
 * Get proactive records.
 */
export function GetRecords(limit: number): Promise<models.ProactiveRecord[]> {
    return ipc("ProactiveService.GetRecords", limit).then(createArray(models.ProactiveRecord.createFrom));
}

/**
 * Get the proactive status.
 */
export function GetStatus(): Promise<models.ProactiveStatus> {
    return ipc("ProactiveService.GetStatus").then(models.ProactiveStatus.createFrom);
}

/**
 * Send a heartbeat.
 */
export function Heartbeat(): Promise<models.ProactiveHeartbeatResult> {
    return ipc("ProactiveService.Heartbeat").then(models.ProactiveHeartbeatResult.createFrom);
}

/**
 * Process a user response.
 */
export function ProcessUserResponse(responseText: string, delayMinutes: number): Promise<void> {
    return ipc("ProactiveService.ProcessUserResponse", responseText, delayMinutes);
}

/**
 * Set the proactive configuration.
 */
export function SetConfig(config: models.ProactiveConfig): Promise<void> {
    return ipc("ProactiveService.SetConfig", config);
}

/**
 * Set the enabled state.
 */
export function SetEnabled(enabled: boolean): Promise<void> {
    return ipc("ProactiveService.SetEnabled", enabled);
}

/**
 * Start the proactive service.
 */
export function Start(): Promise<void> {
    return ipc("ProactiveService.Start");
}

/**
 * Stop the proactive service.
 */
export function Stop(): Promise<void> {
    return ipc("ProactiveService.Stop");
}

/**
 * Update user interaction timestamp.
 */
export function UpdateUserInteraction(): Promise<void> {
    return ipc("ProactiveService.UpdateUserInteraction");
}

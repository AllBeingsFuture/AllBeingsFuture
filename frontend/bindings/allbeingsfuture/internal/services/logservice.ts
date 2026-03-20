import { ipc } from '../../../electron-api';

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
}

/**
 * Get recent log entries.
 */
export function GetRecent(limit: number): Promise<LogEntry[]> {
    return ipc("LogService.GetRecent", limit);
}

/**
 * Get the log file path.
 */
export function GetLogFilePath(): Promise<string> {
    return ipc("LogService.GetLogFilePath");
}

/**
 * Clear all log entries.
 */
export function Clear(): Promise<void> {
    return ipc("LogService.Clear");
}

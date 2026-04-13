import { ipc } from '../../../electron-api';

/**
 * List all MCP services.
 */
export function List(): Promise<any[]> {
    return ipc("MCPService.List");
}

/**
 * Get an MCP service by ID.
 */
export function Get(id: string): Promise<any> {
    return ipc("MCPService.Get", id);
}

/**
 * Install an MCP service.
 */
export function Install(srv: any): Promise<void> {
    return ipc("MCPService.Install", srv);
}

/**
 * Uninstall an MCP service.
 */
export function Uninstall(id: string): Promise<void> {
    return ipc("MCPService.Uninstall", id);
}

/**
 * Update the configuration of an MCP service.
 */
export function UpdateConfig(id: string, config: any): Promise<void> {
    return ipc("MCPService.UpdateConfig", id, config);
}

/**
 * Toggle the enabled state of an MCP service.
 */
export function ToggleEnabled(id: string, enabled: boolean): Promise<void> {
    return ipc("MCPService.ToggleEnabled", id, enabled);
}

/**
 * Get runtime info for an MCP service.
 */
export function GetRuntimeInfo(id: string): Promise<any> {
    return ipc("MCPService.GetRuntimeInfo", id);
}

/**
 * Seed built-in MCP services.
 */
export function SeedBuiltins(): Promise<void> {
    return ipc("MCPService.SeedBuiltins");
}

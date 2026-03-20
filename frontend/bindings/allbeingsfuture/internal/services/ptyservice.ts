import { ipc } from '../../../electron-api';

interface ShellDef {
    id: string;
    name: string;
    path: string;
}

interface PTYCreateResult {
    id: string;
    shell: string;
    error?: string;
}

/**
 * Get available shells.
 */
export function GetShells(): Promise<ShellDef[]> {
    return ipc("PTYService.GetShells");
}

/**
 * Create a new PTY session.
 */
export function Create(shell: string, cwd: string): Promise<PTYCreateResult> {
    return ipc("PTYService.Create", shell, cwd);
}

/**
 * Write data to a PTY session.
 */
export function Write(id: string, data: string): Promise<void> {
    return ipc("PTYService.Write", id, data);
}

/**
 * Resize a PTY session.
 */
export function Resize(id: string, cols: number, rows: number): Promise<void> {
    return ipc("PTYService.Resize", id, cols, rows);
}

/**
 * Kill a PTY session.
 */
export function Kill(id: string): Promise<void> {
    return ipc("PTYService.Kill", id);
}

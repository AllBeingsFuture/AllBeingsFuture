import { ipc } from '../../../electron-api';

/**
 * Get the current auth state.
 */
export function GetState(): Promise<any> {
    return ipc("AuthService.GetState");
}

/**
 * Update the auth state.
 */
export function UpdateState(state: any): Promise<void> {
    return ipc("AuthService.UpdateState", state);
}

/**
 * Clear the auth state.
 */
export function ClearState(): Promise<void> {
    return ipc("AuthService.ClearState");
}

/**
 * Check if the user can access a feature.
 */
export function CanAccess(feature: string): Promise<boolean> {
    return ipc("AuthService.CanAccess", feature);
}

/**
 * Check if anonymous access is allowed.
 */
export function IsAnonymousAllowed(): Promise<boolean> {
    return ipc("AuthService.IsAnonymousAllowed");
}

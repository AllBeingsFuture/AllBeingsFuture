import { ipc, createNullable, createArray } from '../../../electron-api';
import * as models from "../models/models.js";

/**
 * Create a new AI provider.
 */
export function Create(name: string, command: string, adapterType: models.AdapterType): Promise<models.AIProvider | null> {
    return ipc("ProviderService.Create", name, command, adapterType).then(createNullable(models.AIProvider.createFrom));
}

/**
 * Delete an AI provider.
 */
export function Delete(id: string): Promise<void> {
    return ipc("ProviderService.Delete", id);
}

/**
 * Get all AI providers.
 */
export function GetAll(): Promise<models.AIProvider[]> {
    return ipc("ProviderService.GetAll").then(createArray(models.AIProvider.createFrom));
}

/**
 * Get an AI provider by ID.
 */
export function GetByID(id: string): Promise<models.AIProvider | null> {
    return ipc("ProviderService.GetByID", id).then(createNullable(models.AIProvider.createFrom));
}

/**
 * Update an AI provider.
 */
export function Update(id: string, updates: { [_ in string]?: any }): Promise<void> {
    return ipc("ProviderService.Update", id, updates);
}

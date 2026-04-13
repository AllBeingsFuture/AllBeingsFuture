import { ipc } from '../../../electron-api';

/**
 * List all bots.
 */
export function List(): Promise<any[]> {
    return ipc("BotService.List");
}

/**
 * List bot catalog metadata.
 */
export function GetCatalog(): Promise<any[]> {
    return ipc("BotService.GetCatalog");
}

/**
 * Create a new bot.
 */
export function Create(bot: any): Promise<any> {
    return ipc("BotService.Create", bot);
}

/**
 * Update an existing bot.
 */
export function Update(botId: string, bot: any): Promise<any> {
    return ipc("BotService.Update", botId, bot);
}

/**
 * Delete a bot.
 */
export function Delete(botId: string): Promise<void> {
    return ipc("BotService.Delete", botId);
}

/**
 * Toggle a bot's enabled state.
 */
export function Toggle(botId: string, enabled: boolean): Promise<any> {
    return ipc("BotService.Toggle", botId, enabled);
}

/**
 * Send a test push message to a single bot.
 */
export function TestPush(botId: string): Promise<{ ok: boolean; error?: string }> {
    return ipc("BotService.TestPush", botId);
}

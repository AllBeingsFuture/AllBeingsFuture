import { ipc } from '../../../electron-api';

/**
 * Prepare a file for transfer.
 */
export function PrepareFile(filePath: string): Promise<any> {
    return ipc("FileTransferService.PrepareFile", filePath);
}

/**
 * Validate platform limits for a file.
 */
export function ValidatePlatformLimit(file: any, platform: string): Promise<void> {
    return ipc("FileTransferService.ValidatePlatformLimit", file, platform);
}

/**
 * Save a clipboard image to disk.
 */
export function SaveClipboardImage(base64Data: string, mimeType: string): Promise<string> {
    return ipc("FileTransferService.SaveClipboardImage", base64Data, mimeType);
}

/**
 * Save a dropped file to a temp directory and return its path.
 */
export function SaveDroppedFile(filename: string, base64Data: string): Promise<string> {
    return ipc("FileTransferService.SaveDroppedFile", filename, base64Data);
}

import { ipc, createNullable, createArray } from '../../../electron-api'
import * as models from "../models/models.js"

export function ClearCache(): Promise<number> {
    return ipc("StickerService.ClearCache")
}

export function DownloadAndCache(url: string): Promise<string> {
    return ipc("StickerService.DownloadAndCache", url)
}

export function GetCategories(): Promise<string[]> {
    return ipc("StickerService.GetCategories")
}

export function GetMoods(): Promise<string[]> {
    return ipc("StickerService.GetMoods")
}

export function GetStatus(): Promise<models.StickerStatus | null> {
    return ipc("StickerService.GetStatus").then(createNullable(models.StickerStatus.createFrom))
}

export function Initialize(): Promise<void> {
    return ipc("StickerService.Initialize")
}

export function RefreshIndex(): Promise<void> {
    return ipc("StickerService.RefreshIndex")
}

export function Search(query: string, category: string, limit: number): Promise<models.StickerResult[]> {
    return ipc("StickerService.Search", query, category, limit).then(createArray(models.StickerResult.createFrom))
}

export function SearchByMood(mood: string, limit: number): Promise<models.StickerResult[]> {
    return ipc("StickerService.SearchByMood", mood, limit).then(createArray(models.StickerResult.createFrom))
}

import { create } from 'zustand'
import { StickerService } from '../../bindings/allbeingsfuture/internal/services'

export interface StickerResult {
  name: string
  category: string
  url: string
}

export interface StickerStatus {
  initialized: boolean
  totalStickers: number
  keywords: number
  categories: number
  cachedFiles: number
  dataDir: string
}

interface StickerState {
  results: StickerResult[]
  status: StickerStatus | null
  moods: string[]
  categories: string[]
  loading: boolean
  searching: boolean
  error: string | null

  // Actions
  loadStatus: () => Promise<void>
  loadMoods: () => Promise<void>
  loadCategories: () => Promise<void>
  search: (query: string, category?: string, limit?: number) => Promise<StickerResult[]>
  searchByMood: (mood: string, limit?: number) => Promise<StickerResult[]>
  downloadAndCache: (url: string) => Promise<string>
  refreshIndex: () => Promise<void>
  clearCache: () => Promise<number>
  initialize: () => Promise<void>
}

export const useStickerStore = create<StickerState>((set, get) => ({
  results: [],
  status: null,
  moods: [],
  categories: [],
  loading: false,
  searching: false,
  error: null,

  loadStatus: async () => {
    try {
      const status = await StickerService.GetStatus()
      set({ status })
    } catch (e: any) {
      set({ error: e?.message || 'Failed to load sticker status' })
    }
  },

  loadMoods: async () => {
    try {
      const moods = await StickerService.GetMoods()
      set({ moods: moods ?? [] })
    } catch (e: any) {
      set({ error: e?.message || 'Failed to load moods' })
    }
  },

  loadCategories: async () => {
    try {
      const categories = await StickerService.GetCategories()
      set({ categories: categories ?? [] })
    } catch (e: any) {
      set({ error: e?.message || 'Failed to load categories' })
    }
  },

  search: async (query: string, category = '', limit = 12) => {
    set({ searching: true, error: null })
    try {
      const results = await StickerService.Search(query, category, limit)
      const list = results ?? []
      set({ results: list, searching: false })
      return list
    } catch (e: any) {
      set({ searching: false, error: e?.message || 'Search failed' })
      return []
    }
  },

  searchByMood: async (mood: string, limit = 12) => {
    set({ searching: true, error: null })
    try {
      const results = await StickerService.SearchByMood(mood, limit)
      const list = results ?? []
      set({ results: list, searching: false })
      return list
    } catch (e: any) {
      set({ searching: false, error: e?.message || 'Search by mood failed' })
      return []
    }
  },

  downloadAndCache: async (url: string) => {
    try {
      return await StickerService.DownloadAndCache(url)
    } catch (e: any) {
      set({ error: e?.message || 'Download failed' })
      return ''
    }
  },

  refreshIndex: async () => {
    set({ loading: true, error: null })
    try {
      await StickerService.RefreshIndex()
      await get().loadStatus()
      await get().loadCategories()
    } catch (e: any) {
      set({ error: e?.message || 'Refresh failed' })
    } finally {
      set({ loading: false })
    }
  },

  clearCache: async () => {
    try {
      const count = await StickerService.ClearCache()
      await get().loadStatus()
      return count
    } catch (e: any) {
      set({ error: e?.message || 'Clear cache failed' })
      return 0
    }
  },

  initialize: async () => {
    set({ loading: true, error: null })
    try {
      await StickerService.Initialize()
      await Promise.all([
        get().loadStatus(),
        get().loadMoods(),
        get().loadCategories(),
      ])
    } catch (e: any) {
      set({ error: e?.message || 'Initialize failed' })
    } finally {
      set({ loading: false })
    }
  },
}))

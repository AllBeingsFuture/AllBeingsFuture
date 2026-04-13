/**
 * StickerService - Sticker search and caching
 * Replaces Go internal/services/sticker.go
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

interface StickerEntry {
  url: string
  keywords: string[]
  category: string
  mood: string
}

interface StickerStatus {
  ready: boolean
  totalCount: number
  categories: string[]
  moods: string[]
  lastRefresh: string
}

const CACHE_DIR = path.join(os.homedir(), '.allbeingsfuture', 'stickers')

export class StickerService {
  private index: StickerEntry[] = []
  private cacheDir = CACHE_DIR
  private ready = false
  private lastRefresh = ''

  async initialize(): Promise<void> {
    fs.mkdirSync(this.cacheDir, { recursive: true })
    this.ready = true
  }

  search(query: string, category?: string, limit: number = 10): StickerEntry[] {
    let results = this.index

    if (category) {
      results = results.filter(s => s.category === category)
    }

    if (query) {
      const q = query.toLowerCase()
      results = results.filter(s =>
        s.keywords.some(k => k.toLowerCase().includes(q)) ||
        s.category.toLowerCase().includes(q) ||
        s.mood.toLowerCase().includes(q)
      )
    }

    return results.slice(0, limit)
  }

  searchByMood(mood: string, limit: number = 10): StickerEntry[] {
    return this.index.filter(s => s.mood === mood).slice(0, limit)
  }

  getCategories(): string[] {
    return [...new Set(this.index.map(s => s.category))]
  }

  getMoods(): string[] {
    return [...new Set(this.index.map(s => s.mood))]
  }

  getStatus(): StickerStatus {
    return {
      ready: this.ready,
      totalCount: this.index.length,
      categories: this.getCategories(),
      moods: this.getMoods(),
      lastRefresh: this.lastRefresh,
    }
  }

  async downloadAndCache(url: string): Promise<string> {
    // In Electron, we'd use net.request or fetch
    try {
      const response = await fetch(url)
      const buffer = Buffer.from(await response.arrayBuffer())
      const filename = path.basename(new URL(url).pathname) || 'sticker.png'
      const cachePath = path.join(this.cacheDir, filename)
      fs.writeFileSync(cachePath, buffer)
      return cachePath
    } catch (err: any) {
      throw new Error(`Failed to download sticker: ${err.message}`)
    }
  }

  async refreshIndex(): Promise<void> {
    // Would fetch remote sticker index
    this.lastRefresh = new Date().toISOString()
  }

  clearCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir)
      for (const file of files) {
        fs.unlinkSync(path.join(this.cacheDir, file))
      }
    } catch {}
  }
}

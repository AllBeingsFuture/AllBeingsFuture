/**
 * Telegram 状态 Store
 *
 * 管理 Telegram 机器人配置、状态、AI 提供商和白名单。
 * 后端 API 通过 Electron IPC 调用。
 */

import { create } from 'zustand'
import { TelegramService } from '../../bindings/allbeingsfuture/internal/services'

type TelegramBotStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface TelegramAllowedUser {
  userId: number
  username?: string
  displayName?: string
  role?: string
}

export interface TelegramAIProvider {
  id: string
  name: string
  type?: string
  enabled?: boolean
  apiEndpoint?: string
  apiKey?: string
  model?: string
  maxTokens?: number
  priority?: number
  providerId?: string
  config?: Record<string, unknown>
}

export interface TelegramAPILog {
  id: string
  apiName: string
  userId?: number
  timestamp: string
  success: boolean
  error?: string
}

interface TelegramState {
  botStatus: TelegramBotStatus
  config: Record<string, string>
  aiProviders: TelegramAIProvider[]
  allowedUsers: TelegramAllowedUser[]
  apiLogs: TelegramAPILog[]
  settingsOpen: boolean

  setSettingsOpen: (open: boolean) => void
  fetchConfig: () => Promise<void>
  updateConfig: (key: string, value: string) => Promise<void>
  fetchStatus: () => Promise<void>
  restartBot: () => Promise<{ success: boolean; error?: string }>
  fetchAIProviders: () => Promise<void>
  addAIProvider: (provider: TelegramAIProvider) => Promise<{ success: boolean; error?: string }>
  updateAIProvider: (id: string, updates: Partial<TelegramAIProvider>) => Promise<{ success: boolean; error?: string }>
  deleteAIProvider: (id: string) => Promise<{ success: boolean; error?: string }>
  testAIProvider: (provider: Partial<TelegramAIProvider>) => Promise<{ success: boolean; error?: string }>
  fetchAllowedUsers: () => Promise<void>
  addAllowedUser: (userId: number, username?: string, displayName?: string, role?: string) => Promise<{ success: boolean; error?: string }>
  removeAllowedUser: (userId: number) => Promise<{ success: boolean; error?: string }>
  fetchAPILogs: () => Promise<void>
}

export const useTelegramStore = create<TelegramState>((set, get) => ({
  botStatus: 'stopped',
  config: {},
  aiProviders: [],
  allowedUsers: [],
  apiLogs: [],
  settingsOpen: false,

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  fetchConfig: async () => {
    try {
      const config = await TelegramService.GetConfig() as Record<string, string> | null
      set({ config: config || {} })
    } catch { /* ignore */ }
  },

  updateConfig: async (key, value) => {
    try {
      await TelegramService.UpdateConfig(key, value)
      set((s) => ({ config: { ...s.config, [key]: value } }))
    } catch { /* ignore */ }
  },

  fetchStatus: async () => {
    try {
      const status = await TelegramService.Status() as { running?: boolean } | null
      set({ botStatus: status?.running ? 'running' : 'stopped' })
    } catch { /* ignore */ }
  },

  restartBot: async () => {
    try {
      const result = await TelegramService.Restart() as { success: boolean; error?: string } | null
      if (result?.success) set({ botStatus: 'running' })
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  // AI Provider methods
  fetchAIProviders: async () => {
    try {
      const providers = await TelegramService.GetAIProviders() as TelegramAIProvider[] | null
      set({ aiProviders: providers || [] })
    } catch { /* ignore */ }
  },

  addAIProvider: async (provider) => {
    try {
      const result = await TelegramService.AddAIProvider(
        provider.id, provider.name || '', provider.apiEndpoint || '',
        provider.apiKey || '', provider.model || '',
        provider.maxTokens || 4096, provider.priority || 0,
      ) as { success: boolean; error?: string } | null
      if (result?.success) await get().fetchAIProviders()
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  updateAIProvider: async (id, updates) => {
    try {
      const result = await TelegramService.UpdateAIProvider(id, JSON.stringify(updates)) as { success: boolean; error?: string } | null
      if (result?.success) await get().fetchAIProviders()
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  deleteAIProvider: async (id) => {
    try {
      const result = await TelegramService.DeleteAIProvider(id) as { success: boolean; error?: string } | null
      if (result?.success) await get().fetchAIProviders()
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  testAIProvider: async () => { return { success: false, error: 'Not implemented' } },

  fetchAllowedUsers: async () => {
    try {
      const users = await TelegramService.GetAllowedUsers() as TelegramAllowedUser[] | null
      set({ allowedUsers: users || [] })
    } catch { /* ignore */ }
  },

  addAllowedUser: async (userId, username, _displayName, role) => {
    try {
      const result = await TelegramService.AddAllowedUser(userId, username || '', role || 'admin') as { success: boolean; error?: string } | null
      if (result?.success) await get().fetchAllowedUsers()
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  removeAllowedUser: async (userId) => {
    try {
      const result = await TelegramService.RemoveAllowedUser(userId) as { success: boolean; error?: string } | null
      if (result?.success) await get().fetchAllowedUsers()
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  // API Logs — 后端暂不支持，保留空实现
  fetchAPILogs: async () => { return },
}))

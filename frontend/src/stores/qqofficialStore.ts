/**
 * QQ 官方机器人状态 Store
 *
 * 管理 QQ 开放平台官方 Bot API 配置和状态。
 * 后端 API 通过 Electron IPC 调用。
 */

import { create } from 'zustand'
import { QQOfficialService } from '../../bindings/allbeingsfuture/internal/services'

type QQOfficialStatus = 'stopped' | 'starting' | 'running' | 'error'

interface QQOfficialState {
  botStatus: QQOfficialStatus
  config: Record<string, string>

  fetchConfig: () => Promise<void>
  updateConfig: (key: string, value: string) => Promise<void>
  fetchStatus: () => Promise<void>
  restartBot: () => Promise<{ success: boolean; error?: string }>
}

export const useQQOfficialStore = create<QQOfficialState>((set) => ({
  botStatus: 'stopped',
  config: {},

  fetchConfig: async () => {
    try {
      const config = await QQOfficialService.GetConfig() as Record<string, string> | null
      set({ config: config || {} })
    } catch { /* ignore */ }
  },

  updateConfig: async (key, value) => {
    try {
      await QQOfficialService.UpdateConfig(key, value)
      set((s) => ({ config: { ...s.config, [key]: value } }))
    } catch { /* ignore */ }
  },

  fetchStatus: async () => {
    try {
      const status = await QQOfficialService.Status() as { running?: boolean } | null
      set({ botStatus: status?.running ? 'running' : 'stopped' })
    } catch { /* ignore */ }
  },

  restartBot: async () => {
    try {
      const result = await QQOfficialService.Restart() as { success: boolean; error?: string } | null
      if (result?.success) set({ botStatus: 'running' })
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}))

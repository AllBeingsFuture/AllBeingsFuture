import { create } from 'zustand'
import { ProactiveService } from '../../bindings/allbeingsfuture/internal/services'
import type { models } from '../../bindings/allbeingsfuture/internal'

interface ProactiveState {
  config: models.ProactiveConfig | null
  status: models.ProactiveStatus | null
  records: models.ProactiveRecord[]
  loading: boolean

  // 加载配置
  loadConfig: () => Promise<void>
  // 设置配置
  setConfig: (config: models.ProactiveConfig) => Promise<void>
  // 启用/禁用
  setEnabled: (enabled: boolean) => Promise<void>
  // 加载状态
  loadStatus: () => Promise<void>
  // 记录用户交互
  updateUserInteraction: () => Promise<void>
  // 手动触发心跳
  heartbeat: () => Promise<models.ProactiveHeartbeatResult | null>
  // 处理用户响应
  processResponse: (text: string, delayMinutes: number) => Promise<void>
  // 加载历史记录
  loadRecords: (limit: number) => Promise<void>
}

export const useProactiveStore = create<ProactiveState>((set, get) => ({
  config: null,
  status: null,
  records: [],
  loading: false,

  loadConfig: async () => {
    try {
      const config = await ProactiveService.GetConfig()
      set({ config })
    } catch (e) {
      console.error('[proactiveStore] loadConfig failed:', e)
    }
  },

  setConfig: async (config) => {
    try {
      await ProactiveService.SetConfig(config)
      set({ config })
    } catch (e) {
      console.error('[proactiveStore] setConfig failed:', e)
    }
  },

  setEnabled: async (enabled) => {
    try {
      await ProactiveService.SetEnabled(enabled)
      const current = get().config
      if (current) {
        set({ config: { ...current, enabled } })
      }
    } catch (e) {
      console.error('[proactiveStore] setEnabled failed:', e)
    }
  },

  loadStatus: async () => {
    set({ loading: true })
    try {
      const status = await ProactiveService.GetStatus()
      set({ status })
    } catch (e) {
      console.error('[proactiveStore] loadStatus failed:', e)
    } finally {
      set({ loading: false })
    }
  },

  updateUserInteraction: async () => {
    try {
      await ProactiveService.UpdateUserInteraction()
    } catch (e) {
      // silent
    }
  },

  heartbeat: async () => {
    try {
      return await ProactiveService.Heartbeat()
    } catch (e) {
      console.error('[proactiveStore] heartbeat failed:', e)
      return null
    }
  },

  processResponse: async (text, delayMinutes) => {
    try {
      await ProactiveService.ProcessUserResponse(text, delayMinutes)
      await get().loadStatus()
    } catch (e) {
      console.error('[proactiveStore] processResponse failed:', e)
    }
  },

  loadRecords: async (limit) => {
    try {
      const records = await ProactiveService.GetRecords(limit)
      set({ records: records ?? [] })
    } catch (e) {
      console.error('[proactiveStore] loadRecords failed:', e)
    }
  },
}))

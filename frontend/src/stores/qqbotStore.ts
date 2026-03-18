/**
 * QQ Bot 状态 Store
 *
 * 管理 QQ 机器人配置、状态、授权用户和授权群组。
 * 后端 API 通过 Electron IPC 调用。
 */

import { create } from 'zustand'
import { QQBotService } from '../../bindings/allbeingsfuture/internal/services'

type QQBotStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface QQBotAllowedUser {
  userId: number
  nickname?: string
  displayName?: string
  role?: string
}

export interface QQBotAllowedGroup {
  groupId: number
  groupName?: string
  role?: string
}

interface QQBotState {
  botStatus: QQBotStatus
  config: Record<string, string>
  allowedUsers: QQBotAllowedUser[]
  allowedGroups: QQBotAllowedGroup[]

  fetchConfig: () => Promise<void>
  updateConfig: (key: string, value: string) => Promise<void>
  fetchStatus: () => Promise<void>
  restartBot: () => Promise<{ success: boolean; error?: string }>
  fetchAllowedUsers: () => Promise<void>
  addAllowedUser: (userId: number, nickname?: string, role?: string) => Promise<{ success: boolean; error?: string }>
  removeAllowedUser: (userId: number) => Promise<{ success: boolean; error?: string }>
  fetchAllowedGroups: () => Promise<void>
  addAllowedGroup: (groupId: number, groupName?: string, role?: string) => Promise<{ success: boolean; error?: string }>
  removeAllowedGroup: (groupId: number) => Promise<{ success: boolean; error?: string }>
}

export const useQQBotStore = create<QQBotState>((set, get) => ({
  botStatus: 'stopped',
  config: {},
  allowedUsers: [],
  allowedGroups: [],

  fetchConfig: async () => {
    try {
      const config = await QQBotService.GetConfig() as Record<string, string> | null
      set({ config: config || {} })
    } catch { /* ignore */ }
  },

  updateConfig: async (key, value) => {
    try {
      await QQBotService.UpdateConfig(key, value)
      set((s) => ({ config: { ...s.config, [key]: value } }))
    } catch { /* ignore */ }
  },

  fetchStatus: async () => {
    try {
      const status = await QQBotService.Status() as { running?: boolean } | null
      set({ botStatus: status?.running ? 'running' : 'stopped' })
    } catch { /* ignore */ }
  },

  restartBot: async () => {
    try {
      const result = await QQBotService.Restart() as { success: boolean; error?: string } | null
      if (result?.success) set({ botStatus: 'running' })
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  fetchAllowedUsers: async () => {
    try {
      const users = await QQBotService.GetAllowedUsers() as QQBotAllowedUser[] | null
      set({ allowedUsers: users || [] })
    } catch { /* ignore */ }
  },

  addAllowedUser: async (userId, nickname, role) => {
    try {
      const result = await QQBotService.AddAllowedUser(userId, nickname || '', role || 'admin') as { success: boolean; error?: string } | null
      if (result?.success) await get().fetchAllowedUsers()
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  removeAllowedUser: async (userId) => {
    try {
      const result = await QQBotService.RemoveAllowedUser(userId) as { success: boolean; error?: string } | null
      if (result?.success) await get().fetchAllowedUsers()
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  fetchAllowedGroups: async () => {
    try {
      const groups = await QQBotService.GetAllowedGroups() as QQBotAllowedGroup[] | null
      set({ allowedGroups: groups || [] })
    } catch { /* ignore */ }
  },

  addAllowedGroup: async (groupId, groupName, role) => {
    try {
      const result = await QQBotService.AddAllowedGroup(groupId, groupName || '', role || 'admin') as { success: boolean; error?: string } | null
      if (result?.success) await get().fetchAllowedGroups()
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  removeAllowedGroup: async (groupId) => {
    try {
      const result = await QQBotService.RemoveAllowedGroup(groupId) as { success: boolean; error?: string } | null
      if (result?.success) await get().fetchAllowedGroups()
      return result || { success: false, error: 'No response' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}))

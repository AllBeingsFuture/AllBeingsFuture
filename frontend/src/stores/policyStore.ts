import { create } from 'zustand'
import { PolicyService } from '../../bindings/allbeingsfuture/internal/services'
import type {
  PolicyAuditEntry,
  PolicyConfig,
  ScopePolicyRule,
  ToolPolicyRule,
} from '../../bindings/allbeingsfuture/internal/models/models'

export type { ToolPolicyRule, ScopePolicyRule, PolicyConfig, PolicyAuditEntry }

interface PolicyState {
  config: PolicyConfig | null
  auditLog: PolicyAuditEntry[]
  loading: boolean
  error: string | null

  // Actions
  loadConfig: () => Promise<void>
  updateConfig: (config: PolicyConfig) => Promise<void>
  setAutoConfirm: (auto: boolean) => Promise<void>
  addBlockedCommand: (cmd: string) => Promise<void>
  removeBlockedCommand: (cmd: string) => Promise<void>
  addBlockedPath: (pattern: string) => Promise<void>
  removeBlockedPath: (pattern: string) => Promise<void>
  addDangerousPattern: (toolName: string, pattern: string) => Promise<void>
  loadAuditLog: (limit?: number) => Promise<void>
  clearAuditLog: () => Promise<void>
  reloadConfig: () => Promise<void>
}

export const usePolicyStore = create<PolicyState>((set, get) => ({
  config: null,
  auditLog: [],
  loading: false,
  error: null,

  loadConfig: async () => {
    set({ loading: true, error: null })
    try {
      const config = await PolicyService.GetConfig()
      set({ config, loading: false })
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Failed to load policy config' })
    }
  },

  updateConfig: async (config: PolicyConfig) => {
    try {
      await PolicyService.UpdateConfig(config)
      set({ config })
    } catch (e: any) {
      set({ error: e?.message || 'Failed to update policy config' })
    }
  },

  setAutoConfirm: async (auto: boolean) => {
    try {
      await PolicyService.SetAutoConfirm(auto)
      const { config } = get()
      if (config) {
        set({ config: { ...config, autoConfirm: auto } })
      }
    } catch (e: any) {
      set({ error: e?.message || 'Failed to set auto confirm' })
    }
  },

  addBlockedCommand: async (cmd: string) => {
    try {
      await PolicyService.AddBlockedCommand(cmd)
      await get().loadConfig()
    } catch (e: any) {
      set({ error: e?.message || 'Failed to add blocked command' })
    }
  },

  removeBlockedCommand: async (cmd: string) => {
    try {
      await PolicyService.RemoveBlockedCommand(cmd)
      await get().loadConfig()
    } catch (e: any) {
      set({ error: e?.message || 'Failed to remove blocked command' })
    }
  },

  addBlockedPath: async (pattern: string) => {
    try {
      await PolicyService.AddBlockedPath(pattern)
      await get().loadConfig()
    } catch (e: any) {
      set({ error: e?.message || 'Failed to add blocked path' })
    }
  },

  removeBlockedPath: async (pattern: string) => {
    try {
      await PolicyService.RemoveBlockedPath(pattern)
      await get().loadConfig()
    } catch (e: any) {
      set({ error: e?.message || 'Failed to remove blocked path' })
    }
  },

  addDangerousPattern: async (toolName: string, pattern: string) => {
    try {
      await PolicyService.AddDangerousPattern(toolName, pattern)
      await get().loadConfig()
    } catch (e: any) {
      set({ error: e?.message || 'Failed to add dangerous pattern' })
    }
  },

  loadAuditLog: async (limit = 100) => {
    try {
      const auditLog = await PolicyService.GetAuditLog(limit)
      set({ auditLog: auditLog ?? [] })
    } catch (e: any) {
      set({ error: e?.message || 'Failed to load audit log' })
    }
  },

  clearAuditLog: async () => {
    try {
      await PolicyService.ClearAuditLog()
      set({ auditLog: [] })
    } catch (e: any) {
      set({ error: e?.message || 'Failed to clear audit log' })
    }
  },

  reloadConfig: async () => {
    try {
      await PolicyService.ReloadConfig()
      await get().loadConfig()
    } catch (e: any) {
      set({ error: e?.message || 'Failed to reload config' })
    }
  },
}))

import { create } from 'zustand'
import { SupervisorService } from '../../bindings/allbeingsfuture/internal/services'
import type { models } from '../../bindings/allbeingsfuture/internal'

interface SupervisorState {
  // 每个会话的监督状态
  statuses: Record<string, models.SupervisorStatus>
  // 所有活跃会话的监督状态列表
  allStatuses: models.SupervisorStatus[]
  loading: boolean

  // 加载单个会话的监督状态
  loadStatus: (sessionId: string) => Promise<void>
  // 加载所有活跃会话的监督状态
  loadAllStatuses: () => Promise<void>
  // 启动会话监督
  startSession: (sessionId: string) => Promise<void>
  // 停止会话监督
  stopSession: (sessionId: string) => Promise<void>
  // 启用/禁用监督
  setEnabled: (sessionId: string, enabled: boolean) => Promise<void>
  // 设置资源预算
  setBudgetConfig: (sessionId: string, config: models.ResourceBudgetConfig) => Promise<void>
  // 检查资源预算
  checkBudget: (sessionId: string) => Promise<models.BudgetStatus | null>
  // 检查工具是否允许
  assertToolAllowed: (sessionId: string, toolName: string, params: string) => Promise<models.PolicyResult | null>
  // 获取监督事件
  getEvents: (sessionId: string) => Promise<models.SupervisionEvent[]>
  // 重置会话监督
  resetSession: (sessionId: string) => Promise<void>
}

export const useSupervisorStore = create<SupervisorState>((set, get) => ({
  statuses: {},
  allStatuses: [],
  loading: false,

  loadStatus: async (sessionId) => {
    try {
      const status = await SupervisorService.GetStatus(sessionId)
      set(s => ({
        statuses: { ...s.statuses, [sessionId]: status },
      }))
    } catch (e) {
      console.error('[supervisorStore] loadStatus failed:', e)
    }
  },

  loadAllStatuses: async () => {
    set({ loading: true })
    try {
      const statuses = await SupervisorService.GetAllStatuses()
      const statusMap: Record<string, models.SupervisorStatus> = {}
      for (const s of statuses ?? []) {
        statusMap[s.sessionId] = s
      }
      set({ allStatuses: statuses ?? [], statuses: statusMap })
    } catch (e) {
      console.error('[supervisorStore] loadAllStatuses failed:', e)
    } finally {
      set({ loading: false })
    }
  },

  startSession: async (sessionId) => {
    try {
      await SupervisorService.StartSession(sessionId)
      await get().loadStatus(sessionId)
    } catch (e) {
      console.error('[supervisorStore] startSession failed:', e)
    }
  },

  stopSession: async (sessionId) => {
    try {
      await SupervisorService.StopSession(sessionId)
      set(s => {
        const { [sessionId]: _, ...rest } = s.statuses
        return { statuses: rest }
      })
    } catch (e) {
      console.error('[supervisorStore] stopSession failed:', e)
    }
  },

  setEnabled: async (sessionId, enabled) => {
    try {
      await SupervisorService.SetEnabled(sessionId, enabled)
      await get().loadStatus(sessionId)
    } catch (e) {
      console.error('[supervisorStore] setEnabled failed:', e)
    }
  },

  setBudgetConfig: async (sessionId, config) => {
    try {
      await SupervisorService.SetBudgetConfig(sessionId, config)
      await get().loadStatus(sessionId)
    } catch (e) {
      console.error('[supervisorStore] setBudgetConfig failed:', e)
    }
  },

  checkBudget: async (sessionId) => {
    try {
      return await SupervisorService.CheckBudget(sessionId)
    } catch (e) {
      console.error('[supervisorStore] checkBudget failed:', e)
      return null
    }
  },

  assertToolAllowed: async (sessionId, toolName, params) => {
    try {
      return await SupervisorService.AssertToolAllowed(sessionId, toolName, params)
    } catch (e) {
      console.error('[supervisorStore] assertToolAllowed failed:', e)
      return null
    }
  },

  getEvents: async (sessionId) => {
    try {
      return await SupervisorService.GetEvents(sessionId) ?? []
    } catch (e) {
      console.error('[supervisorStore] getEvents failed:', e)
      return []
    }
  },

  resetSession: async (sessionId) => {
    try {
      await SupervisorService.ResetSession(sessionId)
      await get().loadStatus(sessionId)
    } catch (e) {
      console.error('[supervisorStore] resetSession failed:', e)
    }
  },
}))

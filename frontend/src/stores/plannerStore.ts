/**
 * 自主规划状态管理 Store
 *
 * 管理规划的启动、取消、进度追踪和事件监听。
 * 后端 API 通过 window.allBeingsFuture.planner 调用（待实现）。
 */

import { create } from 'zustand'

export interface PlanProgress {
  completed: number
  total: number
  currentSubtask: string
}

export interface ActivePlan {
  id: string
  goal: string
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled'
  progress?: PlanProgress
  summary?: string
  error?: string
}

interface PlannerState {
  activePlans: ActivePlan[]
  starting: boolean

  startPlan: (goal: string, workDir: string) => Promise<{ success: boolean; planId?: string; error?: string }>
  cancelPlan: (planId: string) => Promise<boolean>
  fetchActivePlans: () => Promise<void>
  initListeners: () => () => void
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  activePlans: [],
  starting: false,

  startPlan: async (goal, workDir) => {
    set({ starting: true })
    try {
      const api = (window as any).allBeingsFuture?.planner
      if (!api?.start) return { success: false, error: 'API not available' }

      const result = await api.start(goal, workDir)
      if (result.success && result.planId) {
        set((state) => ({
          activePlans: [
            ...state.activePlans,
            { id: result.planId!, goal, status: 'planning' as const }
          ]
        }))
      }
      return result
    } catch (err: any) {
      return { success: false, error: err.message || '启动规划失败' }
    } finally {
      set({ starting: false })
    }
  },

  cancelPlan: async (planId) => {
    try {
      const api = (window as any).allBeingsFuture?.planner
      if (!api?.cancel) return false

      const result = await api.cancel(planId)
      if (result.success) {
        set((state) => ({
          activePlans: state.activePlans.map(p =>
            p.id === planId ? { ...p, status: 'cancelled' as const } : p
          )
        }))
      }
      return result.success
    } catch {
      return false
    }
  },

  fetchActivePlans: async () => {
    try {
      const api = (window as any).allBeingsFuture?.planner
      if (!api?.getActive) return

      const plans = await api.getActive()
      set({
        activePlans: plans.map((p: any) => ({
          id: p.id,
          goal: p.goal,
          status: p.status,
          progress: p.subtasks ? {
            completed: Object.values(p.subtaskStates as Record<string, any>).filter((s: any) => s.status === 'completed').length,
            total: p.subtasks.length,
            currentSubtask: ''
          } : undefined
        }))
      })
    } catch (err) {
      console.error('[PlannerStore] Failed to fetch active plans:', err)
    }
  },

  initListeners: () => {
    const api = (window as any).allBeingsFuture?.planner
    if (!api) return () => {}

    const unsubProgress = api.onProgress?.((planId: string, progress: PlanProgress) => {
      set((state) => ({
        activePlans: state.activePlans.map(p =>
          p.id === planId ? { ...p, status: 'executing' as const, progress } : p
        )
      }))
    }) ?? (() => {})

    const unsubCompleted = api.onCompleted?.((planId: string, summary: string) => {
      set((state) => ({
        activePlans: state.activePlans.map(p =>
          p.id === planId ? { ...p, status: 'completed' as const, summary } : p
        )
      }))
    }) ?? (() => {})

    const unsubFailed = api.onFailed?.((planId: string, error: string) => {
      set((state) => ({
        activePlans: state.activePlans.map(p =>
          p.id === planId ? { ...p, status: 'failed' as const, error } : p
        )
      }))
    }) ?? (() => {})

    get().fetchActivePlans()

    return () => {
      unsubProgress()
      unsubCompleted()
      unsubFailed()
    }
  }
}))

export default usePlannerStore

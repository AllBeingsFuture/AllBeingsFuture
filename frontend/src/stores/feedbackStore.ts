/**
 * Bug 反馈 Store
 *
 * 管理 Bug 反馈的列表、详情、创建和评论。
 * 后端 API 通过 window.allBeingsFuture.feedback 调用（待实现）。
 */

import { create } from 'zustand'

export type FeedbackModule = 'session' | 'terminal' | 'file' | 'team' | 'other'
export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical'
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface FeedbackItem {
  id: number
  title: string
  description: string
  module: FeedbackModule
  severity: FeedbackSeverity
  status: FeedbackStatus
  createdAt: string
  updatedAt: string
  comments?: FeedbackComment[]
}

export interface FeedbackComment {
  id: number
  content: string
  createdAt: string
}

export interface FeedbackListParams {
  page?: number
  limit?: number
  module?: FeedbackModule
  severity?: FeedbackSeverity
  status?: FeedbackStatus
}

export interface CreateFeedbackParams {
  title: string
  description: string
  module: FeedbackModule
  severity: FeedbackSeverity
}

interface FeedbackAPIResult {
  success: boolean
  data?: Record<string, unknown>
  error?: { message?: string }
}

type FeedbackAPI = Record<string, (...args: unknown[]) => Promise<FeedbackAPIResult>>

function getFeedbackAPI(): FeedbackAPI | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).allBeingsFuture?.feedback
}

interface FeedbackState {
  items: FeedbackItem[]
  total: number
  page: number
  pages: number
  isLoading: boolean
  currentDetail: FeedbackItem | null
  isDetailLoading: boolean
  filters: {
    module?: FeedbackModule
    severity?: FeedbackSeverity
    status?: FeedbackStatus
  }

  loadList: (params?: FeedbackListParams) => Promise<void>
  loadDetail: (id: number) => Promise<void>
  createFeedback: (params: CreateFeedbackParams) => Promise<{ success: boolean; error?: string }>
  addComment: (feedbackId: number, content: string) => Promise<{ success: boolean; error?: string }>
  uploadImage: (imagePath: string, feedbackId?: number) => Promise<{ success: boolean; data?: unknown; error?: string }>
  setFilters: (filters: Partial<FeedbackState['filters']>) => void
  setPage: (page: number) => void
  clearDetail: () => void
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pages: 0,
  isLoading: false,
  currentDetail: null,
  isDetailLoading: false,
  filters: {},

  loadList: async (params) => {
    set({ isLoading: true })
    try {
      const api = getFeedbackAPI()
      if (!api?.list) return

      const { filters, page } = get()
      const result = await api.list({
        ...filters,
        page: params?.page ?? page,
        limit: params?.limit ?? 20,
        ...params,
      })
      if (result?.success && result.data) {
        const data = result.data as { items: FeedbackItem[]; total: number; page: number; pages: number }
        set({
          items: data.items,
          total: data.total,
          page: data.page,
          pages: data.pages,
        })
      }
    } catch (err) {
      console.error('[FeedbackStore] loadList failed:', err)
    } finally {
      set({ isLoading: false })
    }
  },

  loadDetail: async (id) => {
    set({ isDetailLoading: true })
    try {
      const api = getFeedbackAPI()
      if (!api?.getDetail) return

      const result = await api.getDetail(id)
      if (result?.success && result.data) {
        set({ currentDetail: result.data as unknown as FeedbackItem })
      }
    } catch (err) {
      console.error('[FeedbackStore] loadDetail failed:', err)
    } finally {
      set({ isDetailLoading: false })
    }
  },

  createFeedback: async (params) => {
    try {
      const api = getFeedbackAPI()
      if (!api?.create) return { success: false, error: 'API not available' }

      const result = await api.create(params as unknown as Record<string, unknown>)
      if (result?.success) {
        await get().loadList()
        return { success: true }
      }
      return { success: false, error: result?.error?.message || '提交失败' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : '提交失败' }
    }
  },

  addComment: async (feedbackId, content) => {
    try {
      const api = getFeedbackAPI()
      if (!api?.addComment) return { success: false, error: 'API not available' }

      const result = await api.addComment(feedbackId, content)
      if (result?.success) {
        await get().loadDetail(feedbackId)
        return { success: true }
      }
      return { success: false, error: result?.error?.message || '评论失败' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : '评论失败' }
    }
  },

  uploadImage: async (imagePath, feedbackId) => {
    try {
      const api = getFeedbackAPI()
      if (!api?.uploadImage) return { success: false, error: 'API not available' }

      const result = await api.uploadImage(imagePath, feedbackId)
      if (result?.success) {
        return { success: true, data: result.data }
      }
      return { success: false, error: result?.error?.message || '上传失败' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : '上传失败' }
    }
  },

  setFilters: (newFilters) => {
    set((s) => ({ filters: { ...s.filters, ...newFilters }, page: 1 }))
  },

  setPage: (page) => set({ page }),

  clearDetail: () => set({ currentDetail: null }),
}))

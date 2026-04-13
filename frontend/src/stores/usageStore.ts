/**
 * Token Usage Data Store
 * Fetches usage statistics via UsageService binding for the UsageDashboard.
 */

import { create } from 'zustand'
import { UsageService } from '../../bindings/allbeingsfuture/internal/services'
import type {
  UsageSummary,
  DailyStat,
  SessionUsageStat,
} from '../types/usageTypes'

interface UsageState {
  summary: UsageSummary | null
  dailyStats: DailyStat[]
  sessionStats: SessionUsageStat[]
  loading: boolean
  error: string | null

  /** Fetch usage summary + history data (days: number of days to query) */
  fetchUsage: (days?: number) => Promise<void>
}

export const useUsageStore = create<UsageState>((set) => ({
  summary: null,
  dailyStats: [],
  sessionStats: [],
  loading: false,
  error: null,

  fetchUsage: async (days = 30) => {
    set({ loading: true, error: null })
    try {
      const [summaryData, historyData] = await Promise.all([
        UsageService.GetSummary().catch(() => null),
        UsageService.GetHistory(days).catch(() => null),
      ])

      set({
        summary: summaryData ?? null,
        dailyStats: historyData?.dailyStats ?? [],
        sessionStats: historyData?.sessionStats ?? [],
      })
    } catch (err) {
      console.error('[usageStore] fetchUsage error:', err)
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },
}))

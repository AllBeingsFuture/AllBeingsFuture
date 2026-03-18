/**
 * 全局搜索/替换状态 Store
 * 管理搜索查询、结果、替换操作等状态
 * @author weibin
 */

import { create } from 'zustand'
import type {
  SearchInFilesOptions,
  SearchResult,
  FileSearchResult,
  ReplaceResult,
} from '../types/searchTypes'

// ─────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────

export interface SearchState {
  /** 搜索关键词 */
  query: string
  /** 替换关键词 */
  replaceValue: string
  /** 是否使用正则 */
  isRegex: boolean
  /** 是否大小写敏感 */
  caseSensitive: boolean
  /** 是否整词匹配 */
  wholeWord: boolean
  /** glob 过滤 */
  glob: string
  /** 是否显示替换面板 */
  showReplace: boolean

  /** 搜索结果 */
  result: SearchResult | null
  /** 替换结果（上一次替换操作的摘要） */
  replaceResult: ReplaceResult | null
  /** 是否正在搜索 */
  isSearching: boolean
  /** 是否正在替换 */
  isReplacing: boolean
  /** 搜索错误 */
  error: string | null

  /** 结果中已展开的文件路径集合 */
  expandedFiles: Set<string>

  // ── Actions ────────────────────────────────────────────
  setQuery: (query: string) => void
  setReplaceValue: (value: string) => void
  setIsRegex: (value: boolean) => void
  setCaseSensitive: (value: boolean) => void
  setWholeWord: (value: boolean) => void
  setGlob: (value: string) => void
  toggleShowReplace: () => void

  /** 执行搜索 */
  search: (rootPath: string) => Promise<void>
  /** 清除搜索结果 */
  clearResult: () => void
  /** 执行全部替换 */
  replaceAll: (rootPath: string) => Promise<void>
  /** 替换单个文件中的所有匹配 */
  replaceInFile: (rootPath: string, filePath: string) => Promise<void>

  /** 切换文件展开状态 */
  toggleFileExpand: (filePath: string) => void
  /** 展开所有文件 */
  expandAllFiles: () => void
  /** 折叠所有文件 */
  collapseAllFiles: () => void

  /** 从结果中移除单个文件（用于替换后从列表移除） */
  dismissFile: (filePath: string) => void
}

// ─────────────────────────────────────────────────────────
// IPC API
// ─────────────────────────────────────────────────────────

const fileManagerApi = () => (window as any).allBeingsFuture?.fileManager

// ─────────────────────────────────────────────────────────
// Store 实现
// ─────────────────────────────────────────────────────────

export const useSearchStore = create<SearchState>((set, get) => ({
  // 初始状态
  query: '',
  replaceValue: '',
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  glob: '',
  showReplace: false,

  result: null,
  replaceResult: null,
  isSearching: false,
  isReplacing: false,
  error: null,

  expandedFiles: new Set(),

  // ── Setters ────────────────────────────────────────────

  setQuery: (query) => set({ query }),
  setReplaceValue: (value) => set({ replaceValue: value }),
  setIsRegex: (value) => set({ isRegex: value }),
  setCaseSensitive: (value) => set({ caseSensitive: value }),
  setWholeWord: (value) => set({ wholeWord: value }),
  setGlob: (value) => set({ glob: value }),
  toggleShowReplace: () => set((s) => ({ showReplace: !s.showReplace })),

  // ── 搜索 ──────────────────────────────────────────────

  search: async (rootPath: string) => {
    const { query, isRegex, caseSensitive, wholeWord, glob } = get()
    if (!query.trim()) {
      set({ result: null, error: null })
      return
    }

    const options: SearchInFilesOptions = {
      query: query.trim(),
      rootPath,
      isRegex,
      caseSensitive,
      wholeWord,
      maxResults: 5000,
      contextLines: 1,
    }
    if (glob.trim()) {
      options.glob = glob.trim().split(',').map(g => g.trim()).filter(Boolean)
    }

    set({ isSearching: true, error: null, replaceResult: null })

    try {
      const api = fileManagerApi()
      if (!api?.searchInFiles) {
        set({ isSearching: false, error: '搜索 API 不可用（后端尚未实现）' })
        return
      }
      const res = await api.searchInFiles(options)
      if (!res.success || !res.data) {
        set({ isSearching: false, error: res.error ?? '搜索失败' })
        return
      }
      const result: SearchResult = res.data

      // 默认展开前 20 个文件
      const expanded = new Set<string>()
      for (let i = 0; i < Math.min(result.files.length, 20); i++) {
        expanded.add(result.files[i].filePath)
      }

      set({ result, isSearching: false, expandedFiles: expanded })
    } catch (e: any) {
      set({ isSearching: false, error: String(e?.message ?? e) })
    }
  },

  clearResult: () => set({
    result: null,
    replaceResult: null,
    error: null,
    expandedFiles: new Set(),
  }),

  // ── 替换 ──────────────────────────────────────────────

  replaceAll: async (rootPath: string) => {
    const { query, replaceValue, isRegex, caseSensitive, wholeWord, glob } = get()
    if (!query.trim()) return

    const options = {
      query: query.trim(),
      rootPath,
      replaceValue,
      isRegex,
      caseSensitive,
      wholeWord,
      maxResults: 5000,
      glob: glob.trim() ? glob.trim().split(',').map(g => g.trim()).filter(Boolean) : undefined,
    }

    set({ isReplacing: true, error: null })

    try {
      const api = fileManagerApi()
      if (!api?.replaceInFiles) {
        set({ isReplacing: false, error: '替换 API 不可用（后端尚未实现）' })
        return
      }
      const res = await api.replaceInFiles(options)
      if (!res.success || !res.data) {
        set({ isReplacing: false, error: res.error ?? '替换失败' })
        return
      }
      const replaceResult: ReplaceResult = res.data
      set({
        isReplacing: false,
        replaceResult,
        result: null,       // 替换后清空搜索结果
      })

      // 替换后刷新已打开的 Tab
      refreshOpenTabs(replaceResult.files.map(f => f.filePath))
    } catch (e: any) {
      set({ isReplacing: false, error: String(e?.message ?? e) })
    }
  },

  replaceInFile: async (rootPath: string, filePath: string) => {
    const { query, replaceValue, isRegex, caseSensitive, wholeWord, result } = get()
    if (!query.trim() || !result) return

    const options = {
      query: query.trim(),
      // 限定只替换这一个文件：直接将文件绝对路径作为 rootPath，
      // ripgrep 会在该文件上搜索。不能把绝对路径传给 glob（glob 只接受模式）。
      rootPath: filePath,
      replaceValue,
      isRegex,
      caseSensitive,
      wholeWord,
      maxResults: 5000,
    }

    set({ isReplacing: true, error: null })

    try {
      const api = fileManagerApi()
      if (!api?.replaceInFiles) {
        set({ isReplacing: false, error: '替换 API 不可用（后端尚未实现）' })
        return
      }
      const res = await api.replaceInFiles(options)
      if (!res.success || !res.data) {
        set({ isReplacing: false, error: res.error ?? '替换失败' })
        return
      }
      const replaceRes: ReplaceResult = res.data

      // 判断该文件是否被完全成功替换（无 error、无 skip）
      const hasError = replaceRes.errors.some(e => e.filePath === filePath)
      const wasSkipped = replaceRes.skippedFiles.some(s => s.filePath === filePath)
      const fullySucceeded = replaceRes.totalReplacements > 0 && !hasError && !wasSkipped

      if (fullySucceeded) {
        // 完全成功：从搜索结果中移除该文件
        const newFiles = result.files.filter(f => f.filePath !== filePath)
        const removedFile = result.files.find(f => f.filePath === filePath)
        const removedCount = removedFile?.matchCount ?? 0

        set({
          isReplacing: false,
          result: {
            ...result,
            files: newFiles,
            totalFiles: newFiles.length,
            totalMatches: result.totalMatches - removedCount,
          },
          replaceResult: replaceRes,
        })
      } else {
        // 失败/跳过/部分成功：保留文件在搜索结果中，展示 replaceResult 摘要供用户查看
        set({
          isReplacing: false,
          replaceResult: replaceRes,
        })
      }

      // 刷新已打开的 Tab
      refreshOpenTabs([filePath])
    } catch (e: any) {
      set({ isReplacing: false, error: String(e?.message ?? e) })
    }
  },

  // ── 展开/折叠 ─────────────────────────────────────────

  toggleFileExpand: (filePath: string) => {
    set((s) => {
      const next = new Set(s.expandedFiles)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return { expandedFiles: next }
    })
  },

  expandAllFiles: () => {
    const { result } = get()
    if (!result) return
    set({ expandedFiles: new Set(result.files.map(f => f.filePath)) })
  },

  collapseAllFiles: () => {
    set({ expandedFiles: new Set() })
  },

  dismissFile: (filePath: string) => {
    const { result } = get()
    if (!result) return
    const removedFile = result.files.find(f => f.filePath === filePath)
    const removedCount = removedFile?.matchCount ?? 0
    const newFiles = result.files.filter(f => f.filePath !== filePath)

    set({
      result: {
        ...result,
        files: newFiles,
        totalFiles: newFiles.length,
        totalMatches: result.totalMatches - removedCount,
      },
    })
  },
}))

// ─────────────────────────────────────────────────────────
// 辅助函数：替换后刷新已打开的文件 Tab
// ─────────────────────────────────────────────────────────

async function refreshOpenTabs(filePaths: string[]) {
  try {
    const { useFileTabStore } = await import('./fileTabStore')
    const { tabs } = useFileTabStore.getState()
    const api = fileManagerApi()
    if (!api?.readFile) return

    for (const filePath of filePaths) {
      const tab = tabs.find(t => t.path === filePath)
      if (!tab || tab.isDirty) continue

      // 只刷新未修改的 Tab（有未保存改动的 Tab 不应被覆盖）
      const result = await api.readFile(filePath)
      if (!result?.error && result?.content !== undefined) {
        useFileTabStore.setState(s => ({
          tabs: s.tabs.map(t =>
            t.path === filePath ? { ...t, content: result.content, isDirty: false } : t
          ),
        }))
      }
    }
  } catch {
    // 刷新失败不阻塞主流程
  }
}

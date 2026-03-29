/**
 * 文件管理器状态 Store
 * 管理当前目录、目录树展开状态、文件选中及目录内容缓存
 * @author weibin
 */

import { create } from 'zustand'
import type { FileEntry } from '../types/fileManagerTypes'
import { useFileTabStore } from './fileTabStore'
import { useLayoutStore } from './layoutStore'

// 重新导出，方便组件直接从 store 引入
export type { FileEntry }

interface FileManagerState {
  /** 当前根目录（null 表示未选择） */
  currentDir: string | null
  /** 是否自动跟随当前选中会话的工作目录 */
  autoFollowSession: boolean
  /** 已展开的目录路径集合 */
  expandedDirs: Set<string>
  /** 目录内容缓存，key 为目录绝对路径 */
  dirCache: Map<string, FileEntry[]>
  /** 当前选中的文件/目录路径 */
  selectedPath: string | null
  /** 是否正在加载根目录 */
  isLoading: boolean
  /** 错误信息 */
  error: string | null
  /** 各会话改动的文件列表，sessionId → TrackedFileChange[] */
  sessionChangedFiles: Map<string, any[]>
  /** 文件树筛选关键词 */
  treeFilterKeyword: string

  // ── Actions ────────────────────────────────────────────
  setCurrentDir: (dir: string | null) => Promise<void>
  toggleDir: (dirPath: string) => Promise<void>
  setSelectedPath: (p: string | null) => void
  refreshCurrentDir: () => Promise<void>
  refreshDir: (dir: string) => Promise<void>
  /** 仅清除并重新加载单个目录缓存（不清除子目录缓存） */
  reloadSingleDir: (dir: string) => Promise<void>
  ensureDirLoaded: (dir: string) => Promise<void>
  setAutoFollowSession: (value: boolean) => void
  handleWatchChange: (event: { dirPath: string }) => Promise<void>
  /** 在文件 Tab 窗格中打开指定路径的文件 */
  openFileInTab: (path: string) => Promise<void>
  /** 拉取指定会话的文件改动列表 */
  fetchSessionFiles: (sessionId: string) => Promise<void>
  /** 清除指定会话的文件改动缓存 */
  clearSessionFiles: (sessionId: string) => void
  /** 获取指定会话改动的文件路径集合 */
  getChangedPathsForSession: (sessionId: string) => Set<string>
  /** 设置文件树筛选关键词 */
  setTreeFilterKeyword: (keyword: string) => void
}

/** 调用 preload 暴露的 fileManager IPC 接口 */
const fileManagerApi = () => (window as any).allBeingsFuture?.fileManager

export const useFileManagerStore = create<FileManagerState>((set, get) => ({
  // ── 初始状态 ────────────────────────────────────────────
  currentDir: null,
  autoFollowSession: true,
  expandedDirs: new Set(),
  dirCache: new Map(),
  selectedPath: null,
  isLoading: false,
  error: null,
  sessionChangedFiles: new Map(),
  treeFilterKeyword: '',

  /**
   * 设置当前根目录并立即加载其内容
   * 传入 null 会清空当前目录
   */
  setCurrentDir: async (dir) => {
    if (!dir) {
      set({ currentDir: null, error: null })
      return
    }

    set({ currentDir: dir, isLoading: true, error: null })

    try {
      const result = await fileManagerApi()?.listDir(dir)
      if (result?.error) {
        set({ error: result.error, isLoading: false })
      } else {
        const cache = new Map(get().dirCache)
        cache.set(dir, result?.entries ?? [])
        set({ dirCache: cache, isLoading: false })
      }
    } catch (e: any) {
      set({ error: String(e), isLoading: false })
    }
  },

  /**
   * 展开/折叠目录节点
   * 展开时若无缓存则异步加载目录内容
   */
  toggleDir: async (dirPath) => {
    const { expandedDirs, dirCache } = get()
    const newExpanded = new Set(expandedDirs)

    if (newExpanded.has(dirPath)) {
      // 折叠：直接移除
      newExpanded.delete(dirPath)
      set({ expandedDirs: newExpanded })
    } else {
      // 展开：先标记展开，再按需加载内容
      newExpanded.add(dirPath)
      set({ expandedDirs: newExpanded })

      if (!dirCache.has(dirPath)) {
        try {
          const result = await fileManagerApi()?.listDir(dirPath)
          if (!result?.error) {
            const newCache = new Map(get().dirCache)
            newCache.set(dirPath, result?.entries ?? [])
            set({ dirCache: newCache })
          }
        } catch {
          // 加载失败时保持展开状态，下次用户再点击可重试
        }
      }
    }
  },

  /** 设置当前选中路径 */
  setSelectedPath: (p) => set({ selectedPath: p }),

  /**
   * 刷新当前根目录
   * 清除根目录及所有子目录缓存后重新加载
   */
  refreshCurrentDir: async () => {
    const { currentDir } = get()
    if (!currentDir) return

    // 清除该根目录下的所有缓存（含子目录）
    const newCache = new Map(get().dirCache)
    for (const key of newCache.keys()) {
      if (key === currentDir || key.startsWith(currentDir)) {
        newCache.delete(key)
      }
    }
    set({ dirCache: newCache })

    await get().setCurrentDir(currentDir)
  },

  /**
   * 刷新指定目录及其所有子目录缓存（用于 workspace 多仓库视图）
   * 注意：会清除 dirPath 下所有子目录的缓存，仅重新加载 dirPath 本身
   */
  refreshDir: async (dirPath) => {
    if (!dirPath) return
    const newCache = new Map(get().dirCache)
    const normalizedDir = dirPath.replace(/\//g, '\\')
    for (const key of newCache.keys()) {
      const normalizedKey = key.replace(/\//g, '\\')
      // 精确匹配或以 dirPath + 分隔符 开头（避免误匹配同前缀的兄弟目录）
      if (normalizedKey === normalizedDir || normalizedKey.startsWith(normalizedDir + '\\')) {
        newCache.delete(key)
      }
    }
    set({ dirCache: newCache })
    await get().ensureDirLoaded(dirPath)
  },

  /**
   * 仅清除并重新加载单个目录缓存（不清除子目录缓存）
   * 适用于删除/新建/重命名操作后刷新父目录列表
   */
  reloadSingleDir: async (dirPath) => {
    if (!dirPath) return
    const newCache = new Map(get().dirCache)
    newCache.delete(dirPath)
    set({ dirCache: newCache })
    try {
      const result = await fileManagerApi()?.listDir(dirPath)
      if (!result?.error) {
        const updatedCache = new Map(get().dirCache)
        updatedCache.set(dirPath, result?.entries ?? [])
        set({ dirCache: updatedCache })
      }
    } catch {
      // 重新加载失败，下次用户交互时会重试
    }
  },

  /**
   * 仅确保目录已加载到缓存，不切换 currentDir（用于 workspace 额外仓库）
   */
  ensureDirLoaded: async (dirPath) => {
    if (!dirPath) return
    const cache = get().dirCache
    if (cache.has(dirPath)) return
    try {
      const result = await fileManagerApi()?.listDir(dirPath)
      if (result?.error) return
      const newCache = new Map(get().dirCache)
      newCache.set(dirPath, result?.entries ?? [])
      set({ dirCache: newCache })
    } catch {
      // ignore
    }
  },

  /** 切换"自动跟随会话工作目录"模式 */
  setAutoFollowSession: (value) => set({ autoFollowSession: value }),

  /**
   * 处理文件监听变化事件（main 进程推送）
   * 清除对应目录缓存并重新加载
   */
  handleWatchChange: async (event) => {
    const { dirCache } = get()
    const newCache = new Map(dirCache)
    newCache.delete(event.dirPath)
    set({ dirCache: newCache })

    try {
      const result = await fileManagerApi()?.listDir(event.dirPath)
      if (!result?.error) {
        const updatedCache = new Map(get().dirCache)
        updatedCache.set(event.dirPath, result?.entries ?? [])
        set({ dirCache: updatedCache })
      }
    } catch {
      // 重新加载失败，下次用户交互时会重试
    }
  },

  /**
   * 在文件 Tab 窗格中打开指定路径的文件
   * 单窗格模式下若当前显示的不是文件窗格，自动切换过去
   */
  openFileInTab: async (filePath: string) => {
    await useFileTabStore.getState().openFile(filePath)

    // 单窗格模式：若 primaryPane 不是 files，自动切换到文件视图
    const { layoutMode, primaryPane, setPaneContent } = useLayoutStore.getState()
    if (layoutMode === 'single' && primaryPane !== 'files') {
      setPaneContent('primary', 'files')
    }
  },

  /** 拉取指定会话的文件改动列表并更新 sessionChangedFiles */
  fetchSessionFiles: async (sessionId: string) => {
    try {
      const files = await (window as any).allBeingsFuture?.fileManager?.getSessionFiles?.(sessionId) ?? []
      set(state => {
        const newMap = new Map(state.sessionChangedFiles)
        newMap.set(sessionId, files)
        return { sessionChangedFiles: newMap }
      })
    } catch (err) {
      console.error('[fileManagerStore] fetchSessionFiles error:', err)
    }
  },

  /** 清除指定会话的文件改动缓存 */
  clearSessionFiles: (sessionId: string) => {
    set(state => {
      const newMap = new Map(state.sessionChangedFiles)
      newMap.delete(sessionId)
      return { sessionChangedFiles: newMap }
    })
  },

  /** 获取指定会话改动的文件路径集合（用于文件树高亮） */
  getChangedPathsForSession: (sessionId: string): Set<string> => {
    const files = get().sessionChangedFiles.get(sessionId) ?? []
    return new Set(files.map((f: any) => f.filePath))
  },

  /** 设置文件树筛选关键词 */
  setTreeFilterKeyword: (keyword: string) => set({ treeFilterKeyword: keyword }),
}))

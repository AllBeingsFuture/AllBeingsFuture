/**
 * 文件 Tab 状态 Store
 * 管理文件编辑器区域已打开的 Tab 列表、激活 Tab、内容加载与保存
 * @author weibin
 */

import { create } from 'zustand'

// ─────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────

export interface PendingReveal {
  /** 1-based 行号 */
  lineNumber: number
  /** 1-based 列号 */
  column: number
}

export interface FileTab {
  /** 唯一 ID（由路径 base64 编码生成） */
  id: string
  /** 文件绝对路径 */
  path: string
  /** 文件名（路径最后一段） */
  name: string
  /** 文件内容 */
  content: string
  /** Monaco 语言标识 */
  language: string
  /** 是否有未保存修改 */
  isDirty: boolean
  /** 是否正在加载 */
  isLoading: boolean
  /** 加载/保存错误信息 */
  error?: string
  /** 待跳转位置（由 openFileAtLine 设置，CodeViewer 消费后清除） */
  pendingReveal?: PendingReveal
}

// ─────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────

/**
 * 根据文件名/扩展名返回 Monaco 语言标识
 */
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  // 无扩展名文件的特殊处理（如 .gitignore、Dockerfile 等）
  const baseName = filename.toLowerCase()

  const baseNameMap: Record<string, string> = {
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    '.gitignore': 'shell',
    '.env': 'shell',
    '.bashrc': 'shell',
    '.zshrc': 'shell',
  }
  if (baseName in baseNameMap) return baseNameMap[baseName]

  const extMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    jsonc: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    md: 'markdown',
    mdx: 'markdown',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    sh: 'shell',
    bash: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    svg: 'xml',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    vue: 'html',
    svelte: 'html',
    toml: 'ini',
    ini: 'ini',
    env: 'shell',
    c: 'c',
    cpp: 'cpp',
    h: 'cpp',
    hpp: 'cpp',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    dart: 'dart',
  }
  return extMap[ext] ?? 'plaintext'
}

// ─────────────────────────────────────────────────────────
// Store 接口
// ─────────────────────────────────────────────────────────

interface FileTabState {
  tabs: FileTab[]
  activeTabId: string | null

  /** 打开文件（已打开则直接切换到该 Tab） */
  openFile: (path: string) => Promise<void>
  /** 打开文件并跳转到指定行列（1-based） */
  openFileAtLine: (path: string, lineNumber: number, column?: number) => Promise<void>
  /** 清除指定 Tab 的 pendingReveal（CodeViewer 消费后调用） */
  clearPendingReveal: (id: string) => void
  /** 关闭指定 Tab */
  closeTab: (id: string) => void
  /** 切换激活 Tab */
  setActiveTab: (id: string) => void
  /** 编辑时更新内容（标记 isDirty） */
  updateContent: (id: string, content: string) => void
  /** 保存 Tab 内容到磁盘 */
  saveTab: (id: string) => Promise<void>
  /** 关闭所有 Tab */
  closeAllTabs: () => void
  /** 关闭指定 Tab 以外的所有 Tab */
  closeOtherTabs: (id: string) => void
  /** 关闭指定 Tab 左侧的所有 Tab */
  closeTabsToLeft: (id: string) => void
  /** 关闭指定 Tab 右侧的所有 Tab */
  closeTabsToRight: (id: string) => void
  /** 关闭所有已保存（isDirty=false）的 Tab */
  closeSavedTabs: () => void
}

// ─────────────────────────────────────────────────────────
// Store 实现
// ─────────────────────────────────────────────────────────

export const useFileTabStore = create<FileTabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openFile: async (path: string) => {
    const { tabs } = get()
    const id = btoa(encodeURIComponent(path))
    const name = path.split(/[\\/]/).pop() ?? path

    // 已打开：直接切换到该 Tab
    const existing = tabs.find(t => t.path === path)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }

    // 新建 loading 状态的 Tab，立即显示
    const newTab: FileTab = {
      id,
      path,
      name,
      content: '',
      language: detectLanguage(name),
      isDirty: false,
      isLoading: true,
    }
    set(s => ({ tabs: [...s.tabs, newTab], activeTabId: id }))

    // 异步加载文件内容
    try {
      const result = await (window as any).allBeingsFuture?.fileManager?.readFile(path)
      if (result?.error) {
        set(s => ({
          tabs: s.tabs.map(t =>
            t.id === id ? { ...t, isLoading: false, error: result.error } : t
          ),
        }))
      } else {
        set(s => ({
          tabs: s.tabs.map(t =>
            t.id === id ? { ...t, isLoading: false, content: result?.content ?? '' } : t
          ),
        }))
      }
    } catch (e) {
      set(s => ({
        tabs: s.tabs.map(t =>
          t.id === id ? { ...t, isLoading: false, error: String(e) } : t
        ),
      }))
    }
  },

  openFileAtLine: async (path: string, lineNumber: number, column = 1) => {
    const { tabs } = get()
    const id = btoa(encodeURIComponent(path))

    // 已打开：直接切换并设置 pendingReveal
    const existing = tabs.find(t => t.path === path)
    if (existing) {
      set(s => ({
        activeTabId: existing.id,
        tabs: s.tabs.map(t =>
          t.id === existing.id ? { ...t, pendingReveal: { lineNumber, column } } : t
        ),
      }))
      return
    }

    // 新建 Tab（先设置 pendingReveal，加载完成后 CodeViewer 会消费它）
    const name = path.split(/[\\/]/).pop() ?? path
    const newTab: FileTab = {
      id,
      path,
      name,
      content: '',
      language: detectLanguage(name),
      isDirty: false,
      isLoading: true,
      pendingReveal: { lineNumber, column },
    }
    set(s => ({ tabs: [...s.tabs, newTab], activeTabId: id }))

    // 异步加载
    try {
      const result = await (window as any).allBeingsFuture?.fileManager?.readFile(path)
      if (result?.error) {
        set(s => ({
          tabs: s.tabs.map(t =>
            t.id === id ? { ...t, isLoading: false, error: result.error } : t
          ),
        }))
      } else {
        set(s => ({
          tabs: s.tabs.map(t =>
            t.id === id ? { ...t, isLoading: false, content: result?.content ?? '' } : t
          ),
        }))
      }
    } catch (e) {
      set(s => ({
        tabs: s.tabs.map(t =>
          t.id === id ? { ...t, isLoading: false, error: String(e) } : t
        ),
      }))
    }
  },

  clearPendingReveal: (id: string) => {
    set(s => ({
      tabs: s.tabs.map(t =>
        t.id === id ? { ...t, pendingReveal: undefined } : t
      ),
    }))
  },

  closeTab: (id: string) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex(t => t.id === id)
    const newTabs = tabs.filter(t => t.id !== id)

    let newActiveId = activeTabId
    if (activeTabId === id) {
      // 优先选右侧 Tab，否则左侧，否则 null
      newActiveId =
        newTabs[idx]?.id ??
        newTabs[idx - 1]?.id ??
        newTabs[0]?.id ??
        null
    }
    set({ tabs: newTabs, activeTabId: newActiveId })
  },

  setActiveTab: (id: string) => set({ activeTabId: id }),

  updateContent: (id: string, content: string) => {
    set(s => ({
      tabs: s.tabs.map(t => (t.id === id ? { ...t, content, isDirty: true } : t)),
    }))
  },

  saveTab: async (id: string) => {
    const tab = get().tabs.find(t => t.id === id)
    if (!tab || !tab.isDirty) return

    try {
      const result = await (window as any).allBeingsFuture?.fileManager?.writeFile(
        tab.path,
        tab.content
      )
      if (!result?.error) {
        set(s => ({
          tabs: s.tabs.map(t => (t.id === id ? { ...t, isDirty: false } : t)),
        }))
      }
    } catch {
      // 保存失败时保持 isDirty 状态，用户可重试
    }
  },

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

  closeOtherTabs: (id: string) => {
    const { tabs } = get()
    // 只保留目标 Tab，激活 Tab 切换为该 Tab
    const newTabs = tabs.filter(t => t.id === id)
    set({ tabs: newTabs, activeTabId: id })
  },

  closeTabsToLeft: (id: string) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex(t => t.id === id)
    if (idx <= 0) return // 已是第一个或未找到，无需操作
    const newTabs = tabs.slice(idx)
    // 若当前激活 Tab 被删除，切换到目标 Tab
    const removedIds = new Set(tabs.slice(0, idx).map(t => t.id))
    const newActiveId = activeTabId && removedIds.has(activeTabId) ? id : activeTabId
    set({ tabs: newTabs, activeTabId: newActiveId })
  },

  closeTabsToRight: (id: string) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex(t => t.id === id)
    if (idx < 0 || idx === tabs.length - 1) return // 未找到或已是最后一个
    const newTabs = tabs.slice(0, idx + 1)
    // 若当前激活 Tab 被删除，切换到目标 Tab
    const removedIds = new Set(tabs.slice(idx + 1).map(t => t.id))
    const newActiveId = activeTabId && removedIds.has(activeTabId) ? id : activeTabId
    set({ tabs: newTabs, activeTabId: newActiveId })
  },

  closeSavedTabs: () => {
    const { tabs, activeTabId } = get()
    const newTabs = tabs.filter(t => t.isDirty)
    // 若激活 Tab 是干净 Tab（被删除），则选剩余第一个
    const activeStillExists = newTabs.some(t => t.id === activeTabId)
    const newActiveId = activeStillExists ? activeTabId : (newTabs[0]?.id ?? null)
    set({ tabs: newTabs, activeTabId: newActiveId })
  },
}))

/**
 * Monaco Editor 封装组件
 * 展示文件内容，支持编辑和 Ctrl+S 保存
 * 主题动态跟随应用主题，读取 CSS 变量实现多主题适配
 */

import React, { useCallback, useEffect } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import { useFileTabStore } from '../../stores/fileTabStore'
import { useSettingsStore } from '../../stores/settingsStore'

const MONACO_THEME_NAME = 'abf-dynamic'

interface CodeViewerProps {
  /** 对应 FileTab 的 id */
  tabId: string
}

export default function CodeViewer({ tabId }: CodeViewerProps) {
  const { tabs, updateContent, saveTab, clearPendingReveal } = useFileTabStore()
  const tab = tabs.find(t => t.id === tabId)
  const monaco = useMonaco()
  const currentTheme = useSettingsStore(s => s.settings.theme)

  // 每次 Monaco 实例就绪或应用主题变化时，重新注册并应用 Monaco 主题
  useEffect(() => {
    if (!monaco) return

    const style = getComputedStyle(document.documentElement)
    const get = (v: string) => style.getPropertyValue(v).trim()

    // AllBeingsFuture 主题均为暗色
    monaco.editor.defineTheme(MONACO_THEME_NAME, {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background':                  get('--color-bg-primary'),
        'editor.lineHighlightBackground':     get('--color-bg-secondary') + '80',
        'editorGutter.background':            get('--color-bg-primary'),
        'editorLineNumber.foreground':        get('--color-text-muted'),
        'editorLineNumber.activeForeground':  get('--color-text-secondary'),
        'minimap.background':                 get('--color-bg-primary'),
        'editorOverviewRuler.background':     get('--color-bg-primary'),
        'editorOverviewRuler.border':         get('--color-bg-primary'),
        'scrollbar.shadow':                   '#00000000',
        'scrollbarSlider.background':         get('--color-border') + '50',
        'scrollbarSlider.hoverBackground':    get('--color-border'),
        'scrollbarSlider.activeBackground':   get('--color-bg-hover'),
        'editor.selectionBackground':         get('--color-accent-blue') + '40',
        'editor.inactiveSelectionBackground': get('--color-accent-blue') + '20',
        'editorWidget.background':            get('--color-bg-secondary'),
        'editorWidget.border':                get('--color-border'),
        'input.background':                   get('--color-bg-primary'),
        'input.border':                       get('--color-border'),
        'focusBorder':                        get('--color-accent-blue'),
      },
    })
    monaco.editor.setTheme(MONACO_THEME_NAME)
  }, [monaco, currentTheme])

  // 编辑器内容变化
  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) updateContent(tabId, value)
  }, [tabId, updateContent])

  // 捕获 Ctrl+S / Cmd+S 保存
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      saveTab(tabId)
    }
  }, [tabId, saveTab])

  // 处理 pendingReveal（跳转到指定行列）
  useEffect(() => {
    if (!monaco || !tab?.pendingReveal) return
    const editors = monaco.editor.getEditors()
    if (editors.length === 0) return

    const editor = editors[editors.length - 1]
    const { lineNumber, column } = tab.pendingReveal
    editor.revealLineInCenter(lineNumber)
    editor.setPosition({ lineNumber, column })
    editor.focus()
    clearPendingReveal(tabId)
  }, [monaco, tab?.pendingReveal, tabId, clearPendingReveal])

  if (!tab) return null

  // 加载中
  if (tab.isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        加载中...
      </div>
    )
  }

  // 加载失败
  if (tab.error) {
    return (
      <div className="h-full flex items-center justify-center text-accent-red text-sm px-8 text-center">
        加载失败：{tab.error}
      </div>
    )
  }

  // Monaco Editor
  return (
    <div className="h-full" onKeyDown={handleKeyDown}>
      <Editor
        height="100%"
        language={tab.language}
        value={tab.content}
        onChange={handleChange}
        theme={MONACO_THEME_NAME}
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          renderWhitespace: 'none',
          smoothScrolling: true,
          cursorSmoothCaretAnimation: 'on',
          padding: { top: 8, bottom: 8 },
          scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          contextmenu: true,
          automaticLayout: true,
        }}
      />
    </div>
  )
}

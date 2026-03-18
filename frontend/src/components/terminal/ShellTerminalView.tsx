/**
 * Shell 终端视图组件
 *
 * 独立于 AI 会话的 Shell 终端，使用 xterm.js 进行真实终端渲染。
 */

import React, { useRef, useCallback, useEffect } from 'react'
import { Terminal, Plus, X } from 'lucide-react'
import { useShellTerminalStore } from '../../stores/shellTerminalStore'
import '@xterm/xterm/css/xterm.css'
import ShellTerminalTab from './ShellTerminalTab'

const MAX_TABS = 8

const ShellTerminalView: React.FC = () => {
  const tabs = useShellTerminalStore(s => s.tabs)
  const activeTabId = useShellTerminalStore(s => s.activeTabId)
  const availableShells = useShellTerminalStore(s => s.availableShells)
  const createTab = useShellTerminalStore(s => s.createTab)
  const closeTab = useShellTerminalStore(s => s.closeTab)
  const activateTab = useShellTerminalStore(s => s.activateTab)
  const fetchShells = useShellTerminalStore(s => s.fetchShells)
  const initListeners = useShellTerminalStore(s => s.initListeners)

  const autoCreatedRef = useRef(false)

  useEffect(() => {
    fetchShells()
    const cleanup = initListeners()
    return cleanup
  }, [fetchShells, initListeners])

  // Auto-create a default terminal (CMD) when panel is first shown with no tabs
  useEffect(() => {
    if (autoCreatedRef.current) return
    if (availableShells.length === 0) return // Wait for shells to load
    if (tabs.length === 0) {
      autoCreatedRef.current = true
      const cmdShell = availableShells.find(s => s.id === 'cmd')
      createTab(cmdShell?.path)
    }
  }, [tabs.length, availableShells, createTab])

  const handleCreateTab = useCallback((shell?: string) => {
    createTab(shell)
  }, [createTab])

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Tab 栏 */}
      <div className="flex items-center border-b border-white/10 bg-gray-900/80">
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto px-1 py-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => activateTab(tab.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono whitespace-nowrap transition-colors',
                tab.id === activeTabId
                  ? 'bg-white/10 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
              ].join(' ')}
            >
              <Terminal size={12} className={tab.exitCode !== undefined ? 'text-gray-600' : 'text-green-400'} />
              <span>{tab.title}</span>
              {tab.exitCode !== undefined && (
                <span className={`text-[10px] ${tab.exitCode === 0 ? 'text-gray-600' : 'text-red-400'}`}>
                  [{tab.exitCode}]
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="ml-1 text-gray-600 hover:text-gray-300 transition-colors"
              >
                <X size={10} />
              </button>
            </button>
          ))}
        </div>

        {/* 新建终端按钮 */}
        <div className="relative flex-shrink-0 px-1">
          <button
            onClick={() => {
              const cmdShell = availableShells.find(s => s.id === 'cmd')
              handleCreateTab(cmdShell?.path)
            }}
            disabled={tabs.length >= MAX_TABS}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 rounded transition-colors disabled:opacity-40"
            title="新建终端"
          >
            <Plus size={12} />
          </button>

        </div>
      </div>

      {/* 终端内容区 */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map(tab => (
          <ShellTerminalTab
            key={tab.id}
            ptyId={tab.id}
            visible={tab.id === activeTabId}
          />
        ))}

        {tabs.length === 0 && (
          <button
            onClick={() => {
              const cmdShell = availableShells.find(s => s.id === 'cmd')
              handleCreateTab(cmdShell?.path)
            }}
            className="flex flex-col items-center justify-center h-full w-full text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
          >
            <Terminal size={32} className="mb-3 opacity-40" />
            <p className="text-sm">点击 + 创建新终端</p>
          </button>
        )}
      </div>
    </div>
  )
}

ShellTerminalView.displayName = 'ShellTerminalView'
export default ShellTerminalView

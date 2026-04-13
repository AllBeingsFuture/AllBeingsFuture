/**
 * 中间区域顶部 Header
 * 左侧：[💬 会话] [📁 文件] 大分类 Tab
 * 右侧：布局切换按钮（单窗格 / 左右分栏 / 上下分栏）
 */

import React from 'react'
import { MessageSquare, FolderOpen } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { workbenchApi } from '../../app/api/workbench'
import { useLayoutStore } from '../../stores/layoutStore'
import LayoutControls from './LayoutControls'

export default function MainPanelHeader() {
  const { layoutMode, primaryPane } = useLayoutStore(
    useShallow((state) => ({
      layoutMode: state.layoutMode,
      primaryPane: state.primaryPane,
    })),
  )

  const isSplit = layoutMode !== 'single'

  const handleSessionsClick = () => {
    if (!isSplit) {
      void workbenchApi.layout.setPaneContent('primary', 'sessions')
    } else if (primaryPane !== 'sessions') {
      void workbenchApi.layout.swapPanes()
    }
  }

  const handleFilesClick = () => {
    if (!isSplit) {
      void workbenchApi.layout.setPaneContent('primary', 'files')
    } else if (primaryPane !== 'files') {
      void workbenchApi.layout.swapPanes()
    }
  }

  const getTabClass = (content: 'sessions' | 'files') => {
    const isActive = primaryPane === content
    if (!isSplit) {
      return isActive
        ? 'border-blue-400 text-white bg-blue-500/[0.06]'
        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
    }
    return isActive
      ? 'border-blue-400 text-white bg-blue-500/[0.06]'
      : 'border-blue-400/20 text-gray-500 hover:text-gray-300 hover:border-blue-400/40'
  }

  return (
    <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.01] flex-shrink-0 h-9 px-1">
      {/* 左侧：分类 Tab */}
      <div className="flex items-center">
        <button
          onClick={handleSessionsClick}
          className={`flex items-center gap-1.5 px-3 h-9 text-xs font-medium border-b-2 transition-all duration-200 ${getTabClass('sessions')}`}
        >
          <MessageSquare size={13} />
          会话
        </button>
        <button
          onClick={handleFilesClick}
          className={`flex items-center gap-1.5 px-3 h-9 text-xs font-medium border-b-2 transition-all duration-200 ${getTabClass('files')}`}
        >
          <FolderOpen size={13} />
          文件
        </button>
      </div>

      {/* 右侧：布局控制 */}
      <LayoutControls />
    </div>
  )
}

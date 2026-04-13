/**
 * 终端面板网格布局组件
 * 根据活跃会话数量自动调整网格布局，支持最大化和新建会话
 */

import React, { useMemo } from 'react'
import { Plus, Maximize2, Terminal } from 'lucide-react'
import { workbenchApi } from '../../app/api/workbench'
import { useSessionStore } from '../../stores/sessionStore'

/** 会话状态 → 指示灯颜色映射 */
const STATUS_COLORS: Record<string, string> = {
  running: 'bg-green-500',
  idle: 'bg-blue-500',
  starting: 'bg-yellow-500',
  waiting_input: 'bg-amber-500',
  error: 'bg-red-500',
  completed: 'bg-gray-500',
  terminated: 'bg-gray-600',
}

/**
 * 根据会话数量计算网格布局
 * @returns [columns, rows]
 */
function calculateGridLayout(count: number): [number, number] {
  if (count <= 1) return [1, 1]
  if (count === 2) return [2, 1]
  if (count <= 4) return [2, 2]
  if (count <= 6) return [3, 2]
  if (count <= 9) return [3, 3]
  return [4, 3]
}

/** 精简的会话卡片，展示在网格中 */
const SessionCard = React.memo(function SessionCard({
  session,
  onMaximize,
}: {
  session: { id: string; name?: string; status: string; workDir?: string }
  onMaximize: () => void
}) {
  const dotColor = STATUS_COLORS[session.status] ?? 'bg-gray-500'

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-bg-secondary">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal size={13} className="text-text-muted flex-shrink-0" />
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
          <span className="text-xs font-medium text-text-primary truncate">
            {session.name || session.id.slice(0, 8)}
          </span>
        </div>
        <button
          onClick={onMaximize}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="最大化"
        >
          <Maximize2 size={12} />
        </button>
      </div>
      {/* 内容区域 */}
      <div className="flex-1 flex items-center justify-center px-3 py-4">
        <div className="text-center">
          <p className="text-xs text-text-muted">{session.status}</p>
          {session.workDir && (
            <p className="text-[10px] text-text-muted mt-1 font-mono truncate max-w-[200px]">
              {session.workDir}
            </p>
          )}
        </div>
      </div>
    </div>
  )
})

const TerminalGrid: React.FC = () => {
  const sessions = useSessionStore((state) => state.sessions)

  const { activeSessions, cols, rows, placeholderCount } = useMemo(() => {
    const active = sessions.filter((session) => session.status !== 'completed' && session.status !== 'terminated')
    const [cols, rows] = calculateGridLayout(active.length)
    return {
      activeSessions: active,
      cols,
      rows,
      placeholderCount: cols * rows - active.length,
    }
  }, [sessions])

  // 最大化：选中会话并切换到标签页视图
  const handleMaximize = (sessionId: string) => {
    void workbenchApi.navigation.openSession(sessionId)
    void workbenchApi.ui.setViewMode('tabs')
  }

  // 新建会话
  const handleNewSession = () => {
    void workbenchApi.ui.setNewSessionDialogVisible(true)
  }

  // 无会话时显示占位
  if (activeSessions.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <button
          onClick={handleNewSession}
          className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-600 rounded-lg hover:border-gray-500 hover:bg-bg-secondary transition-colors group"
        >
          <Plus size={48} className="text-gray-600 group-hover:text-gray-500" />
          <span className="text-gray-500 text-lg">创建新会话</span>
        </button>
      </div>
    )
  }

  return (
    <div
      className="w-full h-full p-4 grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {activeSessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          onMaximize={() => handleMaximize(session.id)}
        />
      ))}

      {/* 空格子占位 */}
      {Array.from({ length: placeholderCount }).map((_, index) => (
        <div
          key={`placeholder-${index}`}
          className="border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-gray-600 hover:bg-bg-secondary transition-colors group"
          onClick={handleNewSession}
        >
          <Plus size={32} className="text-gray-700 group-hover:text-gray-600" />
        </div>
      ))}
    </div>
  )
}

TerminalGrid.displayName = 'TerminalGrid'

export default TerminalGrid

/**
 * Activity Bar - 左侧功能图标条
 *
 * 面板系统：
 *   - 上半区（左侧指示条）→ 控制左侧边栏
 *   - 下半区（右侧指示条）→ 控制右侧面板
 *   - 拖拽图标可在两区之间移动
 *   - 右键图标弹出快捷菜单（移到另一侧）
 */

import { useState, useEffect } from 'react'
import { Bot, FolderTree, GitBranch, Settings, Users, TerminalSquare, Wrench } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { PanelId, PanelSide } from '../../stores/ui-helpers'
import { usePanelStore } from '../../stores/panelStore'
import { useUIStore } from '../../stores/uiStore'

const PANEL_DEFS: {
  id: PanelId
  icon: React.ElementType
  label: string
  disabled?: boolean
}[] = [
  { id: 'sessions',  icon: Bot,        label: '会话管理' },
  { id: 'explorer',  icon: FolderTree, label: '文件资源管理器' },
  { id: 'git',       icon: GitBranch,  label: 'Git 分支' },
  { id: 'tools',     icon: Wrench,     label: '内置工具' },
]

/** DropZone 必须定义在组件外部，避免拖拽事件链断裂 */
interface DropZoneProps {
  side: PanelSide
  draggingId: PanelId | null
  dropZone: PanelSide | null
  panelSides: Record<PanelId, PanelSide>
  onDragOver: (side: PanelSide) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (side: PanelSide) => void
  children: React.ReactNode
}

function DropZone({ side, draggingId, dropZone, panelSides, onDragOver, onDragLeave, onDrop, children }: DropZoneProps) {
  const isTarget = draggingId !== null && dropZone === side && panelSides[draggingId] !== side
  return (
    <div
      className={[
        'flex flex-col items-center gap-1 w-full px-1 py-0.5 transition-all duration-150 min-h-[2rem]',
        isTarget ? 'bg-[#1a1a1a] border border-[#ff4f1a]/30' : '',
      ].join(' ')}
      onDragOver={(e) => { e.preventDefault(); onDragOver(side) }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(side) }}
    >
      {children}
    </div>
  )
}

interface ActivityBarProps {
  onOpenSettings: () => void
}

export default function ActivityBar({ onOpenSettings }: ActivityBarProps) {
  const {
    panelSides,
    activePanelLeft,
    activePanelRight,
    setPanelSide,
    setActivePanelLeft,
    setActivePanelRight,
    shellPanelVisible,
    toggleShellPanel,
  } = usePanelStore(useShallow((state) => ({
    panelSides: state.panelSides,
    activePanelLeft: state.activePanelLeft,
    activePanelRight: state.activePanelRight,
    setPanelSide: state.setPanelSide,
    setActivePanelLeft: state.setActivePanelLeft,
    setActivePanelRight: state.setActivePanelRight,
    shellPanelVisible: state.shellPanelVisible,
    toggleShellPanel: state.toggleShellPanel,
  })))

  const { teamsMode, setTeamsMode } = useUIStore(useShallow((state) => ({
    teamsMode: state.teamsMode,
    setTeamsMode: state.setTeamsMode,
  })))

  const [draggingId, setDraggingId] = useState<PanelId | null>(null)
  const [dropZone, setDropZone]     = useState<PanelSide | null>(null)
  const [contextMenu, setContextMenu] = useState<{ id: PanelId; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const leftPanels  = PANEL_DEFS.filter(p => panelSides[p.id] === 'left')
  const rightPanels = PANEL_DEFS.filter(p => panelSides[p.id] === 'right')

  const handleDrop = (targetSide: PanelSide) => {
    if (draggingId && panelSides[draggingId] !== targetSide) {
      setPanelSide(draggingId, targetSide)
    }
    setDraggingId(null)
    setDropZone(null)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropZone(null)
    }
  }

  const renderButton = (
    { id, icon: Icon, label, disabled }: typeof PANEL_DEFS[0],
    side: PanelSide
  ) => {
    const isActive   = !teamsMode && (side === 'left' ? activePanelLeft === id : activePanelRight === id)
    const isDragging = draggingId === id

    return (
      <button
        key={id}
        title={disabled ? `${label}（即将推出）` : label}
        disabled={disabled}
        draggable={!disabled}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          setTimeout(() => setDraggingId(id), 0)
        }}
        onDragEnd={() => {
          setDraggingId(null)
          setDropZone(null)
        }}
        onClick={() => {
          if (disabled) return
          setTeamsMode(false)
          if (side === 'left') setActivePanelLeft(id)
          else setActivePanelRight(id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          if (!disabled) setContextMenu({ id, x: e.clientX, y: e.clientY })
        }}
        className={[
          'relative w-full h-10 flex items-center justify-center transition-all duration-150 select-none',
          isDragging ? 'opacity-30' : '',
          isActive
            ? 'text-[#ff4f1a] bg-[#1a1a1a]'
            : disabled
            ? 'text-text-muted opacity-30 cursor-not-allowed'
            : 'text-[#555] hover:text-[#888] hover:bg-[#171717] cursor-grab active:cursor-grabbing',
        ].join(' ')}
      >
        {isActive && (
          <span
            className={[
              'absolute top-0 bottom-0 w-[2px] bg-[#ff4f1a]',
              side === 'left' ? 'left-0' : 'right-0',
            ].join(' ')}
          />
        )}
        <Icon className="w-[18px] h-[18px]" />
      </button>
    )
  }

  return (
    <div className="flex flex-col items-center w-12 shrink-0 h-full bg-[#0c0c0c] border-r border-[#2e2e2e] py-2 z-10">
      {/* 上半区：控制左侧边栏 */}
      <DropZone
        side="left"
        draggingId={draggingId}
        dropZone={dropZone}
        panelSides={panelSides}
        onDragOver={setDropZone}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {leftPanels.length > 0
          ? leftPanels.map(p => renderButton(p, 'left'))
          : draggingId
          ? <div className="w-full h-8 flex items-center justify-center text-accent-blue/50 text-[10px]">放这里</div>
          : null
        }
      </DropZone>

      {/* 分隔线 */}
      <div className={[
        'w-5 my-2 border-t transition-colors',
        draggingId ? 'border-[#ff4f1a]/30' : 'border-[#2e2e2e]',
      ].join(' ')} />

      {/* 下半区：控制右侧面板 */}
      <DropZone
        side="right"
        draggingId={draggingId}
        dropZone={dropZone}
        panelSides={panelSides}
        onDragOver={setDropZone}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {rightPanels.length > 0
          ? rightPanels.map(p => renderButton(p, 'right'))
          : draggingId
          ? <div className="w-full h-8 flex items-center justify-center text-accent-blue/50 text-[10px]">放这里</div>
          : null
        }
      </DropZone>

      <div className="flex-1" />

      {/* Shell 终端切换 */}
      <div className="px-1 w-full mb-0.5">
        <button
          title="终端 (Ctrl+`)"
          onClick={toggleShellPanel}
          className={[
            'relative w-full h-10 flex items-center justify-center transition-all duration-150',
            shellPanelVisible
              ? 'bg-[#1a1a1a] text-[#3eb550]'
              : 'text-[#555] hover:text-[#888] hover:bg-[#171717]',
          ].join(' ')}
        >
          {shellPanelVisible && (
            <span className="absolute top-0 bottom-0 left-0 w-[2px] bg-[#3eb550]" />
          )}
          <TerminalSquare className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Teams 按钮 */}
      <div className="px-1 w-full mb-0.5">
        <button
          title="Agent Teams — 多 AI 协作"
          onClick={() => setTeamsMode(!teamsMode)}
          className={[
            'relative w-full h-10 flex items-center justify-center transition-all duration-150',
            teamsMode
              ? 'bg-[#1a1a1a] text-[#ff4f1a]'
              : 'text-[#555] hover:text-[#ff7044] hover:bg-[#171717]',
          ].join(' ')}
        >
          {teamsMode && (
            <span className="absolute top-0 bottom-0 left-0 w-[2px] bg-[#ff4f1a]" />
          )}
          <Users className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* 分隔线 */}
      <div className="w-5 border-t border-[#2e2e2e] mb-1" />

      {/* 设置按钮 */}
      <div className="px-1 w-full">
        <button
          title="设置"
          onClick={onOpenSettings}
          className="w-full h-10 flex items-center justify-center text-[#555] hover:text-[#888] hover:bg-[#171717] transition-all duration-150 cursor-pointer"
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#111] border border-[#2e2e2e] py-1 text-xs min-w-[148px] animate-fade-in-up"
          style={{ top: contextMenu.y, left: contextMenu.x + 4 }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-[#888] hover:bg-[#1a1a1a] hover:text-[#e8e4de] transition-colors"
            onClick={() => {
              const cur = panelSides[contextMenu.id]
              setPanelSide(contextMenu.id, cur === 'left' ? 'right' : 'left')
              setContextMenu(null)
            }}
          >
            {panelSides[contextMenu.id] === 'left' ? '移到右侧面板 →' : '← 移到左侧边栏'}
          </button>
          <button
            className="w-full px-3 py-2 text-left text-[#555] hover:bg-[#1a1a1a] hover:text-[#888] transition-colors"
            onClick={() => setContextMenu(null)}
          >
            取消
          </button>
        </div>
      )}
    </div>
  )
}

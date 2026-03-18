/**
 * 通用右键菜单组件
 * 从 claudeops 移植，支持子菜单、视口边界检测、Portal 渲染
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItemAction {
  key: string
  type?: undefined
  label: string
  icon?: React.ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  children?: MenuItem[]
  onClick?: () => void
}

export interface MenuDivider {
  key: string
  type: 'divider'
}

export type MenuItem = MenuItemAction | MenuDivider

interface ContextMenuProps {
  visible: boolean
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

const ContextMenu: React.FC<ContextMenuProps> = ({ visible, x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState({ x, y })
  const [subMenu, setSubMenu] = useState<{ key: string; x: number; y: number; items: MenuItem[] } | null>(null)
  const subMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!visible) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [visible, onClose])

  useEffect(() => {
    if (!visible || !menuRef.current) return

    const rect = menuRef.current.getBoundingClientRect()
    const viewW = window.innerWidth
    const viewH = window.innerHeight

    let nx = x
    let ny = y

    if (x + rect.width > viewW) nx = viewW - rect.width - 8
    if (y + rect.height > viewH) ny = viewH - rect.height - 8
    if (nx < 0) nx = 8
    if (ny < 0) ny = 8

    setAdjustedPos({ x: nx, y: ny })
  }, [visible, x, y])

  const handleMouseEnterItem = useCallback((item: MenuItemAction, e: React.MouseEvent) => {
    if (subMenuTimer.current) {
      clearTimeout(subMenuTimer.current)
      subMenuTimer.current = null
    }

    if (item.children && item.children.length > 0) {
      const target = e.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()
      subMenuTimer.current = setTimeout(() => {
        setSubMenu({
          key: item.key,
          x: rect.right,
          y: rect.top,
          items: item.children!,
        })
      }, 100)
    } else {
      subMenuTimer.current = setTimeout(() => {
        setSubMenu(null)
      }, 200)
    }
  }, [])

  if (!visible) return null

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[180px] rounded-lg border border-white/10 bg-[#1e293b] py-1 shadow-xl shadow-black/40"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {items.map((item) => {
        if (item.type === 'divider') {
          return <div key={item.key} className="my-1 border-t border-white/10" />
        }

        const actionItem = item as MenuItemAction

        return (
          <button
            key={actionItem.key}
            disabled={actionItem.disabled}
            onMouseEnter={(e) => handleMouseEnterItem(actionItem, e)}
            onClick={() => {
              if (actionItem.disabled) return
              actionItem.onClick?.()
              onClose()
            }}
            className={[
              'flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
              actionItem.disabled
                ? 'opacity-40 cursor-not-allowed'
                : actionItem.danger
                  ? 'text-red-400 hover:bg-red-400/10'
                  : 'text-gray-200 hover:bg-white/10',
            ].join(' ')}
          >
            {actionItem.icon && <span className="w-4 flex-shrink-0">{actionItem.icon}</span>}
            <span className="flex-1">{actionItem.label}</span>
            {actionItem.shortcut && (
              <span className="ml-4 text-[10px] text-gray-500">{actionItem.shortcut}</span>
            )}
            {actionItem.children && actionItem.children.length > 0 && (
              <span className="ml-2 text-gray-500">▶</span>
            )}
          </button>
        )
      })}

      {subMenu && (
        <ContextMenu
          visible
          x={subMenu.x}
          y={subMenu.y}
          items={subMenu.items}
          onClose={() => setSubMenu(null)}
        />
      )}
    </div>
  )

  return createPortal(menu, document.body)
}

ContextMenu.displayName = 'ContextMenu'
export default ContextMenu

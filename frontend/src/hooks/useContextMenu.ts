/**
 * 右键菜单状态管理 Hook
 */

import { useState, useCallback } from 'react'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
}

export function useContextMenu() {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  })

  const showMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuState({ visible: true, x: e.clientX, y: e.clientY })
  }, [])

  const hideMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, visible: false }))
  }, [])

  return { menuState, showMenu, hideMenu }
}

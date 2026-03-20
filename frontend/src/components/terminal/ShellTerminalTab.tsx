/**
 * 单个 Shell 终端标签页 — 封装 xterm.js 实例
 *
 * 每个 PTY 会话对应一个 ShellTerminalTab，
 * 通过 visible 控制显隐（保持后台标签页不销毁）。
 */

import React, { useRef, useCallback } from 'react'
import useShellTerminal from '../../hooks/useShellTerminal'
import { useShellTerminalStore } from '../../stores/shellTerminalStore'

interface Props {
  ptyId: string
  visible: boolean
}

const ShellTerminalTab: React.FC<Props> = ({ ptyId, visible }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const markExited = useShellTerminalStore(s => s.markExited)

  const handleExit = useCallback((code: number) => {
    markExited(ptyId, code)
  }, [ptyId, markExited])

  useShellTerminal({
    ptyId,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    onExit: handleExit,
  })

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        display: visible ? 'block' : 'none',
        padding: '4px 0 0 4px',
      }}
    />
  )
}

ShellTerminalTab.displayName = 'ShellTerminalTab'
export default React.memo(ShellTerminalTab)

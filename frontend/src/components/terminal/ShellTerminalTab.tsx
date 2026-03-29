/**
 * 单个 Shell 终端标签页 — 封装 xterm.js 实例
 *
 * 每个 PTY 会话对应一个 ShellTerminalTab，
 * 通过 visible 控制显隐（保持后台标签页不销毁）。
 */

import React, { useRef, useCallback } from 'react'
import useShellTerminal from '../../hooks/useShellTerminal'
import { type ShellTabLifecycle, useShellTerminalStore } from '../../stores/shellTerminalStore'

interface Props {
  ptyId: string
  lifecycle: ShellTabLifecycle
}

const ShellTerminalTab: React.FC<Props> = ({ ptyId, lifecycle }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const markExited = useShellTerminalStore(s => s.markExited)

  const handleExit = useCallback((code: number) => {
    markExited(ptyId, code)
  }, [ptyId, markExited])

  useShellTerminal({
    ptyId,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    lifecycle,
    onExit: handleExit,
  })

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        display: lifecycle === 'active' ? 'block' : 'none',
        padding: '4px 0 0 4px',
      }}
    />
  )
}

ShellTerminalTab.displayName = 'ShellTerminalTab'
export default React.memo(ShellTerminalTab)

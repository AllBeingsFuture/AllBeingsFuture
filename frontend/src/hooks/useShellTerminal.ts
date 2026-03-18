/**
 * Shell 终端 Hook — xterm.js 生命周期管理
 *
 * 为每个 PTY 标签页创建一个 xterm.js Terminal 实例，
 * 将 PTY 输出渲染到终端，将用户输入转发到 PTY。
 */

import { useEffect, useRef, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

interface UseShellTerminalOptions {
  ptyId: string
  containerRef: RefObject<HTMLDivElement>
  onExit?: (code: number) => void
}

export default function useShellTerminal({
  ptyId,
  containerRef,
  onExit,
}: UseShellTerminalOptions): { terminal: Terminal | null; fitAddon: FitAddon | null } {
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !ptyId) return

    mountedRef.current = true

    // Create xterm.js terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: '#111827',
        foreground: '#e5e7eb',
        cursor: '#60a5fa',
        selectionBackground: '#374151',
        black: '#1f2937',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e5e7eb',
        brightBlack: '#4b5563',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f9fafb',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    termRef.current = term
    fitRef.current = fitAddon

    // Open terminal in container
    term.open(container)

    // Fit to container size
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch { /* container might not be visible yet */ }
    })

    // Send initial resize to backend
    const api = window.allBeingsFuture?.pty
    if (api?.resize) {
      api.resize(ptyId, term.cols, term.rows).catch(() => {})
    }

    // Forward user input to PTY
    const inputDisposable = term.onData((data) => {
      api?.write?.(ptyId, data).catch(() => {})
    })

    // Listen for PTY output
    const cleanupData = api?.onData?.((id: string, data: string) => {
      if (id === ptyId && mountedRef.current) {
        term.write(data)
      }
    })

    // Listen for PTY exit
    const cleanupExit = api?.onExit?.((id: string, exitCode: number) => {
      if (id === ptyId && mountedRef.current) {
        term.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
        onExit?.(exitCode)
      }
    })

    // Handle container resize with ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        if (api?.resize) {
          api.resize(ptyId, term.cols, term.rows).catch(() => {})
        }
      } catch { /* ignore */ }
    })
    resizeObserver.observe(container)

    return () => {
      mountedRef.current = false
      resizeObserver.disconnect()
      inputDisposable.dispose()
      cleanupData?.()
      cleanupExit?.()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [ptyId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { terminal: termRef.current, fitAddon: fitRef.current }
}

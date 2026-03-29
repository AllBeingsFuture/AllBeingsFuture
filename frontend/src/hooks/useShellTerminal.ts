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
import { terminalCore } from '../core/terminal/terminalCore'
import type { ShellTabLifecycle } from '../stores/shellTerminalStore'

interface UseShellTerminalOptions {
  ptyId: string
  containerRef: RefObject<HTMLDivElement>
  lifecycle: ShellTabLifecycle
  onExit?: (code: number) => void
}

export default function useShellTerminal({
  ptyId,
  containerRef,
  lifecycle,
  onExit,
}: UseShellTerminalOptions): { terminal: Terminal | null; fitAddon: FitAddon | null } {
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const mountedRef = useRef(false)
  const lifecycleRef = useRef<ShellTabLifecycle>(lifecycle)
  const liveChunkBufferRef = useRef('')
  const frozenChunkBufferRef = useRef('')
  const flushFrameRef = useRef<number | null>(null)
  const resizeFrameRef = useRef<number | null>(null)

  useEffect(() => {
    lifecycleRef.current = lifecycle
  }, [lifecycle])

  const clearScheduledHandle = (id: number | null) => {
    if (id === null) return
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(id)
    }
    clearTimeout(id)
  }

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

    const flushLiveBuffer = () => {
      flushFrameRef.current = null
      if (!mountedRef.current || !termRef.current) return
      const nextChunk = liveChunkBufferRef.current
      if (!nextChunk) return
      liveChunkBufferRef.current = ''
      termRef.current.write(nextChunk)
    }

    const scheduleFlush = () => {
      if (flushFrameRef.current !== null) return
      if (typeof requestAnimationFrame === 'function') {
        flushFrameRef.current = requestAnimationFrame(flushLiveBuffer)
        return
      }
      flushFrameRef.current = window.setTimeout(flushLiveBuffer, 16) as unknown as number
    }

    const commitResize = () => {
      resizeFrameRef.current = null
      if (!mountedRef.current || lifecycleRef.current !== 'active') return
      try {
        fitAddon.fit()
        void terminalCore.resize(ptyId, term.cols, term.rows)?.catch(() => {})
      } catch { /* ignore */ }
    }

    const scheduleResize = () => {
      if (resizeFrameRef.current !== null) return
      if (typeof requestAnimationFrame === 'function') {
        resizeFrameRef.current = requestAnimationFrame(commitResize)
        return
      }
      resizeFrameRef.current = window.setTimeout(commitResize, 16) as unknown as number
    }

    // Open terminal in container
    term.open(container)

    // Fit to container size
    if (lifecycleRef.current === 'active') {
      scheduleResize()
    }

    // Send initial resize to backend
    // Forward user input to PTY
    const inputDisposable = term.onData((data) => {
      void terminalCore.write(ptyId, data)?.catch(() => {})
    })

    // Listen for PTY output
    const cleanupData = terminalCore.listenData((id: string, data: string) => {
      if (id === ptyId && mountedRef.current) {
        if (lifecycleRef.current === 'active') {
          liveChunkBufferRef.current += data
          scheduleFlush()
          return
        }

        frozenChunkBufferRef.current += data
      }
    })

    // Listen for PTY exit
    const cleanupExit = terminalCore.listenExit((id: string, exitCode: number) => {
      if (id === ptyId && mountedRef.current) {
        term.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
        onExit?.(exitCode)
      }
    })

    // Handle container resize with ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      if (lifecycleRef.current !== 'active') return
      scheduleResize()
    })
    resizeObserver.observe(container)

    return () => {
      mountedRef.current = false
      clearScheduledHandle(flushFrameRef.current)
      clearScheduledHandle(resizeFrameRef.current)
      flushFrameRef.current = null
      resizeFrameRef.current = null
      resizeObserver.disconnect()
      inputDisposable.dispose()
      cleanupData?.()
      cleanupExit?.()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [containerRef, onExit, ptyId])

  useEffect(() => {
    if (lifecycle !== 'active') return

    const term = termRef.current
    const fitAddon = fitRef.current
    if (!term || !fitAddon) return

    const buffered = frozenChunkBufferRef.current
    if (buffered) {
      frozenChunkBufferRef.current = ''
      liveChunkBufferRef.current += buffered
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          const payload = liveChunkBufferRef.current
          if (!payload || !termRef.current) return
          liveChunkBufferRef.current = ''
          termRef.current.write(payload)
        })
      } else {
        term.write(buffered)
        liveChunkBufferRef.current = ''
      }
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
          void terminalCore.resize(ptyId, term.cols, term.rows)?.catch(() => {})
        } catch {
          // Ignore hidden container transitions.
        }
      })
    }
  }, [lifecycle, ptyId])

  return { terminal: termRef.current, fitAddon: fitRef.current }
}

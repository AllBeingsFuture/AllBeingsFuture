import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { WindowAPI, onIpc } from '../../../bindings/electron-api'

const isMac =
  typeof navigator !== 'undefined' &&
  (/Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent))

const isWindows =
  typeof navigator !== 'undefined' &&
  (/Windows/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent))

const dragStyle = {
  WebkitAppRegion: 'drag',
} as CSSProperties

const noDragStyle = {
  WebkitAppRegion: 'no-drag',
} as CSSProperties

export default function TitleBar() {
  const [isMaximised, setIsMaximised] = useState(false)

  useEffect(() => {
    if (!isWindows) {
      return
    }

    let active = true
    void WindowAPI.isMaximized()
      .then(maximised => {
        if (active) {
          setIsMaximised(Boolean(maximised))
        }
      })
      .catch(() => {})

    const offMaximise = onIpc('common:WindowMaximise', () => setIsMaximised(true))
    const offUnMaximise = onIpc('common:WindowUnMaximise', () => setIsMaximised(false))
    const offRestore = onIpc('common:WindowRestore', () => setIsMaximised(false))

    return () => {
      active = false
      offMaximise()
      offUnMaximise()
      offRestore()
    }
  }, [])

  const handleToggleMaximise = () => {
    if (!isWindows) {
      return
    }
    void WindowAPI.maximize()
  }

  return (
    <div
      className="flex items-center h-9 bg-bg-secondary border-b border-border flex-shrink-0 select-none"
      style={dragStyle}
      onDoubleClick={handleToggleMaximise}
    >
      {isMac && <div className="w-[72px] flex-shrink-0" />}

      <div className="flex-1" />

      {isWindows ? (
        <div className="flex h-full flex-shrink-0" style={noDragStyle}>
          <button
            type="button"
            onClick={() => void WindowAPI.minimize()}
            className="flex h-full w-11 items-center justify-center text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            aria-label="最小化窗口"
            title="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximise}
            className="flex h-full w-11 items-center justify-center text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            aria-label={isMaximised ? '还原窗口' : '最大化窗口'}
            title={isMaximised ? '还原' : '最大化'}
          >
            {isMaximised ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => void WindowAPI.close()}
            className="flex h-full w-11 items-center justify-center text-slate-400 transition-colors hover:bg-red-500 hover:text-white"
            aria-label="关闭窗口"
            title="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        !isMac && <div className="w-36 flex-shrink-0" />
      )}
    </div>
  )
}

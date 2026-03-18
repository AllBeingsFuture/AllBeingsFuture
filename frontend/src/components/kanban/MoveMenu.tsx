import { useEffect, useRef } from 'react'
import { COLUMNS, COLUMN_STYLES } from './kanbanConstants'

interface MoveMenuProps {
  currentStatus: string
  onMove: (status: string) => void
  onClose: () => void
}

export default function MoveMenu({ currentStatus, onMove, onClose }: MoveMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-dark-border bg-dark-card shadow-xl py-1"
    >
      <div className="px-3 py-1.5 text-xs text-gray-500 font-medium">移动到</div>
      {COLUMNS.filter((col) => col.id !== currentStatus).map((col) => {
        const style = COLUMN_STYLES[col.color]
        const Icon = col.icon
        return (
          <button
            key={col.id}
            onClick={() => {
              onMove(col.id)
              onClose()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-dark-border/50 transition-colors"
          >
            <Icon className={`h-3.5 w-3.5 ${style.header}`} />
            {col.label}
          </button>
        )
      })}
    </div>
  )
}

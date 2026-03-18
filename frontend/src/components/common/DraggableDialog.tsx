import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDraggable } from '../../hooks/useDraggable'

let globalZCounter = 60

function nextZ(): number {
  return ++globalZCounter
}

interface DraggableDialogProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  widthClass?: string
  heightClass?: string
  showBackdrop?: boolean
  closeOnBackdropClick?: boolean
  testId?: string
  className?: string
}

export default function DraggableDialog({
  title,
  subtitle,
  icon,
  onClose,
  children,
  widthClass = 'w-[560px]',
  heightClass = 'max-h-[85vh]',
  showBackdrop = true,
  closeOnBackdropClick = true,
  testId,
  className = '',
}: DraggableDialogProps) {
  const { dialogRef, handleMouseDown, position, isDragging } = useDraggable()
  const [zIndex, setZIndex] = useState(() => nextZ())

  const bringToFront = useCallback(() => {
    setZIndex(nextZ())
  }, [])

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const content = (
    <>
      {/* Backdrop */}
      {showBackdrop && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          style={{ zIndex: zIndex - 1 }}
          onClick={closeOnBackdropClick ? onClose : undefined}
        />
      )}

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={testId ? `${testId}-title` : undefined}
        data-testid={testId}
        className={[
          'fixed flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1117]/98 shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl',
          widthClass,
          heightClass,
          className,
        ].join(' ')}
        style={{
          left: position.x,
          top: position.y,
          zIndex,
        }}
        onMouseDown={bringToFront}
      >
        {/* Title bar - drag handle */}
        <div
          className={[
            'flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          ].join(' ')}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-blue-500/10 text-blue-300">
                {icon}
              </span>
            )}
            <div>
              {subtitle && (
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{subtitle}</p>
              )}
              <h2
                id={testId ? `${testId}-title` : undefined}
                className="text-base font-semibold text-white"
              >
                {title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-all duration-200 hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </>
  )

  return createPortal(content, document.body)
}

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
          className="fixed inset-0 bg-black/70"
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
          'fixed flex flex-col overflow-hidden border border-[#2e2e2e] bg-[#111]',
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
            'flex shrink-0 items-center justify-between border-b border-[#2e2e2e] px-5 py-3',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          ].join(' ')}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex h-7 w-7 items-center justify-center border border-[#2e2e2e] bg-[#1a1a1a] text-[#ff4f1a]">
                {icon}
              </span>
            )}
            <div>
              {subtitle && (
                <p className="text-[9px] uppercase tracking-[0.25em] text-[#444]">{subtitle}</p>
              )}
              <h2
                id={testId ? `${testId}-title` : undefined}
                className="text-[13px] font-600 text-[#e8e4de]"
              >
                {title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center text-[#444] transition-colors hover:bg-[#1a1a1a] hover:text-[#888]"
            onClick={onClose}
          >
            <X size={14} />
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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Position {
  x: number
  y: number
}

interface UseDraggableReturn {
  /** Bind to the dialog container */
  dialogRef: React.RefObject<HTMLDivElement>
  /** Bind to the drag handle (title bar) onMouseDown */
  handleMouseDown: (e: React.MouseEvent) => void
  /** Current position */
  position: Position
  /** Whether currently dragging */
  isDragging: boolean
}

export function useDraggable(): UseDraggableReturn {
  const dialogRef = useRef<HTMLDivElement>(null!)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const offsetRef = useRef<Position>({ x: 0, y: 0 })
  const centeredRef = useRef(false)

  // Center on mount once we know the element size
  useLayoutEffect(() => {
    if (centeredRef.current) return
    const el = dialogRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, (window.innerWidth - rect.width) / 2)
    const y = Math.max(0, (window.innerHeight - rect.height) / 2)
    setPosition({ x, y })
    centeredRef.current = true
  }, [])

  const constrain = useCallback((pos: Position): Position => {
    const el = dialogRef.current
    if (!el) return pos
    const rect = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(pos.x, window.innerWidth - rect.width)),
      y: Math.max(0, Math.min(pos.y, window.innerHeight - rect.height)),
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't drag if clicking a button or interactive element
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('a')) return

    e.preventDefault()
    setIsDragging(true)
    offsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newPos = constrain({
        x: e.clientX - offsetRef.current.x,
        y: e.clientY - offsetRef.current.y,
      })
      setPosition(newPos)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // Prevent text selection while dragging
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, constrain])

  // Re-constrain on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => constrain(prev))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [constrain])

  return { dialogRef, handleMouseDown, position, isDragging }
}

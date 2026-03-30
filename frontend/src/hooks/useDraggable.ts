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
  const positionRef = useRef<Position>({ x: 0, y: 0 })
  const pendingPositionRef = useRef<Position | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const centeredRef = useRef(false)

  const flushPosition = useCallback(() => {
    animationFrameRef.current = null

    const nextPosition = pendingPositionRef.current
    if (!nextPosition) return

    positionRef.current = nextPosition
    pendingPositionRef.current = null

    const el = dialogRef.current
    if (!el) return

    el.style.transform = `translate3d(${nextPosition.x}px, ${nextPosition.y}px, 0)`
  }, [])

  // Center on mount once we know the element size
  useLayoutEffect(() => {
    if (centeredRef.current) return
    const el = dialogRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, (window.innerWidth - rect.width) / 2)
    const y = Math.max(0, (window.innerHeight - rect.height) / 2)

    positionRef.current = { x, y }
    setPosition({ x, y })
    centeredRef.current = true
  }, [])

  const constrain = useCallback((pos: Position): Position => {
    const el = dialogRef.current
    if (!el) return pos
    const width = el.offsetWidth
    const height = el.offsetHeight
    return {
      x: Math.max(0, Math.min(pos.x, window.innerWidth - width)),
      y: Math.max(0, Math.min(pos.y, window.innerHeight - height)),
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't drag if clicking a button or interactive element
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('a')) return

    e.preventDefault()
    setIsDragging(true)
    offsetRef.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    }
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      pendingPositionRef.current = constrain({
        x: e.clientX - offsetRef.current.x,
        y: e.clientY - offsetRef.current.y,
      })

      if (typeof requestAnimationFrame === 'function') {
        if (animationFrameRef.current !== null) return
        animationFrameRef.current = requestAnimationFrame(flushPosition)
        return
      }

      flushPosition()
    }

    const handleMouseUp = () => {
      if (animationFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }

      flushPosition()
      setPosition(positionRef.current)
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // Prevent text selection while dragging
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    return () => {
      if (animationFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [constrain, flushPosition, isDragging])

  // Re-constrain on window resize
  useEffect(() => {
    const handleResize = () => {
      const nextPosition = constrain(positionRef.current)
      positionRef.current = nextPosition
      setPosition(nextPosition)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [constrain])

  return { dialogRef, handleMouseDown, position, isDragging }
}

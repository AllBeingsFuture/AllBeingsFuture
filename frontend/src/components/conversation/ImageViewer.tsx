import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'

interface ImageViewerProps {
  images: string[]
  initialIndex?: number
  onClose: () => void
}

const MIN_SCALE = 0.5
const MAX_SCALE = 8
const ZOOM_STEP = 0.3

export default function ImageViewer({ images, initialIndex = 0, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const posStart = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const currentImage = images[currentIndex]

  // Reset transform when switching images
  const resetTransform = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  // Navigate between images
  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < images.length) {
      setCurrentIndex(index)
      resetTransform()
    }
  }, [images.length, resetTransform])

  const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo])
  const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo])

  // Zoom
  const zoomTo = useCallback((newScale: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale))
    setScale(clamped)
    // When zooming out to 1 or below, reset position
    if (clamped <= 1) {
      setPosition({ x: 0, y: 0 })
    }
  }, [])

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setScale(prev => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta * prev * 0.5))
      if (newScale <= 1) {
        setPosition({ x: 0, y: 0 })
      }
      return newScale
    })
  }, [])

  // Double click to toggle zoom
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (scale > 1.1) {
      resetTransform()
    } else {
      // Zoom to 2.5x centered on click point
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        const cx = e.clientX - rect.left - rect.width / 2
        const cy = e.clientY - rect.top - rect.height / 2
        setScale(2.5)
        setPosition({ x: -cx * 1.5, y: -cy * 1.5 })
      }
    }
  }, [scale, resetTransform])

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return
    e.preventDefault()
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    posStart.current = { ...position }
  }, [scale, position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setPosition({
      x: posStart.current.x + dx,
      y: posStart.current.y + dy,
    })
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          goPrev()
          break
        case 'ArrowRight':
          goNext()
          break
        case '+':
        case '=':
          zoomTo(scale + ZOOM_STEP * scale * 0.5)
          break
        case '-':
          zoomTo(scale - ZOOM_STEP * scale * 0.5)
          break
        case '0':
          resetTransform()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goPrev, goNext, zoomTo, scale, resetTransform])

  // Close on background click (only if not dragging and not zoomed)
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isDragging) {
      onClose()
    }
  }, [isDragging, onClose])

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex flex-col bg-black/90 select-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Top toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2 text-white/60 text-sm">
            {images.length > 1 && (
              <span>{currentIndex + 1} / {images.length}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => zoomTo(scale - ZOOM_STEP * scale * 0.5)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="缩小"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-white/50 text-xs min-w-[48px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => zoomTo(scale + ZOOM_STEP * scale * 0.5)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="放大"
            >
              <ZoomIn size={18} />
            </button>
            <button
              onClick={resetTransform}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="还原"
            >
              <RotateCcw size={16} />
            </button>
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="关闭 (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Image area */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center overflow-hidden"
          style={{ cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default' }}
          onClick={handleBackdropClick}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        >
          <motion.img
            key={currentImage}
            src={currentImage}
            alt="预览"
            className="max-w-[90vw] max-h-[85vh] object-contain pointer-events-none"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
            draggable={false}
          />
        </div>

        {/* Left/Right navigation arrows */}
        {images.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button
                onClick={goPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/60 hover:text-white hover:bg-black/60 backdrop-blur-sm transition-colors z-10"
              >
                <ChevronLeft size={24} />
              </button>
            )}
            {currentIndex < images.length - 1 && (
              <button
                onClick={goNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/60 hover:text-white hover:bg-black/60 backdrop-blur-sm transition-colors z-10"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </>
        )}

        {/* Bottom thumbnail strip (when multiple images) */}
        {images.length > 1 && (
          <div className="flex items-center justify-center gap-2 py-3 px-4 bg-black/40 backdrop-blur-sm z-10">
            {images.map((url, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                  i === currentIndex
                    ? 'border-blue-400 opacity-100 shadow-lg shadow-blue-500/20'
                    : 'border-transparent opacity-50 hover:opacity-80'
                }`}
              >
                <img
                  src={url}
                  alt={`缩略图 ${i + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

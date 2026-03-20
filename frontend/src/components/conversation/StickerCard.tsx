import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Bot } from 'lucide-react'
import { useStickerStore } from '../../stores/stickerStore'

const MOOD_LABELS: Record<string, string> = {
  happy: '开心',
  sad: '难过',
  angry: '生气',
  greeting: '问候',
  encourage: '加油',
  love: '爱',
  tired: '摸鱼',
  surprise: '震惊',
}

interface Props {
  mood: string
  /** Stable key to cache the resolved sticker across re-renders */
  cacheKey: string
}

// Module-level cache to persist stickers across re-renders and component unmounts
const stickerCache = new Map<string, { url: string; name: string }>()

export default function StickerCard({ mood, cacheKey }: Props) {
  const { searchByMood, initialize, status } = useStickerStore()
  const [sticker, setSticker] = useState<{ url: string; name: string } | null>(
    stickerCache.get(cacheKey) ?? null,
  )
  const [error, setError] = useState(false)
  const resolving = useRef(false)

  useEffect(() => {
    if (sticker || resolving.current) return

    resolving.current = true
    const resolve = async () => {
      try {
        if (!status?.initialized) {
          await initialize()
        }
        const results = await searchByMood(mood, 1)
        if (results.length > 0) {
          const s = { url: results[0].url, name: results[0].name }
          stickerCache.set(cacheKey, s)
          setSticker(s)
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        resolving.current = false
      }
    }
    void resolve()
  }, [cacheKey, initialize, mood, searchByMood, status?.initialized, sticker])

  if (error) return null

  return (
    <motion.div
      className="flex gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/10 text-purple-300 shadow-sm">
        <Bot size={15} />
      </div>
      <div className="max-w-[280px]">
        {sticker ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2 overflow-hidden">
            <img
              src={sticker.url}
              alt={sticker.name}
              className="max-w-[250px] max-h-[200px] object-contain rounded-xl"
              loading="lazy"
            />
            <div className="mt-1 text-[10px] text-gray-500 text-center">
              {MOOD_LABELS[mood] || mood}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs text-gray-500">
            加载表情包中...
          </div>
        )}
      </div>
    </motion.div>
  )
}

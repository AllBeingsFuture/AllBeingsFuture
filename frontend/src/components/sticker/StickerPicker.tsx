import { useState, useEffect, useCallback } from 'react'
import { useStickerStore, type StickerResult } from '../../stores/stickerStore'
import { Search, Smile, RefreshCw, Trash2, Loader2 } from 'lucide-react'

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

const MOOD_EMOJI: Record<string, string> = {
  happy: '😄',
  sad: '😢',
  angry: '😡',
  greeting: '👋',
  encourage: '💪',
  love: '❤️',
  tired: '😴',
  surprise: '😱',
}

interface Props {
  onSelect?: (sticker: StickerResult) => void
  compact?: boolean
}

export default function StickerPicker({ onSelect, compact = false }: Props) {
  const {
    results, status, moods, searching, loading, error,
    search, searchByMood, loadStatus, loadMoods, loadCategories, initialize,
  } = useStickerStore()

  const [query, setQuery] = useState('')
  const [activeMood, setActiveMood] = useState<string | null>(null)

  useEffect(() => {
    if (!status) {
      initialize()
    }
  }, [status, initialize])

  const handleSearch = useCallback(async () => {
    if (query.trim()) {
      setActiveMood(null)
      await search(query.trim(), '', 20)
    }
  }, [query, search])

  const handleMoodClick = useCallback(async (mood: string) => {
    setActiveMood(mood)
    setQuery('')
    await searchByMood(mood, 20)
  }, [searchByMood])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }, [handleSearch])

  return (
    <div className={`flex flex-col gap-3 ${compact ? '' : 'p-4'}`}>
      {/* Search bar */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="搜索表情包..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400/40"
        />
        {searching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-400" />
        )}
      </div>

      {/* Mood buttons */}
      <div className="flex flex-wrap gap-1.5">
        {(moods.length > 0 ? moods : Object.keys(MOOD_LABELS)).map((mood) => (
          <button
            key={mood}
            onClick={() => handleMoodClick(mood)}
            className={[
              'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition',
              activeMood === mood
                ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30'
                : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10',
            ].join(' ')}
          >
            <span>{MOOD_EMOJI[mood] || '😀'}</span>
            <span>{MOOD_LABELS[mood] || mood}</span>
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto pr-1">
          {results.map((sticker, i) => (
            <button
              key={`${sticker.url}-${i}`}
              onClick={() => onSelect?.(sticker)}
              className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5 hover:border-blue-400/30 hover:bg-white/10 transition"
              title={sticker.name}
            >
              <img
                src={sticker.url}
                alt={sticker.name}
                className="h-full w-full object-contain p-1"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-1 opacity-0 group-hover:opacity-100 transition">
                <p className="truncate text-[10px] text-white/80">{sticker.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !searching && !loading && (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <Smile size={32} className="mb-2 opacity-50" />
          <p className="text-sm">搜索关键词或选择情绪查找表情包</p>
          {status && (
            <p className="mt-1 text-xs text-slate-600">
              共 {status.totalStickers.toLocaleString()} 款贴纸
            </p>
          )}
        </div>
      )}

      {/* Status bar */}
      {!compact && status && (
        <div className="flex items-center justify-between text-xs text-slate-500 border-t border-white/5 pt-2">
          <span>
            {status.totalStickers.toLocaleString()} 贴纸 · {status.cachedFiles} 已缓存
          </span>
          <span className={status.initialized ? 'text-green-400' : 'text-yellow-400'}>
            {status.initialized ? '已就绪' : '初始化中...'}
          </span>
        </div>
      )}
    </div>
  )
}

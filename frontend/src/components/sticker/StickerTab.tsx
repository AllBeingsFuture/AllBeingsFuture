import { useState, useEffect } from 'react'
import { useStickerStore } from '../../stores/stickerStore'
import StickerPicker from './StickerPicker'
import { RefreshCw, Trash2, Loader2, HardDrive, Database, Tag } from 'lucide-react'

export default function StickerTab() {
  const { status, loading, refreshIndex, clearCache, loadStatus } = useStickerStore()
  const [clearCount, setClearCount] = useState<number | null>(null)

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleRefresh = async () => {
    await refreshIndex()
  }

  const handleClearCache = async () => {
    const count = await clearCache()
    setClearCount(count)
    setTimeout(() => setClearCount(null), 3000)
  }

  return (
    <div className="space-y-6">
      {/* Status cards */}
      {status && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Database size={14} />
              <span className="text-xs uppercase tracking-wider">贴纸总数</span>
            </div>
            <p className="text-2xl font-bold text-white">{status.totalStickers.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Tag size={14} />
              <span className="text-xs uppercase tracking-wider">分类 / 关键词</span>
            </div>
            <p className="text-2xl font-bold text-white">{status.categories} / {status.keywords}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <HardDrive size={14} />
              <span className="text-xs uppercase tracking-wider">本地缓存</span>
            </div>
            <p className="text-2xl font-bold text-white">{status.cachedFiles} 文件</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          刷新索引
        </button>
        <button
          onClick={handleClearCache}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/20 transition"
        >
          <Trash2 size={14} />
          清除缓存
        </button>
        {clearCount !== null && (
          <span className="self-center text-xs text-green-400">
            已清除 {clearCount} 个缓存文件
          </span>
        )}
      </div>

      {/* Data dir */}
      {status?.dataDir && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">数据目录</p>
          <p className="text-sm text-slate-300 font-mono">{status.dataDir}</p>
        </div>
      )}

      {/* Sticker picker preview */}
      <div>
        <h4 className="text-sm font-medium text-white mb-3">预览搜索</h4>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <StickerPicker
            compact
            onSelect={(sticker) => {
              console.log('Selected sticker:', sticker)
            }}
          />
        </div>
      </div>
    </div>
  )
}

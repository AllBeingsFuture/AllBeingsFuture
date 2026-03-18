import { useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'

const presets = [
  { label: '小', size: 12 },
  { label: '标准', size: 14 },
  { label: '大', size: 16 },
  { label: '超大', size: 18 },
]

export default function AppearanceTab() {
  const { settings, update } = useSettingsStore()
  const [fontSize, setFontSize] = useState(settings.fontSize || 14)

  const applySize = (size: number) => {
    setFontSize(size)
    document.documentElement.style.fontSize = `${size}px`
    update('fontSize', String(size))
  }

  return (
    <div className="space-y-6">
      {/* Font size presets */}
      <section>
        <h4 className="text-sm font-medium mb-3">字体大小</h4>
        <div className="flex gap-2 mb-4">
          {presets.map(p => (
            <button
              key={p.size}
              onClick={() => applySize(p.size)}
              className={`px-4 py-2 text-xs rounded-lg border transition-colors ${
                fontSize === p.size
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-dark-border text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              {p.label} / {p.size}px
            </button>
          ))}
        </div>

        {/* Slider */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 w-8">10</span>
          <input
            type="range"
            min={10}
            max={24}
            value={fontSize}
            onChange={e => applySize(Number(e.target.value))}
            className="flex-1 accent-blue-500 h-1.5"
          />
          <span className="text-xs text-gray-500 w-8">24</span>
          <span className="text-sm font-mono text-white bg-dark-bg px-2 py-1 rounded border border-dark-border">
            {fontSize}px
          </span>
        </div>
      </section>

      {/* Preview */}
      <section>
        <h4 className="text-sm font-medium mb-3">预览</h4>
        <div className="p-4 bg-dark-bg border border-dark-border rounded-lg space-y-2">
          <p style={{ fontSize: `${fontSize + 4}px` }} className="font-semibold">
            标题文字 Heading Text
          </p>
          <p style={{ fontSize: `${fontSize}px` }}>
            正文内容。The quick brown fox jumps over the lazy dog.
          </p>
          <p style={{ fontSize: `${fontSize - 2}px` }} className="text-gray-500">
            辅助说明文字 Secondary text at smaller size.
          </p>
        </div>
      </section>
    </div>
  )
}

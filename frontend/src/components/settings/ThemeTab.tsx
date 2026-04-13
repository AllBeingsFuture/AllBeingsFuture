import { useShallow } from 'zustand/react/shallow'
import { THEME_LIST, THEMES } from '../../constants/themes'
import { useSettingsStore } from '../../stores/settingsStore'

export default function ThemeTab() {
  const { activeTheme, update } = useSettingsStore(useShallow((state) => ({
    activeTheme: state.settings.theme,
    update: state.update,
  })))

  const handleThemeChange = (themeId: string) => {
    const theme = THEMES[themeId as keyof typeof THEMES]
    if (!theme) return

    void update('theme', themeId)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">选择界面配色方案，切换后立即生效。</p>

      <div className="grid grid-cols-2 gap-3">
        {THEME_LIST.map(theme => {
          const isActive = activeTheme === theme.id
          return (
            <button
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              className={`relative p-3 rounded-xl border-2 transition-all text-left ${
                isActive
                  ? 'border-blue-500 ring-1 ring-blue-500/30'
                  : 'border-dark-border hover:border-gray-500'
              }`}
            >
              {/* Color preview bar */}
              <div className="flex gap-1 mb-2.5 h-6 rounded-md overflow-hidden">
                <div className="flex-1 rounded-l-md" style={{ backgroundColor: theme.preview.bg }} />
                <div className="flex-1" style={{ backgroundColor: theme.preview.card }} />
                <div className="w-8 rounded-r-md" style={{ backgroundColor: theme.preview.accent }} />
              </div>

              {/* Name and badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: theme.preview.text }}>
                  {theme.label}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                  {theme.type}
                </span>
              </div>

              {/* Selected indicator */}
              {isActive && (
                <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-blue-500" />
              )}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-gray-500">
        主题偏好会自动保存，下次打开应用时将恢复上次选择的主题。
      </p>
    </div>
  )
}

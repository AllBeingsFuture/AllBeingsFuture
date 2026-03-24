import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore } from '../../stores/settingsStore'

const themes = [
  {
    id: 'dark',
    name: '深空蓝',
    type: '暗色',
    colors: { bg: '#1b2636', card: '#1e293b', accent: '#3b82f6', text: '#e2e8f0' },
    vars: {
      '--color-bg': '#1b2636',
      '--color-card': '#1e293b',
      '--color-border': '#334155',
      '--color-hover': '#2d3f55',
      '--color-accent': '#3b82f6',
      '--color-accent-hover': '#2563eb',
      '--color-text': '#e2e8f0',
      '--color-text-muted': '#94a3b8',
    },
  },
  {
    id: 'midnight',
    name: '午夜黑',
    type: '暗色',
    colors: { bg: '#0f0f0f', card: '#1a1a1a', accent: '#8b5cf6', text: '#e4e4e7' },
    vars: {
      '--color-bg': '#0f0f0f',
      '--color-card': '#1a1a1a',
      '--color-border': '#2e2e2e',
      '--color-hover': '#262626',
      '--color-accent': '#8b5cf6',
      '--color-accent-hover': '#7c3aed',
      '--color-text': '#e4e4e7',
      '--color-text-muted': '#a1a1aa',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    type: '暗色',
    colors: { bg: '#2e3440', card: '#3b4252', accent: '#88c0d0', text: '#eceff4' },
    vars: {
      '--color-bg': '#2e3440',
      '--color-card': '#3b4252',
      '--color-border': '#4c566a',
      '--color-hover': '#434c5e',
      '--color-accent': '#88c0d0',
      '--color-accent-hover': '#81a1c1',
      '--color-text': '#eceff4',
      '--color-text-muted': '#d8dee9',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    type: '暗色',
    colors: { bg: '#282a36', card: '#2d303e', accent: '#bd93f9', text: '#f8f8f2' },
    vars: {
      '--color-bg': '#282a36',
      '--color-card': '#2d303e',
      '--color-border': '#44475a',
      '--color-hover': '#383a4a',
      '--color-accent': '#bd93f9',
      '--color-accent-hover': '#a77bf3',
      '--color-text': '#f8f8f2',
      '--color-text-muted': '#6272a4',
    },
  },
  {
    id: 'emerald',
    name: '翡翠绿',
    type: '暗色',
    colors: { bg: '#0c1a14', card: '#132a1f', accent: '#10b981', text: '#e2e8f0' },
    vars: {
      '--color-bg': '#0c1a14',
      '--color-card': '#132a1f',
      '--color-border': '#1e3a2b',
      '--color-hover': '#1a3325',
      '--color-accent': '#10b981',
      '--color-accent-hover': '#059669',
      '--color-text': '#e2e8f0',
      '--color-text-muted': '#94a3b8',
    },
  },
  {
    id: 'rose',
    name: '玫瑰金',
    type: '暗色',
    colors: { bg: '#1a0f14', card: '#2a1520', accent: '#f43f5e', text: '#fce7f3' },
    vars: {
      '--color-bg': '#1a0f14',
      '--color-card': '#2a1520',
      '--color-border': '#3d1f2e',
      '--color-hover': '#331a27',
      '--color-accent': '#f43f5e',
      '--color-accent-hover': '#e11d48',
      '--color-text': '#fce7f3',
      '--color-text-muted': '#a8829a',
    },
  },
]

export default function ThemeTab() {
  const { activeTheme, update } = useSettingsStore(useShallow((state) => ({
    activeTheme: state.settings.theme,
    update: state.update,
  })))

  const handleThemeChange = (themeId: string) => {
    const theme = themes.find(t => t.id === themeId)
    if (!theme) return

    // Apply CSS variables
    const root = document.documentElement
    Object.entries(theme.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })

    // Update tailwind dark colors dynamically
    document.body.style.backgroundColor = theme.vars['--color-bg']

    // Persist
    update('theme', themeId)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">选择界面配色方案，切换后立即生效。</p>

      <div className="grid grid-cols-2 gap-3">
        {themes.map(theme => {
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
                <div className="flex-1 rounded-l-md" style={{ backgroundColor: theme.colors.bg }} />
                <div className="flex-1" style={{ backgroundColor: theme.colors.card }} />
                <div className="w-8 rounded-r-md" style={{ backgroundColor: theme.colors.accent }} />
              </div>

              {/* Name and badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: theme.colors.text }}>
                  {theme.name}
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

/** Apply saved theme on app startup */
export function applyTheme(themeId: string) {
  const theme = themes.find(t => t.id === themeId)
  if (!theme) return
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  document.body.style.backgroundColor = theme.vars['--color-bg']
}

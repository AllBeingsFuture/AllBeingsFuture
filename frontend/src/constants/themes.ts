export type ThemeId = 'dark' | 'midnight' | 'nord' | 'dracula' | 'emerald' | 'rose'

export interface ThemeDefinition {
  id: ThemeId
  label: string
  type: '暗色'
  preview: {
    bg: string
    card: string
    accent: string
    text: string
  }
  vars: Record<string, string>
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  dark: {
    id: 'dark',
    label: '深空蓝',
    type: '暗色',
    preview: { bg: '#1b2636', card: '#1e293b', accent: '#3b82f6', text: '#e2e8f0' },
    vars: {
      '--color-bg': '#1b2636',
      '--color-card': '#1e293b',
      '--color-border': '#334155',
      '--color-hover': '#2d3f55',
      '--color-accent': '#3b82f6',
      '--color-accent-hover': '#2563eb',
      '--color-text': '#e2e8f0',
      '--color-text-muted': '#94a3b8',
      '--color-success': '#22c55e',
      '--color-warning': '#f59e0b',
      '--color-error': '#ef4444',
    },
  },
  midnight: {
    id: 'midnight',
    label: '午夜黑',
    type: '暗色',
    preview: { bg: '#0f0f0f', card: '#1a1a1a', accent: '#8b5cf6', text: '#e4e4e7' },
    vars: {
      '--color-bg': '#0f0f0f',
      '--color-card': '#1a1a1a',
      '--color-border': '#2e2e2e',
      '--color-hover': '#262626',
      '--color-accent': '#8b5cf6',
      '--color-accent-hover': '#7c3aed',
      '--color-text': '#e4e4e7',
      '--color-text-muted': '#a1a1aa',
      '--color-success': '#22c55e',
      '--color-warning': '#f59e0b',
      '--color-error': '#ef4444',
    },
  },
  nord: {
    id: 'nord',
    label: 'Nord',
    type: '暗色',
    preview: { bg: '#2e3440', card: '#3b4252', accent: '#88c0d0', text: '#eceff4' },
    vars: {
      '--color-bg': '#2e3440',
      '--color-card': '#3b4252',
      '--color-border': '#4c566a',
      '--color-hover': '#434c5e',
      '--color-accent': '#88c0d0',
      '--color-accent-hover': '#81a1c1',
      '--color-text': '#eceff4',
      '--color-text-muted': '#d8dee9',
      '--color-success': '#a3be8c',
      '--color-warning': '#ebcb8b',
      '--color-error': '#bf616a',
    },
  },
  dracula: {
    id: 'dracula',
    label: 'Dracula',
    type: '暗色',
    preview: { bg: '#282a36', card: '#2d303e', accent: '#bd93f9', text: '#f8f8f2' },
    vars: {
      '--color-bg': '#282a36',
      '--color-card': '#2d303e',
      '--color-border': '#44475a',
      '--color-hover': '#383a4a',
      '--color-accent': '#bd93f9',
      '--color-accent-hover': '#a77bf3',
      '--color-text': '#f8f8f2',
      '--color-text-muted': '#6272a4',
      '--color-success': '#50fa7b',
      '--color-warning': '#f1fa8c',
      '--color-error': '#ff5555',
    },
  },
  emerald: {
    id: 'emerald',
    label: '翡翠绿',
    type: '暗色',
    preview: { bg: '#0c1a14', card: '#132a1f', accent: '#10b981', text: '#e2e8f0' },
    vars: {
      '--color-bg': '#0c1a14',
      '--color-card': '#132a1f',
      '--color-border': '#1e3a2b',
      '--color-hover': '#1a3325',
      '--color-accent': '#10b981',
      '--color-accent-hover': '#059669',
      '--color-text': '#e2e8f0',
      '--color-text-muted': '#94a3b8',
      '--color-success': '#34d399',
      '--color-warning': '#fbbf24',
      '--color-error': '#f87171',
    },
  },
  rose: {
    id: 'rose',
    label: '玫瑰金',
    type: '暗色',
    preview: { bg: '#1a0f14', card: '#2a1520', accent: '#f43f5e', text: '#fce7f3' },
    vars: {
      '--color-bg': '#1a0f14',
      '--color-card': '#2a1520',
      '--color-border': '#3d1f2e',
      '--color-hover': '#331a27',
      '--color-accent': '#f43f5e',
      '--color-accent-hover': '#e11d48',
      '--color-text': '#fce7f3',
      '--color-text-muted': '#a8829a',
      '--color-success': '#34d399',
      '--color-warning': '#fbbf24',
      '--color-error': '#fb7185',
    },
  },
}

export const THEME_LIST = Object.values(THEMES)

export const DEFAULT_THEME: ThemeId = 'dark'

export function applyTheme(themeId: string) {
  const theme = THEMES[(themeId as ThemeId) || DEFAULT_THEME] ?? THEMES[DEFAULT_THEME]
  const root = document.documentElement
  root.dataset.theme = theme.id
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  document.body.style.backgroundColor = theme.vars['--color-bg']
}

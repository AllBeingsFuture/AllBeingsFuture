export type ThemeId = 'dark' | 'midnight' | 'nord'

export interface ThemeDefinition {
  id: ThemeId
  label: string
  vars: Record<string, string>
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  dark: {
    id: 'dark',
    label: 'Deep Space',
    vars: {
      '--color-bg': '#111827',
      '--color-card': '#18212f',
      '--color-border': '#2b3748',
      '--color-hover': '#223044',
      '--color-accent': '#3b82f6',
      '--color-accent-hover': '#2563eb',
      '--color-text': '#e5eefb',
      '--color-text-muted': '#93a3ba',
      '--color-success': '#22c55e',
      '--color-warning': '#f59e0b',
      '--color-error': '#ef4444',
    },
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    vars: {
      '--color-bg': '#0a0f18',
      '--color-card': '#121926',
      '--color-border': '#253047',
      '--color-hover': '#1a2332',
      '--color-accent': '#7c3aed',
      '--color-accent-hover': '#6d28d9',
      '--color-text': '#e8ecf8',
      '--color-text-muted': '#98a3b8',
      '--color-success': '#22c55e',
      '--color-warning': '#f59e0b',
      '--color-error': '#ef4444',
    },
  },
  nord: {
    id: 'nord',
    label: 'Nord',
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
}

export const DEFAULT_THEME: ThemeId = 'dark'

export function applyTheme(themeId: string) {
  const theme = THEMES[(themeId as ThemeId) || DEFAULT_THEME] ?? THEMES[DEFAULT_THEME]
  const root = document.documentElement
  root.dataset.theme = theme.id
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
}

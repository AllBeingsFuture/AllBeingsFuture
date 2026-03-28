export type ThemeId = 'dark' | 'midnight' | 'nord'

export interface ThemeDefinition {
  id: ThemeId
  label: string
  vars: Record<string, string>
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  dark: {
    id: 'dark',
    label: 'Brutalist',
    vars: {
      '--color-bg': '#0c0c0c',
      '--color-card': '#111111',
      '--color-border': '#2e2e2e',
      '--color-hover': '#1a1a1a',
      '--color-accent': '#ff4f1a',
      '--color-accent-hover': '#e63d06',
      '--color-text': '#e8e4de',
      '--color-text-muted': '#555555',
      '--color-success': '#3eb550',
      '--color-warning': '#c4931a',
      '--color-error': '#e04040',
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

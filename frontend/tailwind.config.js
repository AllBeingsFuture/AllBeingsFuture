/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#1b2636',
          card: '#1e293b',
          border: '#334155',
          hover: '#2d3f55',
          accent: '#3b82f6',
        },
        'bg-primary': 'var(--color-bg-primary)',
        'bg-secondary': 'var(--color-bg-secondary)',
        'bg-tertiary': 'var(--color-bg-tertiary)',
        'bg-hover': 'var(--color-bg-hover)',
        'bg-input': 'var(--color-bg-input)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        'accent-blue': 'var(--color-accent-blue)',
        'accent-green': 'var(--color-accent-green)',
        'accent-yellow': 'var(--color-accent-yellow)',
        'accent-red': 'var(--color-accent-red)',
        'accent-purple': 'var(--color-accent-purple)',
        'border': 'var(--color-border)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

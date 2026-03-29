import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Strip crossorigin attribute from HTML tags — file:// protocol doesn't support CORS
function removeCrossOrigin(): import('vite').Plugin {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '')
    },
  }
}

export default defineConfig({
  plugins: [react(), removeCrossOrigin()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('monaco-editor')) return 'vendor-monaco'
          if (id.includes('@xterm') || id.includes('/xterm')) return 'vendor-xterm'
          if (id.includes('recharts') || id.includes('/d3-')) return 'vendor-charts'
          if (
            id.includes('react-markdown')
            || id.includes('remark-gfm')
            || id.includes('/remark-')
            || id.includes('/rehype-')
            || id.includes('/mdast-')
            || id.includes('/micromark')
            || id.includes('/unified')
          ) {
            return 'vendor-markdown'
          }
          if (id.includes('allotment') || id.includes('framer-motion')) return 'vendor-ui'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (
            id.includes('/react/')
            || id.includes('/react-dom/')
            || id.includes('/scheduler/')
            || id.includes('/zustand/')
          ) {
            return 'vendor-react'
          }

          return 'vendor-misc'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})

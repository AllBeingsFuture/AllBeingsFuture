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

/** Drop bulky JSDoc from generated models only in the bundle (source keeps types for tsc). */
function stripModelsJsdoc(): import('vite').Plugin {
  return {
    name: 'strip-models-jsdoc',
    transform(code, id) {
      if (!id.includes('bindings/allbeingsfuture/internal/models/models.js')) return null
      const stripped = code
        .replace(/\/\*\*?[\s\S]*?\*\//g, '')
        .replace(/\n{3,}/g, '\n\n')
      return { code: stripped, map: null }
    },
  }
}

export default defineConfig({
  plugins: [react(), removeCrossOrigin(), stripModelsJsdoc()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    cssMinify: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      // Generated models.js is pure exports; allow dropping unused classes
      treeshake: {
        moduleSideEffects(id) {
          if (id.includes('bindings/allbeingsfuture/internal/models/models.js')) return false
          if (id.includes('bindings/time/models.js')) return false
          return true
        },
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

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
          if (id.includes('allotment')) return 'vendor-ui'
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
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // Zero-weight stand-in; keeps import sites, drops ~100KB+ vendor chunk
      { find: 'framer-motion', replacement: path.resolve(__dirname, 'src/lib/motionShim.tsx') },
      // Build-only slim models (full models.js remains for tsc/JSDoc)
      {
        find: /allbeingsfuture\/internal\/models\/models\.js$/,
        replacement: path.resolve(__dirname, 'bindings/allbeingsfuture/internal/models/models.runtime.js'),
      },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})

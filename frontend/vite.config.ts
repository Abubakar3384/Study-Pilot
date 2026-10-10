import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

// The e2e suite points the proxy at its own backend instance (see playwright.config.ts).
const API_TARGET = process.env.SP_API_TARGET ?? 'http://localhost:8000'
// Vercel Functions accept request bodies up to 4.5 MB, so builds there cap uploads at 4 MB (as the API does).
const MAX_UPLOAD_MB = process.env.VITE_MAX_UPLOAD_MB ?? (process.env.VERCEL ? '4' : '25')

export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [react(), tailwindcss()]
  if (mode === 'analyze') {
    plugins.push(visualizer({ filename: process.env.VIS_TEMPLATE === 'list' ? 'dist/stats.yml' : 'dist/stats.html', gzipSize: true, template: process.env.VIS_TEMPLATE === 'list' ? 'list' : 'treemap' }))
  }
  return {
    plugins,
    define: { 'import.meta.env.VITE_MAX_UPLOAD_MB': JSON.stringify(MAX_UPLOAD_MB) },
    server: {
      port: 5173,
      proxy: { '/api': API_TARGET },
    },
    preview: {
      port: 4173,
      proxy: { '/api': API_TARGET },
    },
    build: {
      target: 'es2022',
      // The canvas chunk is intentionally large and lazy; budgets are enforced by scripts/check-bundle.mjs.
      chunkSizeWarningLimit: 800,
    },
  }
})

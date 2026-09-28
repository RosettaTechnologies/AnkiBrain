import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Anki's QtWebEngine loads dist/index.html over file:// (see SidePanel.py),
  // so every asset URL must be relative. This replaces CRA's `"homepage": "."`.
  base: './',

  plugins: [react()],

  server: {
    // Keep the port CRA used so existing dev habits/URLs still work.
    port: 3000,
  },

  build: {
    outDir: 'dist',
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
})

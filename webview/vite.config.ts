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

  // Vitest loads externalized dependencies with Node's `node` export
  // condition. @lit/react (used by @ionic/react's component wrappers) ships a
  // node/SSR build that does not attach event listeners, so tests would miss
  // every onIon* handler. Resolving with the browser condition in the test
  // workers fixes event wiring without affecting the production build.
  ssr: {
    resolve: {
      conditions: ['browser', 'development|production'],
    },
  },
})

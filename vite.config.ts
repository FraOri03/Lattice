/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Keep three.js out of the main entry chunk (Phase 9 / PERF-1).
         * Only the 3D card and the asset 3D viewer use it, and both now
         * import it dynamically, so Rollup already splits it — this names
         * that shared chunk so the boundary is explicit and can't silently
         * fold back into `index` via a barrel import.
         */
        manualChunks(id) {
          if (id.includes('node_modules/three/') || id.includes('node_modules/three\\')) {
            return 'three'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // keep unit tests deterministic: no real timers / cloud / network
    restoreMocks: true,
  },
})

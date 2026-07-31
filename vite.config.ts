/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
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
    /**
     * `.claude/worktrees/*` holds full checkouts of this repo from parallel
     * agent sessions, each with its own node_modules. Discovering their tests
     * runs a second copy of React against ours and fails with unrelated hook
     * errors, so `npm test` is only trustworthy with them excluded.
     */
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})

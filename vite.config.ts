/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import {
  PINNED_VERSION,
  buildNumber,
  commitRef,
  composeVersion,
} from './src/lib/version/buildStamp'

/**
 * Stamped once per build, not per request: every production deploy ships a
 * version that is visibly newer than the last, without anyone editing a
 * file. `package.json` still owns `major.minor`; see buildStamp.ts for why
 * the tail is a clock and not a commit count.
 *
 * A non-empty `PINNED_VERSION` short-circuits all of that and ships the
 * declared release string as-is; `VITE_APP_VERSION` still wins over both,
 * for a release pinned from the deploy environment.
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }
const APP_VERSION = PINNED_VERSION || composeVersion(pkg.version, buildNumber())
const APP_COMMIT = commitRef(process.env)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  /**
   * @ffmpeg/ffmpeg must NOT be pre-bundled. It reaches its own inner worker
   * with `new Worker(new URL('./worker.js', import.meta.url))`, and once
   * esbuild has rewritten that module into `node_modules/.vite/deps/`, the
   * URL resolves next to the *bundle* — `/node_modules/.vite/deps/worker.js`,
   * which 404s. Nothing throws: the worker simply never answers, so in dev
   * every video upload hangs on "Converting…" indefinitely. Excluding it
   * keeps the dist layout (and that relative URL) intact.
   */
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
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

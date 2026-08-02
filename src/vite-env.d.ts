/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_API_KEY?: string
  readonly VITE_GOOGLE_DRIVE_APP_FOLDER?: string
  readonly VITE_GITHUB_CLIENT_ID?: string
  readonly VITE_APP_ENV?: string
  readonly VITE_APP_VERSION?: string
  readonly VITE_APP_STAGE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Stamped by `vite.config.ts` at build time (see lib/version/buildStamp).
 * They are compile-time constants, not env vars: nothing can set them at
 * runtime, and a build that somehow lacks them falls back in `lib/env.ts`.
 */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

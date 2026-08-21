/**
 * Central place for build-time configuration. Everything comes from Vite
 * env variables (VITE_* only — anything else never reaches the client
 * bundle). No secrets belong here: the only server-side secret in the
 * project (GITHUB_CLIENT_SECRET) is read exclusively by the Vercel
 * serverless function in /api.
 */
import { PINNED_VERSION } from './version/buildStamp'

export const env = {
  /** Google OAuth Web client id — enables real Google sign-in + Drive sync */
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '',
  /** Optional Google API key (Drive discovery; not required for REST calls) */
  googleApiKey: (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined) ?? '',
  /** Name of the root app folder created in the user's Drive */
  driveAppFolder:
    (import.meta.env.VITE_GOOGLE_DRIVE_APP_FOLDER as string | undefined) || 'Lattice',
  /** GitHub OAuth app client id — enables browser OAuth via /api/github/oauth */
  githubClientId: (import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined) ?? '',
  appEnv: (import.meta.env.VITE_APP_ENV as string | undefined) || 'development',
  /**
   * The release string in `PINNED_VERSION` while one is pinned; otherwise
   * `major.minor` from package.json plus a build number that ticks up on
   * its own — so the version on screen changes with every production
   * deploy instead of whenever someone remembers to bump a file.
   *
   * Order: an explicitly pinned `VITE_APP_VERSION` wins, then the stamp
   * `vite.config.ts` compiled in, then the pin itself for any consumer of
   * this module that is not built by Vite (tests, scripts).
   */
  appVersion:
    (import.meta.env.VITE_APP_VERSION as string | undefined) ||
    (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '') ||
    PINNED_VERSION,
  /** Short commit sha of the build, or 'local' outside CI. */
  appCommit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'local',
  /**
   * Release stage shown next to the version (alpha → beta → stable). Display
   * only: nothing in the app branches on it, it just tells the user how much
   * to trust what they are looking at.
   */
  appStage: (import.meta.env.VITE_APP_STAGE as string | undefined) || 'alpha',
  /**
   * Realtime collaboration backend (Phase 8). 'liveblocks' enables the
   * production RealtimeCollaborationProvider; anything else leaves only
   * the local (tabs) and Drive-polling providers. The client never holds
   * a backend secret — it authenticates through the serverless endpoint
   * below, which validates the user's Google token and the project ACL.
   */
  realtimeBackend:
    (import.meta.env.VITE_REALTIME_BACKEND as string | undefined) ?? '',
  realtimeAuthUrl:
    (import.meta.env.VITE_REALTIME_AUTH_URL as string | undefined) ||
    '/api/realtime/auth',
  realtimeRoomsUrl:
    (import.meta.env.VITE_REALTIME_ROOMS_URL as string | undefined) ||
    '/api/realtime/rooms',
  /**
   * Remote conversion worker (Phase 8) for legacy/complex formats
   * (DOC, PPT, high-fidelity office). Empty = disabled, and the UI says
   * so honestly. The worker runs OUTSIDE this app (e.g. headless
   * LibreOffice behind an authenticated HTTP endpoint) — a native
   * converter is never bundled into the frontend.
   */
  conversionApiUrl:
    (import.meta.env.VITE_CONVERSION_API_URL as string | undefined) ?? '',
  /**
   * LiveKit server URL for project calls (audio / camera / screen share).
   * PUBLIC on purpose: the browser has to know where to connect, and the URL
   * is not a credential — access is granted by the short-lived signed token
   * minted by /api/realtime/media-token. LIVEKIT_API_KEY and
   * LIVEKIT_API_SECRET stay server-only and are never prefixed with VITE_.
   */
  livekitUrl: (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ?? '',
  mediaTokenUrl:
    (import.meta.env.VITE_MEDIA_TOKEN_URL as string | undefined) ||
    '/api/realtime/media-token',
  /**
   * Which AI backend this build offers (Phase 21). 'hosted' selects the
   * RunPod provider, which talks only to `/api/ai/*`; 'local' is 21.6's
   * ComfyUI on the user's own machine; anything else — the default — leaves
   * `DisabledAiProvider` in place and the UI says so honestly.
   *
   * Deliberately NOT the credential. `RUNPOD_API_KEY` and the endpoint ids
   * are server-only variables read by `/api/ai/*` and never prefixed
   * `VITE_`; this flag only says which seam implementation to instantiate,
   * and the browser learns nothing from it that it could misuse.
   *
   * It is also only half the answer: the server can withdraw AI without a
   * redeploy, so the provider asks `/api/ai/capabilities` at runtime and
   * that answer wins over this constant.
   */
  aiBackend: (import.meta.env.VITE_AI_BACKEND as string | undefined) ?? '',
} as const

/** True when real Google OAuth is configured (otherwise the mock auth provider is used). */
export const hasGoogleAuth = env.googleClientId.length > 0

/** True when the GitHub OAuth app flow is available (PAT connect always works). */
export const hasGithubOAuth = env.githubClientId.length > 0

/** True when a production realtime backend is configured for this build. */
export const hasRealtimeBackend = env.realtimeBackend === 'liveblocks'

/** True when a remote conversion worker is configured for this build. */
export const hasConversionBackend = env.conversionApiUrl.length > 0

/**
 * True when project calls can even be attempted by this build.
 *
 * Needs BOTH a LiveKit URL and the realtime backend: call access is authorized
 * against the project ACL that lives in the Liveblocks room metadata, so
 * without realtime there is no server-side membership to check. The client can
 * only know about the public half of the configuration — if the server is
 * missing its LiveKit key/secret the endpoint answers 501 and the UI reports
 * that honestly rather than pretending a call is available.
 */
export const hasMediaCalls = env.livekitUrl.length > 0 && hasRealtimeBackend

/**
 * True when this build was compiled with the hosted AI backend selected.
 *
 * A *build-time* answer, and only the first half of the question: whether
 * the server actually has a RunPod key, credit and an endpoint is something
 * only the server knows, and it must be able to change its mind without a
 * redeploy. The provider asks `/api/ai/capabilities` for that. This
 * constant decides which implementation of the seam is constructed; the
 * runtime probe decides what it will admit to being able to run.
 */
export const hasHostedAiBackend = env.aiBackend === 'hosted'

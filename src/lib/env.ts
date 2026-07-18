/**
 * Central place for build-time configuration. Everything comes from Vite
 * env variables (VITE_* only — anything else never reaches the client
 * bundle). No secrets belong here: the only server-side secret in the
 * project (GITHUB_CLIENT_SECRET) is read exclusively by the Vercel
 * serverless function in /api.
 */
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
  appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.6.0',
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

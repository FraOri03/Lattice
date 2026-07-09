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
} as const

/** True when real Google OAuth is configured (otherwise the mock auth provider is used). */
export const hasGoogleAuth = env.googleClientId.length > 0

/** True when the GitHub OAuth app flow is available (PAT connect always works). */
export const hasGithubOAuth = env.githubClientId.length > 0

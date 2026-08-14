import type { IdentityProvider } from './identity.js'

/* ---------------- sessions (Phase 17.2) ---------------- */

/**
 * A Lattice-issued session.
 *
 * The thing the app never had: until 17.2 the browser proved who it was by
 * sending a *Google* access token on every request, so a provider
 * credential was also the application's credential — readable by any
 * script on the page, and impossible to revoke because nothing had issued
 * it.
 *
 * The browser now holds an opaque token in an HttpOnly cookie it cannot
 * read. This record is what that token points at, and only the server ever
 * sees one.
 */
export interface Session {
  id: string
  userId: string
  /**
   * The verified claim the session was minted from, copied here so an
   * endpoint reconstructs exactly the identity the Google path produced —
   * which is why the permission matrix is untouched by this phase.
   */
  provider: IdentityProvider
  providerSubject: string
  email: string
  displayName: string
  avatarUrl: string
  createdAt: number
  lastSeenAt: number
  expiresAt: number
  /** Set rather than deleted, so "signed out everywhere" stays answerable. */
  revokedAt: number | null
  /** Coarse, for the user's own device list. Never parsed for behaviour. */
  userAgent: string
}

/**
 * What the browser is told about its own session.
 *
 * Deliberately not a {@link Session}: no id, no hashes, nothing that could
 * be replayed. The CSRF token is the one secret here, and it is handed over
 * in a response body rather than a cookie so that no script-readable cookie
 * has to exist at all.
 */
export interface SessionInfo {
  userId: string
  email: string
  displayName: string
  avatarUrl: string
  provider: IdentityProvider
  expiresAt: number
  csrfToken: string
}

/* ---------------- the wire ---------------- */

/**
 * Shared by the browser and the endpoints, for the same reason the
 * permission matrix is: two copies of a protocol constant are two things
 * that can drift, and a CSRF header the client spells differently from the
 * server is a 403 nobody can explain.
 */
export const SESSION_COOKIE = 'lattice_session'
export const CSRF_HEADER = 'x-lattice-csrf'

/** How long a fresh session lives. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Renew when less than this is left, on any authenticated request.
 *
 * Sliding rather than fixed: a workspace someone opens every day should
 * not sign them out on a schedule, and a session nobody has used for a
 * month should not stay valid forever.
 */
export const SESSION_RENEW_AHEAD_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

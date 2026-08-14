import { nid } from '../src/lib/id.js'
import { resolveClaim } from '../src/lib/auth/identity.js'
import type { Session, SessionInfo } from '../src/types/session.js'
import { SESSION_TTL_MS } from '../src/types/session.js'
import { NO_DATABASE, repositories } from './_lib/db/index.js'
import { verifyGoogleToken, sendError, type ApiRes } from './_lib/realtime.js'
import {
  clearSessionCookieHeader,
  csrfOk,
  hashToken,
  headerOf,
  mintToken,
  sessionCookieHeader,
  sessionOf,
  type ApiRequest,
} from './_lib/session.js'

/**
 * /api/session — Lattice's own sign-in (Phase 17.2, #85).
 *
 * The endpoint that lets the app stop treating a Google credential as its
 * own. A verified Google token is exchanged, once, for a session in an
 * HttpOnly cookie; from then on the browser proves who it is with
 * something it cannot read, cannot leak through a script, and the server
 * can revoke.
 *
 * Four things, dispatched on `action` in the same shape `rooms.ts` uses:
 *
 *   GET                  — who am I, and the CSRF token for this session
 *   POST { action:'create' }     — exchange a Google token for a session
 *   POST { action:'logout' }     — sign out this device
 *   POST { action:'logout-all' } — sign out everywhere
 *
 * ## What the browser gets back
 *
 * Never a {@link Session}: no id, no hashes, nothing replayable. Just who
 * it is and a CSRF token, handed over in a response BODY so that no
 * script-readable cookie has to exist for a cross-origin page to find.
 */

interface Body {
  action?: unknown
  googleToken?: unknown
}

function infoOf(session: Session, csrfToken: string): SessionInfo {
  return {
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    avatarUrl: session.avatarUrl,
    provider: session.provider,
    expiresAt: session.expiresAt,
    csrfToken,
  }
}

export default async function handler(req: ApiRequest, res: ApiRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  const db = repositories()
  if (!db) {
    // honest, and load-bearing: the client falls back to the Google token
    // path on a 501 rather than treating it as "signed out"
    sendError(res, 501, NO_DATABASE)
    return
  }

  /* ---------------- who am I ---------------- */

  if (req.method === 'GET') {
    const session = await sessionOf(req, db.sessions)
    if (!session) {
      sendError(res, 401, 'No session.')
      return
    }
    /**
     * A fresh CSRF token per read, rotated in place. The client holds it in
     * memory for the life of the tab; rotating means a token that did leak
     * has a lifetime measured in one page load rather than a month.
     */
    const csrfToken = mintToken()
    await db.sessions.rotateCsrf(session.id, hashToken(csrfToken))
    res.status(200).json(infoOf(session, csrfToken))
    return
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'GET or POST only.')
    return
  }

  const body = (req.body ?? {}) as Body
  const action = typeof body.action === 'string' ? body.action : 'create'

  /* ---------------- create ---------------- */

  if (action === 'create') {
    if (typeof body.googleToken !== 'string' || !body.googleToken) {
      sendError(res, 400, 'A Google access token is required to start a session.')
      return
    }
    // The one place a Google token is still believed: it is being exchanged
    // for something better, and Google — not the caller — says who it is.
    const identity = await verifyGoogleToken(body.googleToken)
    if (!identity) {
      sendError(res, 401, 'Google rejected this token (expired or wrong audience).')
      return
    }

    /**
     * The identity rules of 16.1, run server-side for the first time.
     * Convergence and containment now apply across everyone rather than
     * within one browser, which is the whole reason the user id had to stop
     * being derived from the provider.
     */
    const claim = {
      provider: 'google' as const,
      providerSubject: identity.sub,
      email: identity.email,
      emailVerified: !!identity.email,
      displayName: identity.name || identity.email,
      avatarUrl: identity.picture,
    }
    const records = await db.identities.recordsForClaim(claim)
    const { resolved } = resolveClaim(records, claim)
    await db.identities.saveResolved(resolved)

    const token = mintToken()
    const csrfToken = mintToken()
    const now = Date.now()
    const session: Session = {
      id: nid('ses'),
      userId: resolved.user.id,
      provider: 'google',
      providerSubject: identity.sub,
      email: identity.email,
      displayName: claim.displayName,
      avatarUrl: identity.picture,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + SESSION_TTL_MS,
      revokedAt: null,
      // coarse and untrusted; it exists so a person can recognise a device
      userAgent: headerOf(req, 'user-agent').slice(0, 256),
    }
    await db.sessions.create(session, {
      tokenHash: hashToken(token),
      csrfHash: hashToken(csrfToken),
    })

    res.setHeader('Set-Cookie', sessionCookieHeader(token, req))
    res.status(200).json(infoOf(session, csrfToken))
    return
  }

  /* ---------------- logout ---------------- */

  const session = await sessionOf(req, db.sessions)
  if (!session) {
    // already signed out: clear the cookie anyway and say so plainly
    res.setHeader('Set-Cookie', clearSessionCookieHeader(req))
    res.status(200).json({ revoked: 0 })
    return
  }
  // Signing out is a state change, so it is CSRF-protected like any other.
  // A page that could forge it could sign a user out of their own account.
  if (!(await csrfOk(req, session, db.sessions))) {
    sendError(res, 403, 'Missing or invalid CSRF token.')
    return
  }

  if (action === 'logout') {
    await db.sessions.revoke(session.id)
    res.setHeader('Set-Cookie', clearSessionCookieHeader(req))
    res.status(200).json({ revoked: 1 })
    return
  }

  if (action === 'logout-all') {
    const revoked = await db.sessions.revokeAllOf(session.userId)
    res.setHeader('Set-Cookie', clearSessionCookieHeader(req))
    res.status(200).json({ revoked })
    return
  }

  sendError(res, 400, `Unknown action "${action}".`)
}

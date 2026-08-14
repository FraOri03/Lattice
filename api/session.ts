import { nid } from '../src/lib/id.js'
import { resolveClaim } from '../src/lib/auth/identity.js'
import type { IdentityProvider } from '../src/types/identity.js'
import type { Session, SessionInfo } from '../src/types/session.js'
import { SESSION_TTL_MS } from '../src/types/session.js'
import type { OtpRequestResult } from '../src/types/otp.js'
import { OTP_TTL_MS } from '../src/types/otp.js'
import { mailSender, signInCodeMessage } from './_lib/mail.js'
import {
  issueCode,
  normaliseEmail,
  rateCheck,
  sourceIp,
  verifyCode,
} from './_lib/otp.js'
import type { Repositories } from './_lib/db/repositories.js'
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
  email?: unknown
  code?: unknown
}

/** What an endpoint says when a code was asked for and it cannot send one. */
const NO_MAIL =
  'E-mail sign-in is not configured on this server (RESEND_API_KEY and MAIL_FROM are missing).'

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

/** The identity a freshly proven claim carries into its session. */
interface SessionSeed {
  userId: string
  provider: IdentityProvider
  providerSubject: string
  email: string
  displayName: string
  avatarUrl: string
}

/**
 * Mint a session for a claim that has just been proven.
 *
 * Shared by both ways in — a Google token and an e-mail code — because
 * "OTP as a second provider **on the same session**" is the whole point of
 * 17.3. Two copies of this would be two session formats, and eventually
 * two sets of security properties.
 */
async function startSession(
  db: Repositories,
  req: ApiRequest,
  seed: SessionSeed,
): Promise<{ info: SessionInfo; cookie: string }> {
  const token = mintToken()
  const csrfToken = mintToken()
  const now = Date.now()
  const session: Session = {
    id: nid('ses'),
    userId: seed.userId,
    provider: seed.provider,
    providerSubject: seed.providerSubject,
    email: seed.email,
    displayName: seed.displayName,
    avatarUrl: seed.avatarUrl,
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
  return { info: infoOf(session, csrfToken), cookie: sessionCookieHeader(token, req) }
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

    const { info, cookie } = await startSession(db, req, {
      userId: resolved.user.id,
      provider: 'google',
      providerSubject: identity.sub,
      email: identity.email,
      displayName: claim.displayName,
      avatarUrl: identity.picture,
    })
    res.setHeader('Set-Cookie', cookie)
    res.status(200).json(info)
    return
  }

  /* ---------------- e-mail one-time codes (17.3, #86) ---------------- */

  if (action === 'otp-request') {
    const email = normaliseEmail(body.email)
    if (!email) {
      // a malformed address is a client bug, not a signal about anyone
      sendError(res, 400, 'A valid e-mail address is required.')
      return
    }
    const mail = mailSender()
    if (!mail) {
      sendError(res, 501, NO_MAIL)
      return
    }

    const ip = sourceIp(req)
    const decision = await rateCheck(db.otp, email, ip)
    if (decision.allowed) {
      const { code } = await issueCode(db.otp, email, ip)
      try {
        await mail.send(signInCodeMessage(email, code))
      } catch {
        // Delivery failed. The caller is still told the same thing: a
        // response that distinguished "sent" from "could not send" would
        // distinguish addresses too.
      }
    }

    /**
     * ALWAYS this, whatever happened above — sent, rate limited, or a
     * delivery failure. The response cannot depend on whether the address
     * has an account, or this endpoint becomes a way to ask "is this
     * person a Lattice user?" one address at a time.
     */
    const result: OtpRequestResult = { sent: true, expiresInMs: OTP_TTL_MS }
    res.status(200).json(result)
    return
  }

  if (action === 'otp-verify') {
    const email = normaliseEmail(body.email)
    const code = typeof body.code === 'string' ? body.code : ''
    if (!email || !code) {
      sendError(res, 400, 'An e-mail address and a code are required.')
      return
    }

    if (!(await verifyCode(db.otp, email, code))) {
      // One message for every failure: no code, expired, wrong digits, out
      // of attempts. Four situations that must look identical from outside.
      sendError(res, 401, 'That code is not valid. Request a new one.')
      return
    }

    /**
     * The claim OTP produces, and the reason 16.1 built convergence: the
     * address is VERIFIED — the code proved control of the mailbox — so
     * `resolveClaim` lands on the user who already signed in with Google at
     * that address rather than minting a second account beside them.
     */
    const claim = {
      provider: 'email' as const,
      providerSubject: email,
      email,
      emailVerified: true,
      displayName: email,
      avatarUrl: '',
    }
    const records = await db.identities.recordsForClaim(claim)
    const { resolved } = resolveClaim(records, claim)
    await db.identities.saveResolved(resolved)

    const { info, cookie } = await startSession(db, req, {
      userId: resolved.user.id,
      provider: 'email',
      providerSubject: email,
      email,
      // an existing account keeps the name it already had; a brand-new one
      // has nothing but the address to go on
      displayName: resolved.user.displayName || email,
      avatarUrl: resolved.user.avatarUrl,
    })
    res.setHeader('Set-Cookie', cookie)
    res.status(200).json(info)
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

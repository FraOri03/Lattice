import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Session } from '../../src/types/session.js'
import {
  CSRF_HEADER,
  SESSION_COOKIE,
  SESSION_RENEW_AHEAD_MS,
  SESSION_TTL_MS,
} from '../../src/types/session.js'
import type { SessionRepository } from './db/repositories.js'

/**
 * Session cookies, tokens and CSRF (Phase 17.2, #85).
 *
 * Everything about a session that is not storage lives here: minting the
 * token, hashing it, putting it in a cookie the browser cannot read, and
 * deciding whether a request is allowed to act on one.
 *
 * ## The token is a secret, and it is never stored
 *
 * The cookie carries 32 random bytes. The database stores only the SHA-256
 * of them, so a leaked dump of `sessions` grants nobody a session — the
 * same reason nobody stores passwords in the clear. Comparison happens by
 * hash, and the CSRF token gets identical treatment.
 *
 * ## Why SameSite=Lax and a header, rather than either alone
 *
 * `SameSite=Lax` stops the cookie riding along on a cross-site POST, which
 * is already most of CSRF. The custom header is the second lock: a
 * cross-origin form cannot set one at all, and a cross-origin `fetch` that
 * tries is stopped by CORS preflight. Belt and braces, because the failure
 * being defended against is silent.
 */

/* ---------------- names ---------------- */

// Shared verbatim with the browser: see src/types/session.ts.
export { SESSION_COOKIE, CSRF_HEADER } from '../../src/types/session.js'

/* ---------------- the request shape endpoints see ---------------- */

export interface ApiRequest {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

export function headerOf(req: ApiRequest, name: string): string {
  const raw = req.headers?.[name.toLowerCase()]
  if (Array.isArray(raw)) return raw[0] ?? ''
  return raw ?? ''
}

/* ---------------- cookies ---------------- */

/**
 * Parse a Cookie header.
 *
 * Deliberately forgiving about everything except the name: a malformed
 * neighbouring cookie set by some other tool on the same domain must not
 * be able to sign a user out.
 */
export function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at <= 0) continue
    const name = part.slice(0, at).trim()
    if (!name) continue
    const value = part.slice(at + 1).trim()
    try {
      out[name] = decodeURIComponent(value)
    } catch {
      out[name] = value
    }
  }
  return out
}

export function cookieOf(req: ApiRequest, name: string): string {
  return parseCookies(headerOf(req, 'cookie'))[name] ?? ''
}

/**
 * `Secure` is omitted on plain-HTTP localhost and nowhere else.
 *
 * A Secure cookie is simply dropped by the browser over http://, so
 * hard-coding it would make local development silently sessionless — and
 * the tempting fix for that is to drop it everywhere, which is the actual
 * hazard. The exception is therefore narrow and explicit.
 */
export function isLocalhost(host: string): boolean {
  const name = host.split(':')[0]?.toLowerCase() ?? ''
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]'
}

/**
 * The absolute origin this request arrived at (Phase 18.2, #89).
 *
 * Mail needs it twice — for the invite link and for the one image the
 * templates load — and both have to point at the deployment that actually
 * sent the message: a preview build must invite people to the preview, not
 * to production. Deriving it from the request is the only way to get that
 * right without a per-environment variable somebody has to remember to set.
 *
 * `x-forwarded-proto` is what Vercel puts the real scheme in; the localhost
 * exception is the same one the cookie makes, and for the same reason.
 */
export function originOf(req: ApiRequest): string {
  const host = headerOf(req, 'host')
  if (!host) return ''
  const forwarded = headerOf(req, 'x-forwarded-proto').split(',')[0]?.trim()
  const proto = forwarded || (isLocalhost(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

interface CookieOptions {
  maxAgeSeconds: number
  secure: boolean
}

function serializeSessionCookie(value: string, opts: CookieOptions): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`,
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function sessionCookieHeader(token: string, req: ApiRequest): string {
  return serializeSessionCookie(token, {
    maxAgeSeconds: SESSION_TTL_MS / 1000,
    secure: !isLocalhost(headerOf(req, 'host')),
  })
}

/** Max-Age=0 — the only way to remove a cookie the browser cannot read. */
export function clearSessionCookieHeader(req: ApiRequest): string {
  return serializeSessionCookie('', {
    maxAgeSeconds: 0,
    secure: !isLocalhost(headerOf(req, 'host')),
  })
}

/* ---------------- tokens ---------------- */

/** 32 bytes from the CSPRNG, url-safe. Never derived from anything. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `===` on a secret leaks its prefix through timing. The inputs here are
 * always SHA-256 hex of the same length, so a length mismatch is already a
 * mismatch and can be answered early without leaking anything useful.
 */
export function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length || !a) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

/* ---------------- resolving a request to a session ---------------- */

/**
 * The live session this request carries, or null.
 *
 * Null covers every failure the same way on purpose — no cookie, unknown
 * token, revoked, expired. Telling a caller *which* is telling an attacker
 * which of their guesses was a real session id.
 */
export async function sessionOf(
  req: ApiRequest,
  sessions: SessionRepository,
  now = Date.now(),
): Promise<Session | null> {
  const token = cookieOf(req, SESSION_COOKIE)
  if (!token) return null
  return sessions.byTokenHash(hashToken(token), now)
}

/**
 * Whether this request may ACT on its session.
 *
 * Reading is not writing: `GET /api/session` answers from the cookie
 * alone, because a cross-site read it cannot see the response of is not an
 * attack. Everything that changes state has to present the CSRF token,
 * which lives in a response body and therefore in a place a cross-origin
 * page can never reach.
 */
export async function csrfOk(
  req: ApiRequest,
  session: Session,
  sessions: SessionRepository,
): Promise<boolean> {
  const presented = headerOf(req, CSRF_HEADER)
  if (!presented) return false
  const expected = await sessions.csrfHashOf(session.id)
  if (!expected) return false
  return sameDigest(hashToken(presented), expected)
}

/**
 * Slide the expiry of a session that is still in use.
 *
 * Only when it is actually near the end: a write on every request would
 * turn every realtime call into a database write for no benefit.
 */
export async function touchSession(
  session: Session,
  sessions: SessionRepository,
  now = Date.now(),
): Promise<void> {
  if (session.expiresAt - now > SESSION_RENEW_AHEAD_MS) return
  await sessions.touch(session.id, now, now + SESSION_TTL_MS)
}

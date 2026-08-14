import { describe, expect, it } from 'vitest'
import {
  clearSessionCookieHeader,
  cookieOf,
  csrfOk,
  hashToken,
  isLocalhost,
  mintToken,
  parseCookies,
  sameDigest,
  sessionCookieHeader,
  sessionOf,
  touchSession,
  type ApiRequest,
} from './session.js'
import { MemoryRepositories } from './db/memory.js'
import type { Session } from '../../src/types/session.js'
import { SESSION_RENEW_AHEAD_MS, SESSION_TTL_MS } from '../../src/types/session.js'

/**
 * The security half of 17.2 (#85): what the cookie says, what is stored,
 * and what a request has to present before it may act on a session.
 */

const NOW = 1_800_000_000_000

function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: 'ses_1',
    userId: 'usr_ada',
    provider: 'google',
    providerSubject: 'g-1',
    email: 'ada@example.com',
    displayName: 'Ada',
    avatarUrl: '',
    createdAt: NOW,
    lastSeenAt: NOW,
    expiresAt: NOW + SESSION_TTL_MS,
    revokedAt: null,
    userAgent: 'test',
    ...over,
  }
}

const req = (headers: Record<string, string>): ApiRequest => ({ headers })

/* ---------------- cookies ---------------- */

describe('the session cookie', () => {
  it('is HttpOnly, SameSite=Lax and Secure', () => {
    const header = sessionCookieHeader('tok', req({ host: 'lattice.app' }))
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Secure')
    expect(header).toContain('Path=/')
  })

  /**
   * A Secure cookie is dropped by the browser over http://, so hard-coding
   * it would make local development sessionless — and the tempting fix for
   * that is dropping it everywhere.
   */
  it('drops Secure on plain-HTTP localhost, and nowhere else', () => {
    expect(sessionCookieHeader('tok', req({ host: 'localhost:5173' }))).not.toContain(
      'Secure',
    )
    expect(sessionCookieHeader('tok', req({ host: '127.0.0.1:3000' }))).not.toContain(
      'Secure',
    )
    expect(sessionCookieHeader('tok', req({ host: 'lattice.vercel.app' }))).toContain(
      'Secure',
    )
  })

  it('recognises only real localhost hosts', () => {
    expect(isLocalhost('localhost')).toBe(true)
    // an attacker-controlled domain that merely looks local must not match
    expect(isLocalhost('localhost.evil.com')).toBe(false)
    expect(isLocalhost('notlocalhost')).toBe(false)
  })

  it('clears with Max-Age=0 — the only way to remove a cookie JS cannot see', () => {
    expect(clearSessionCookieHeader(req({ host: 'lattice.app' }))).toContain('Max-Age=0')
  })

  it('parses a cookie header without tripping over its neighbours', () => {
    const jar = parseCookies('other=1; lattice_session=abc; broken; third=x=y')
    expect(jar.lattice_session).toBe('abc')
    expect(jar.third).toBe('x=y')
  })

  it('reads the session cookie out of a request', () => {
    expect(cookieOf(req({ cookie: 'lattice_session=abc' }), 'lattice_session')).toBe('abc')
    expect(cookieOf(req({}), 'lattice_session')).toBe('')
  })
})

/* ---------------- tokens ---------------- */

describe('tokens', () => {
  it('mints unguessable, distinct tokens', () => {
    const a = mintToken()
    const b = mintToken()
    expect(a).not.toBe(b)
    // 32 bytes of base64url
    expect(a.length).toBeGreaterThanOrEqual(43)
  })

  it('hashes deterministically and irreversibly', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
    expect(hashToken('abc')).not.toContain('abc')
  })

  it('compares digests without leaking a prefix through length', () => {
    expect(sameDigest(hashToken('a'), hashToken('a'))).toBe(true)
    expect(sameDigest(hashToken('a'), hashToken('b'))).toBe(false)
    expect(sameDigest('', '')).toBe(false)
    expect(sameDigest('short', 'longer-value')).toBe(false)
  })
})

/* ---------------- resolving a request ---------------- */

describe('resolving a request to a session', () => {
  async function seed(over: Partial<Session> = {}) {
    const db = new MemoryRepositories()
    const token = mintToken()
    const csrf = mintToken()
    const session = makeSession(over)
    await db.sessions.create(session, {
      tokenHash: hashToken(token),
      csrfHash: hashToken(csrf),
    })
    return { db, token, csrf, session }
  }

  it('resolves a live session from its cookie', async () => {
    const { db, token } = await seed()
    const found = await sessionOf(req({ cookie: `lattice_session=${token}` }), db.sessions, NOW)
    expect(found?.userId).toBe('usr_ada')
  })

  /** The token is a secret; only its hash is ever stored. */
  it('never stores the token itself', async () => {
    const { db, token } = await seed()
    expect(JSON.stringify(db.data.sessions)).not.toContain(token)
  })

  it('answers null without a cookie', async () => {
    const { db } = await seed()
    expect(await sessionOf(req({}), db.sessions, NOW)).toBeNull()
  })

  it('answers null for an unknown token', async () => {
    const { db } = await seed()
    expect(
      await sessionOf(req({ cookie: 'lattice_session=nope' }), db.sessions, NOW),
    ).toBeNull()
  })

  it('answers null for a revoked session', async () => {
    const { db, token, session } = await seed()
    await db.sessions.revoke(session.id, NOW)
    expect(
      await sessionOf(req({ cookie: `lattice_session=${token}` }), db.sessions, NOW),
    ).toBeNull()
  })

  it('answers null for an expired session', async () => {
    const { db, token } = await seed({ expiresAt: NOW - 1 })
    expect(
      await sessionOf(req({ cookie: `lattice_session=${token}` }), db.sessions, NOW),
    ).toBeNull()
  })
})

/* ---------------- CSRF ---------------- */

describe('CSRF', () => {
  async function seed() {
    const db = new MemoryRepositories()
    const token = mintToken()
    const csrf = mintToken()
    const session = makeSession()
    await db.sessions.create(session, {
      tokenHash: hashToken(token),
      csrfHash: hashToken(csrf),
    })
    return { db, csrf, session }
  }

  it('accepts the token bound to this session', async () => {
    const { db, csrf, session } = await seed()
    expect(await csrfOk(req({ 'x-lattice-csrf': csrf }), session, db.sessions)).toBe(true)
  })

  /**
   * The attack this exists for: a cross-origin page can make the browser
   * send the cookie, but it can never read the CSRF token to echo it.
   */
  it('rejects a request that presents no token', async () => {
    const { db, session } = await seed()
    expect(await csrfOk(req({}), session, db.sessions)).toBe(false)
  })

  it('rejects a wrong token', async () => {
    const { db, session } = await seed()
    expect(await csrfOk(req({ 'x-lattice-csrf': mintToken() }), session, db.sessions)).toBe(
      false,
    )
  })

  it('rejects a token from a different session', async () => {
    const { db, session } = await seed()
    const other = mintToken()
    await db.sessions.create(makeSession({ id: 'ses_2' }), {
      tokenHash: hashToken(mintToken()),
      csrfHash: hashToken(other),
    })
    expect(await csrfOk(req({ 'x-lattice-csrf': other }), session, db.sessions)).toBe(false)
  })

  it('rejects the old token once it has been rotated', async () => {
    const { db, csrf, session } = await seed()
    const next = mintToken()
    await db.sessions.rotateCsrf(session.id, hashToken(next))
    expect(await csrfOk(req({ 'x-lattice-csrf': csrf }), session, db.sessions)).toBe(false)
    expect(await csrfOk(req({ 'x-lattice-csrf': next }), session, db.sessions)).toBe(true)
  })
})

/* ---------------- sliding expiry ---------------- */

describe('sliding expiry', () => {
  it('does not write on a session that is nowhere near expiring', async () => {
    const db = new MemoryRepositories()
    const session = makeSession()
    await db.sessions.create(session, { tokenHash: 'h', csrfHash: 'c' })
    await touchSession(session, db.sessions, NOW)
    expect(db.data.sessions[0]?.expires_at).toBe(new Date(session.expiresAt).toISOString())
  })

  it('extends one that is close to the end', async () => {
    const db = new MemoryRepositories()
    const session = makeSession({ expiresAt: NOW + SESSION_RENEW_AHEAD_MS - 1000 })
    await db.sessions.create(session, { tokenHash: 'h', csrfHash: 'c' })
    await touchSession(session, db.sessions, NOW)
    expect(Date.parse(db.data.sessions[0]?.expires_at ?? '')).toBe(NOW + SESSION_TTL_MS)
  })
})

/* ---------------- revocation ---------------- */

describe('revocation', () => {
  it('signs out one device without touching the others', async () => {
    const db = new MemoryRepositories()
    const a = mintToken()
    const b = mintToken()
    await db.sessions.create(makeSession({ id: 'ses_a' }), {
      tokenHash: hashToken(a),
      csrfHash: 'c',
    })
    await db.sessions.create(makeSession({ id: 'ses_b' }), {
      tokenHash: hashToken(b),
      csrfHash: 'c',
    })

    await db.sessions.revoke('ses_a', NOW)

    expect(await db.sessions.byTokenHash(hashToken(a), NOW)).toBeNull()
    expect(await db.sessions.byTokenHash(hashToken(b), NOW)).not.toBeNull()
  })

  it('signs out everywhere and reports how many ended', async () => {
    const db = new MemoryRepositories()
    const tokens = [mintToken(), mintToken(), mintToken()]
    for (const [i, t] of tokens.entries()) {
      await db.sessions.create(makeSession({ id: `ses_${i}` }), {
        tokenHash: hashToken(t),
        csrfHash: 'c',
      })
    }
    // somebody else's session must survive
    await db.sessions.create(makeSession({ id: 'ses_other', userId: 'usr_grace' }), {
      tokenHash: hashToken('other'),
      csrfHash: 'c',
    })

    expect(await db.sessions.revokeAllOf('usr_ada', NOW)).toBe(3)
    for (const t of tokens) {
      expect(await db.sessions.byTokenHash(hashToken(t), NOW)).toBeNull()
    }
    expect(await db.sessions.byTokenHash(hashToken('other'), NOW)).not.toBeNull()
  })

  it('is idempotent — revoking twice keeps the first timestamp', async () => {
    const db = new MemoryRepositories()
    await db.sessions.create(makeSession(), { tokenHash: 'h', csrfHash: 'c' })
    await db.sessions.revoke('ses_1', NOW)
    await db.sessions.revoke('ses_1', NOW + 5000)
    expect(db.data.sessions[0]?.revoked_at).toBe(new Date(NOW).toISOString())
  })

  it('lists only live sessions', async () => {
    const db = new MemoryRepositories()
    await db.sessions.create(makeSession({ id: 'live' }), { tokenHash: 'a', csrfHash: 'c' })
    await db.sessions.create(makeSession({ id: 'dead', expiresAt: NOW - 1 }), {
      tokenHash: 'b',
      csrfHash: 'c',
    })
    const live = await db.sessions.liveOf('usr_ada', NOW)
    expect(live.map((s) => s.id)).toEqual(['live'])
  })
})

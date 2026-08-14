import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepositories } from './db/memory.js'
import { hashToken, mintToken } from './session.js'
import type { Session } from '../../src/types/session.js'
import { SESSION_TTL_MS } from '../../src/types/session.js'

/**
 * How an endpoint decides who is calling, after 17.2 (#85).
 *
 * The branch that matters most: a request carrying a session cookie is
 * believed only if it ALSO proves it can read the session. A cookie alone
 * is something any cross-origin page can make a browser send.
 */

const db = new MemoryRepositories()

vi.mock('./db/index.js', () => ({
  repositories: () => (databasePresent ? db : null),
  NO_DATABASE: 'no database',
}))

let databasePresent = true

const { requireIdentity } = await import('./realtime.js')

function makeRes() {
  const sent: { code: number; body: unknown } = { code: 0, body: null }
  const res = {
    status(code: number) {
      sent.code = code
      return res
    },
    setHeader() {
      return res
    },
    json(body: unknown) {
      sent.body = body
    },
  }
  return { res, sent }
}

/** Google's tokeninfo + userinfo, as verifyGoogleToken calls them. */
function mockGoogle(email = 'ada@example.com', sub = 'g-1'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('tokeninfo')) {
        return { ok: true, json: async () => ({ sub, email }) }
      }
      return { ok: true, json: async () => ({ email, name: 'Ada', picture: '' }) }
    }),
  )
}

let token = ''
let csrf = ''

beforeEach(async () => {
  databasePresent = true
  db.clear()
  token = mintToken()
  csrf = mintToken()
  const now = Date.now()
  const session: Session = {
    id: 'ses_1',
    userId: 'usr_ada',
    provider: 'google',
    providerSubject: 'g-1',
    email: 'ada@example.com',
    displayName: 'Ada',
    avatarUrl: '',
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL_MS,
    revokedAt: null,
    userAgent: '',
  }
  await db.sessions.create(session, {
    tokenHash: hashToken(token),
    csrfHash: hashToken(csrf),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the session branch', () => {
  it('identifies a caller from cookie plus CSRF token', async () => {
    const { res, sent } = makeRes()
    const identity = await requireIdentity(
      { headers: { cookie: `lattice_session=${token}`, 'x-lattice-csrf': csrf } },
      res,
      undefined,
    )
    expect(identity).toMatchObject({ email: 'ada@example.com', sub: 'g-1' })
    expect(sent.code).toBe(0) // nothing was rejected
  })

  /** The whole reason the CSRF token exists. */
  it('refuses a cookie presented without the CSRF token', async () => {
    const { res, sent } = makeRes()
    const identity = await requireIdentity(
      { headers: { cookie: `lattice_session=${token}` } },
      res,
      undefined,
    )
    expect(identity).toBeNull()
    expect(sent.code).toBe(403)
  })

  it('refuses a cookie with somebody else’s CSRF token', async () => {
    const { res, sent } = makeRes()
    const identity = await requireIdentity(
      {
        headers: { cookie: `lattice_session=${token}`, 'x-lattice-csrf': mintToken() },
      },
      res,
      undefined,
    )
    expect(identity).toBeNull()
    expect(sent.code).toBe(403)
  })

  it('stops accepting a session once it is revoked', async () => {
    await db.sessions.revoke('ses_1')
    mockGoogle()
    const { res, sent } = makeRes()
    const identity = await requireIdentity(
      { headers: { cookie: `lattice_session=${token}`, 'x-lattice-csrf': csrf } },
      res,
      undefined,
    )
    // falls through to the token path, and there is no token
    expect(identity).toBeNull()
    expect(sent.code).toBe(401)
  })
})

describe('the transitional Google-token path', () => {
  it('still accepts a body token when there is no session cookie', async () => {
    mockGoogle('grace@example.com', 'g-2')
    const { res } = makeRes()
    const identity = await requireIdentity({ headers: {} }, res, 'a-google-token')
    expect(identity).toMatchObject({ email: 'grace@example.com', sub: 'g-2' })
  })

  it('works on a deployment with no database at all', async () => {
    databasePresent = false
    mockGoogle()
    const { res } = makeRes()
    const identity = await requireIdentity(
      { headers: { cookie: `lattice_session=${token}` } },
      res,
      'a-google-token',
    )
    expect(identity).toMatchObject({ email: 'ada@example.com' })
  })

  it('rejects a request carrying neither', async () => {
    const { res, sent } = makeRes()
    expect(await requireIdentity({ headers: {} }, res, undefined)).toBeNull()
    expect(sent.code).toBe(401)
  })

  it('does not require a CSRF token on the body-token path', async () => {
    // a credential no browser attaches automatically cannot be ridden
    mockGoogle()
    const { res } = makeRes()
    const identity = await requireIdentity({ headers: {} }, res, 'a-google-token')
    expect(identity).not.toBeNull()
  })
})

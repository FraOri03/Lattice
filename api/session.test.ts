import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepositories } from './_lib/db/memory.js'
import { hashToken, mintToken } from './_lib/session.js'
import type { Session, SessionInfo } from '../src/types/session.js'
import { SESSION_TTL_MS } from '../src/types/session.js'
import { OTP_MAX_PER_EMAIL } from '../src/types/otp.js'

/**
 * /api/session — the endpoint that lets Lattice stop treating a Google
 * credential as its own (17.2, #85).
 */

const db = new MemoryRepositories()
let databasePresent = true

vi.mock('./_lib/db/index.js', () => ({
  repositories: () => (databasePresent ? db : null),
  NO_DATABASE: 'no database is configured',
}))

const handler = (await import('./session.js')).default

interface Sent {
  code: number
  body: unknown
  headers: Record<string, string>
}

function makeRes() {
  const sent: Sent = { code: 0, body: null, headers: {} }
  const res = {
    status(code: number) {
      sent.code = code
      return res
    },
    setHeader(name: string, value: string) {
      sent.headers[name] = value
      return res
    },
    json(body: unknown) {
      sent.body = body
    },
  }
  return { res, sent }
}

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

function rejectGoogle(): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
}

/** Seed a live session and return the raw cookie + CSRF token for it. */
async function seedSession(over: Partial<Session> = {}) {
  const token = mintToken()
  const csrf = mintToken()
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
    ...over,
  }
  await db.sessions.create(session, {
    tokenHash: hashToken(token),
    csrfHash: hashToken(csrf),
  })
  return { token, csrf, session }
}

beforeEach(() => {
  databasePresent = true
  db.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* ---------------- create ---------------- */

describe('creating a session', () => {
  it('exchanges a verified Google token for an HttpOnly cookie', async () => {
    mockGoogle()
    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: { host: 'lattice.app', 'user-agent': 'Firefox' },
        body: { action: 'create', googleToken: 'g-token' },
      },
      res,
    )

    expect(sent.code).toBe(200)
    const cookie = sent.headers['Set-Cookie'] ?? ''
    expect(cookie).toContain('lattice_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Secure')
  })

  it('creates the user through the 16.1 rules, server-side', async () => {
    mockGoogle()
    const { res, sent } = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { action: 'create', googleToken: 'g' } },
      res,
    )
    const info = sent.body as SessionInfo
    expect(db.data.users).toHaveLength(1)
    expect(db.data.users[0]?.id).toBe(info.userId)
    expect(db.data.identities[0]?.provider).toBe('google')
  })

  /** Two sign-ins by the same person are one user, not two. */
  it('converges a second sign-in onto the same user', async () => {
    mockGoogle()
    for (let i = 0; i < 2; i++) {
      const { res } = makeRes()
      await handler(
        { method: 'POST', headers: {}, body: { action: 'create', googleToken: 'g' } },
        res,
      )
    }
    expect(db.data.users).toHaveLength(1)
    expect(db.data.sessions).toHaveLength(2) // two devices, one person
  })

  it('never returns anything replayable', async () => {
    mockGoogle()
    const { res, sent } = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { action: 'create', googleToken: 'g' } },
      res,
    )
    const body = JSON.stringify(sent.body)
    expect(body).not.toContain(db.data.sessions[0]?.token_hash)
    expect(body).not.toContain('"id"') // no session id
  })

  it('refuses a token Google rejects', async () => {
    rejectGoogle()
    const { res, sent } = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { action: 'create', googleToken: 'bad' } },
      res,
    )
    expect(sent.code).toBe(401)
  })

  it('refuses a request with no token at all', async () => {
    const { res, sent } = makeRes()
    await handler({ method: 'POST', headers: {}, body: { action: 'create' } }, res)
    expect(sent.code).toBe(400)
  })

  /** The client reads this 501 as "fall back", not as "signed out". */
  it('answers 501 when the deployment has no database', async () => {
    databasePresent = false
    const { res, sent } = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { action: 'create', googleToken: 'g' } },
      res,
    )
    expect(sent.code).toBe(501)
  })
})

/* ---------------- who am I ---------------- */

describe('reading the current session', () => {
  it('reports who the cookie belongs to', async () => {
    const { token } = await seedSession()
    const { res, sent } = makeRes()
    await handler({ method: 'GET', headers: { cookie: `lattice_session=${token}` } }, res)
    expect(sent.code).toBe(200)
    expect(sent.body).toMatchObject({ userId: 'usr_ada', email: 'ada@example.com' })
  })

  /** A leaked CSRF token should be worth one page load, not a month. */
  it('rotates the CSRF token on every read', async () => {
    const { token, csrf } = await seedSession()
    const { res, sent } = makeRes()
    await handler({ method: 'GET', headers: { cookie: `lattice_session=${token}` } }, res)
    const issued = (sent.body as SessionInfo).csrfToken
    expect(issued).not.toBe(csrf)
    expect(db.data.sessions[0]?.csrf_hash).toBe(hashToken(issued))
  })

  it('answers 401 without a cookie', async () => {
    const { res, sent } = makeRes()
    await handler({ method: 'GET', headers: {} }, res)
    expect(sent.code).toBe(401)
  })
})

/* ---------------- logout ---------------- */

describe('signing out', () => {
  it('revokes this device and clears the cookie', async () => {
    const { token, csrf } = await seedSession()
    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: { cookie: `lattice_session=${token}`, 'x-lattice-csrf': csrf },
        body: { action: 'logout' },
      },
      res,
    )
    expect(sent.code).toBe(200)
    expect(sent.headers['Set-Cookie']).toContain('Max-Age=0')
    expect(await db.sessions.byTokenHash(hashToken(token))).toBeNull()
  })

  /** A forged sign-out is still an attack: it logs someone out of their account. */
  it('refuses to sign out without the CSRF token', async () => {
    const { token } = await seedSession()
    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: { cookie: `lattice_session=${token}` },
        body: { action: 'logout' },
      },
      res,
    )
    expect(sent.code).toBe(403)
    expect(await db.sessions.byTokenHash(hashToken(token))).not.toBeNull()
  })

  it('signs out every device and says how many ended', async () => {
    const { token, csrf } = await seedSession()
    await seedSession({ id: 'ses_2' })
    await seedSession({ id: 'ses_3' })

    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: { cookie: `lattice_session=${token}`, 'x-lattice-csrf': csrf },
        body: { action: 'logout-all' },
      },
      res,
    )
    expect(sent.body).toEqual({ revoked: 3 })
    expect(await db.sessions.liveOf('usr_ada')).toEqual([])
  })

  it('is harmless when there is no session to end', async () => {
    const { res, sent } = makeRes()
    await handler({ method: 'POST', headers: {}, body: { action: 'logout' } }, res)
    expect(sent.code).toBe(200)
    expect(sent.headers['Set-Cookie']).toContain('Max-Age=0')
  })
})

describe('method and action handling', () => {
  it('rejects methods it does not implement', async () => {
    const { res, sent } = makeRes()
    await handler({ method: 'DELETE', headers: {} }, res)
    expect(sent.code).toBe(405)
  })

  it('rejects an unknown action', async () => {
    const { token, csrf } = await seedSession()
    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: { cookie: `lattice_session=${token}`, 'x-lattice-csrf': csrf },
        body: { action: 'nonsense' },
      },
      res,
    )
    expect(sent.code).toBe(400)
  })
})

/* ---------------- e-mail one-time codes (17.3, #86) ---------------- */

/** Capture what the mail transport was asked to send. */
const sentMail: { to: string; text: string }[] = []

let mailConfigured = true
let mailFails = false

vi.mock('./_lib/mail.js', async () => {
  const actual = await vi.importActual<typeof import('./_lib/mail.js')>('./_lib/mail.js')
  return {
    ...actual,
    mailSender: () =>
      mailConfigured
        ? {
            send: async (m: { to: string; subject: string; text: string }) => {
              if (mailFails) throw new Error('provider down')
              sentMail.push({ to: m.to, text: m.text })
            },
          }
        : null,
  }
})

/** The digits out of the message the user would have received. */
const lastCode = (): string => /\b(\d{6})\b/.exec(sentMail.at(-1)?.text ?? '')?.[1] ?? ''

describe('requesting a sign-in code', () => {
  beforeEach(() => {
    mailConfigured = true
    mailFails = false
    sentMail.length = 0
  })

  it('sends a six-digit code', async () => {
    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { action: 'otp-request', email: 'ada@example.com' },
      },
      res,
    )
    expect(sent.code).toBe(200)
    expect(sentMail).toHaveLength(1)
    expect(lastCode()).toMatch(/^\d{6}$/)
  })

  /**
   * The property this whole flow lives or dies by: the answer must not
   * depend on whether the address has an account, or the endpoint becomes
   * a way to ask "is this person a Lattice user?" one address at a time.
   */
  it('answers identically for an address with an account and one without', async () => {
    mockGoogle('known@example.com', 'g-known')
    const { res: mk } = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { action: 'create', googleToken: 'g' } },
      mk,
    )
    vi.unstubAllGlobals()

    const answers: unknown[] = []
    for (const email of ['known@example.com', 'stranger@example.com']) {
      const { res, sent } = makeRes()
      await handler(
        { method: 'POST', headers: {}, body: { action: 'otp-request', email } },
        res,
      )
      answers.push({ code: sent.code, body: sent.body })
    }
    expect(answers[0]).toEqual(answers[1])
  })

  /** Being throttled is itself information: saying so would leak it. */
  it('answers the same once the address is rate limited', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < OTP_MAX_PER_EMAIL + 3; i++) {
      const { res, sent } = makeRes()
      await handler(
        {
          method: 'POST',
          headers: {},
          body: { action: 'otp-request', email: 'ada@example.com' },
        },
        res,
      )
      seen.add(JSON.stringify({ code: sent.code, body: sent.body }))
    }
    expect(seen.size).toBe(1)
    // ...and it really did stop sending
    expect(sentMail.length).toBe(OTP_MAX_PER_EMAIL)
  })

  it('answers the same when the provider fails to deliver', async () => {
    const ok = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { action: 'otp-request', email: 'a@example.com' },
      },
      ok.res,
    )
    mailFails = true
    const bad = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { action: 'otp-request', email: 'b@example.com' },
      },
      bad.res,
    )
    expect(bad.sent.code).toBe(ok.sent.code)
    expect(bad.sent.body).toEqual(ok.sent.body)
  })

  it('rejects a malformed address as a client bug, not a signal', async () => {
    const { res, sent } = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { action: 'otp-request', email: 'nope' } },
      res,
    )
    expect(sent.code).toBe(400)
  })

  it('says so plainly when the SERVER has no mail transport', async () => {
    mailConfigured = false
    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { action: 'otp-request', email: 'a@example.com' },
      },
      res,
    )
    // about the server, not about the address: safe to distinguish
    expect(sent.code).toBe(501)
  })
})

describe('signing in with a code', () => {
  beforeEach(() => {
    mailConfigured = true
    mailFails = false
    sentMail.length = 0
  })

  async function requestCode(email: string): Promise<string> {
    const { res } = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { action: 'otp-request', email } },
      res,
    )
    return lastCode()
  }

  it('mints a session on the right code', async () => {
    const code = await requestCode('ada@example.com')
    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: { host: 'lattice.app' },
        body: { action: 'otp-verify', email: 'ada@example.com', code },
      },
      res,
    )
    expect(sent.code).toBe(200)
    expect(sent.headers['Set-Cookie']).toContain('HttpOnly')
    expect(sent.body).toMatchObject({ email: 'ada@example.com', provider: 'email' })
  })

  /**
   * The convergence 16.1 was built for: an address Google already verified
   * lands on the SAME user, not a second account beside it.
   */
  it('converges onto the account that already signed in with Google', async () => {
    mockGoogle('ada@example.com', 'g-1')
    const g = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { action: 'create', googleToken: 'g' } },
      g.res,
    )
    const googleUserId = (g.sent.body as SessionInfo).userId
    vi.unstubAllGlobals()

    const code = await requestCode('ada@example.com')
    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { action: 'otp-verify', email: 'ada@example.com', code },
      },
      res,
    )
    expect((sent.body as SessionInfo).userId).toBe(googleUserId)
    expect(db.data.users).toHaveLength(1)
    expect(db.data.identities).toHaveLength(2) // google + email, one person
  })

  it('gives every failure the same answer', async () => {
    const code = await requestCode('ada@example.com')
    const wrong = code === '000000' ? '111111' : '000000'

    const answers: unknown[] = []
    const attempts = [
      { email: 'ada@example.com', code: wrong }, // wrong digits
      { email: 'nobody@example.com', code: '123456' }, // never requested
    ]
    for (const attempt of attempts) {
      const { res, sent } = makeRes()
      await handler(
        { method: 'POST', headers: {}, body: { action: 'otp-verify', ...attempt } },
        res,
      )
      answers.push({ code: sent.code, body: sent.body })
    }
    expect(answers[0]).toEqual(answers[1])
    expect((answers[0] as { code: number }).code).toBe(401)
  })

  it('will not accept the same code twice', async () => {
    const code = await requestCode('ada@example.com')
    const first = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { action: 'otp-verify', email: 'ada@example.com', code },
      },
      first.res,
    )
    expect(first.sent.code).toBe(200)

    const second = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { action: 'otp-verify', email: 'ada@example.com', code },
      },
      second.res,
    )
    expect(second.sent.code).toBe(401)
  })

  it('requires both an address and a code', async () => {
    const { res, sent } = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { action: 'otp-verify', email: 'a@example.com' },
      },
      res,
    )
    expect(sent.code).toBe(400)
  })
})

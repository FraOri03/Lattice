import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guards /api/realtime/auth — the only place a browser can obtain write
 * access to a project's realtime rooms. Everything the endpoint trusts
 * must come from Google (identity) or the room ACL (authorization);
 * nothing may come from the request body.
 *
 * The Liveblocks SDK and Google's token endpoints are mocked so the suite
 * runs offline and no real secret is ever needed.
 */

const prepareSession = vi.fn()
const getRoom = vi.fn()

vi.mock('@liveblocks/node', () => ({
  Liveblocks: class {
    prepareSession = prepareSession
    getRoom = getRoom
  },
}))

type Session = {
  allow: ReturnType<typeof vi.fn>
  authorize: ReturnType<typeof vi.fn>
}

/** Captures what the handler wrote back, the way Vercel's res behaves. */
function makeRes() {
  const sent: { code: number; body: unknown; headers: Record<string, string> } = {
    code: 0,
    body: null,
    headers: {},
  }
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

function makeSession(): Session {
  const session: Session = {
    allow: vi.fn(),
    authorize: vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ token: 'lb_token_xyz' }),
    }),
  }
  prepareSession.mockReturnValue(session)
  return session
}

/** Google tokeninfo + userinfo, in the order verifyGoogleToken calls them. */
function mockGoogle(
  opts: { ok?: boolean; aud?: string; email?: string } = {},
): ReturnType<typeof vi.fn> {
  const {
    ok = true,
    aud = 'client-123.apps.googleusercontent.com',
    email = 'ada@example.com',
  } = opts
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('tokeninfo')) {
      if (!ok) return { ok: false, json: async () => ({}) }
      return { ok: true, json: async () => ({ sub: 'g-sub-1', aud, email }) }
    }
    return {
      ok: true,
      json: async () => ({ email, name: 'Ada Lovelace', picture: 'https://x/a.png' }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const ACL_ROOM = {
  metadata: {
    kind: 'lattice-project',
    projectId: 'proj_1',
    ownerEmail: 'owner@example.com',
    editors: ['ada@example.com'],
    commenters: ['sam@example.com'],
    viewers: ['viv@example.com'],
  },
}

async function callAuth(body: unknown, method = 'POST') {
  const { default: handler } = await import('./auth')
  const { res, sent } = makeRes()
  await handler({ method, body }, res)
  return sent
}

beforeEach(() => {
  vi.resetModules()
  prepareSession.mockReset()
  getRoom.mockReset()
  getRoom.mockResolvedValue(ACL_ROOM)
  process.env.LIVEBLOCKS_SECRET_KEY = 'sk_test_never_real'
  process.env.VITE_GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authenticated and authorized', () => {
  it('mints a token scoped to both rooms of the requested project', async () => {
    mockGoogle()
    const session = makeSession()
    const sent = await callAuth({
      room: 'lattice:proj:proj_1',
      googleToken: 'ya29.valid',
    })

    expect(sent.code).toBe(200)
    expect(sent.body).toEqual({ token: 'lb_token_xyz' })

    // identity key is the Google-verified e-mail, not anything the body claimed
    expect(prepareSession).toHaveBeenCalledWith(
      'ada@example.com',
      expect.objectContaining({
        userInfo: expect.objectContaining({ name: 'Ada Lovelace', role: 'editor' }),
      }),
    )
    // an editor writes content and collab
    expect(session.allow).toHaveBeenCalledWith('lattice:proj:proj_1', ['room:write'])
    expect(session.allow).toHaveBeenCalledWith('lattice:proj:proj_1:collab', [
      'room:write',
    ])
    expect(session.allow).toHaveBeenCalledTimes(2)
  })

  it('scopes a commenter and a viewer out of content writes', async () => {
    for (const email of ['sam@example.com', 'viv@example.com']) {
      vi.resetModules()
      mockGoogle({ email })
      const session = makeSession()
      await callAuth({ room: 'lattice:proj:proj_1', googleToken: 'ya29.valid' })
      expect(session.allow).toHaveBeenCalledWith('lattice:proj:proj_1', [
        'room:read',
        'room:presence:write',
      ])
    }
  })

  it('lets a commenter write comments while a viewer may not', async () => {
    // the collab room is where the two roles diverge
    const expected: Record<string, string[]> = {
      'sam@example.com': ['room:write'],
      'viv@example.com': ['room:read', 'room:presence:write'],
    }
    for (const [email, perms] of Object.entries(expected)) {
      vi.resetModules()
      mockGoogle({ email })
      const session = makeSession()
      await callAuth({ room: 'lattice:proj:proj_1', googleToken: 'ya29.valid' })
      expect(session.allow).toHaveBeenCalledWith('lattice:proj:proj_1:collab', perms)
    }
  })

  it('derives the rooms server-side, whichever room the client names', async () => {
    // asking for ":collab" must not widen or narrow the grant: the token
    // always covers exactly the project's two rooms, scoped by role
    mockGoogle()
    const session = makeSession()
    await callAuth({
      room: 'lattice:proj:proj_1:collab',
      googleToken: 'ya29.valid',
    })
    const rooms = session.allow.mock.calls.map((c) => c[0]).sort()
    expect(rooms).toEqual(['lattice:proj:proj_1', 'lattice:proj:proj_1:collab'])
  })
})

describe('rejections', () => {
  it('401s when no Google token is supplied', async () => {
    mockGoogle()
    const sent = await callAuth({ room: 'lattice:proj:proj_1' })
    expect(sent.code).toBe(401)
    expect(prepareSession).not.toHaveBeenCalled()
  })

  it('401s when Google rejects the token', async () => {
    mockGoogle({ ok: false })
    const sent = await callAuth({
      room: 'lattice:proj:proj_1',
      googleToken: 'ya29.forged',
    })
    expect(sent.code).toBe(401)
    expect(prepareSession).not.toHaveBeenCalled()
  })

  it('401s when the token was minted for another application', async () => {
    // a valid Google token from a different OAuth client must not work here
    mockGoogle({ aud: 'someone-elses-client.apps.googleusercontent.com' })
    const sent = await callAuth({
      room: 'lattice:proj:proj_1',
      googleToken: 'ya29.wrong-audience',
    })
    expect(sent.code).toBe(401)
    expect(prepareSession).not.toHaveBeenCalled()
  })

  it('403s a verified user who is not a member of the project', async () => {
    mockGoogle({ email: 'stranger@example.com' })
    makeSession()
    const sent = await callAuth({
      room: 'lattice:proj:proj_1',
      googleToken: 'ya29.valid',
    })
    expect(sent.code).toBe(403)
    expect(prepareSession).not.toHaveBeenCalled()
  })

  it('403s when the project has no room (no ACL to authorize against)', async () => {
    mockGoogle()
    getRoom.mockRejectedValue(new Error('room not found'))
    const sent = await callAuth({
      room: 'lattice:proj:proj_missing',
      googleToken: 'ya29.valid',
    })
    expect(sent.code).toBe(403)
  })

  it('400s a manipulated or foreign room id before touching Google', async () => {
    const fetchMock = mockGoogle()
    for (const room of [
      'lattice:proj:a:b',
      'other:proj:a',
      '',
      'lattice:proj:',
      undefined,
      42,
    ]) {
      const sent = await callAuth({ room, googleToken: 'ya29.valid' })
      expect(sent.code).toBe(400)
    }
    // an unparseable room must not even cost a Google round-trip
    expect(fetchMock).not.toHaveBeenCalled()
    expect(prepareSession).not.toHaveBeenCalled()
  })

  it('405s a non-POST method', async () => {
    mockGoogle()
    const sent = await callAuth({}, 'GET')
    expect(sent.code).toBe(405)
  })

  it('501s honestly when the server has no Liveblocks secret', async () => {
    delete process.env.LIVEBLOCKS_SECRET_KEY
    mockGoogle()
    const sent = await callAuth({
      room: 'lattice:proj:proj_1',
      googleToken: 'ya29.valid',
    })
    expect(sent.code).toBe(501)
  })
})

describe('secret hygiene', () => {
  it('never echoes the secret into a response, on success or failure', async () => {
    mockGoogle()
    makeSession()
    const ok = await callAuth({
      room: 'lattice:proj:proj_1',
      googleToken: 'ya29.valid',
    })
    const bad = await callAuth({ room: 'nope', googleToken: 'ya29.valid' })
    for (const sent of [ok, bad]) {
      expect(JSON.stringify(sent)).not.toContain('sk_test_never_real')
    }
  })

  it('marks auth responses no-store so no cache can replay a token', async () => {
    mockGoogle()
    makeSession()
    const sent = await callAuth({
      room: 'lattice:proj:proj_1',
      googleToken: 'ya29.valid',
    })
    expect(sent.headers['Cache-Control']).toBe('no-store')
  })
})

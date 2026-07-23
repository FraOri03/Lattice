import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrackSource } from 'livekit-server-sdk'

/**
 * Guards /api/realtime/media-token — the only place a browser can obtain the
 * right to publish audio, video or a screen share into a project call.
 * Identity must come from Google and authorization from the project ACL;
 * nothing may come from the request body.
 *
 * The Liveblocks SDK, the LiveKit signer and Google's token endpoints are all
 * mocked, so the suite runs offline and no real credential is ever needed.
 *
 * Only the *signer* is stubbed: the mock keeps the module's real exports, so
 * `TrackSource` below is the genuine protobuf enum rather than a stand-in that
 * could agree with a wrong implementation. Because a stubbed `toJwt` never
 * serialises the grant, media-token.grant.test.ts signs one for real.
 */

const getRoom = vi.fn()
const addGrant = vi.fn()
const toJwt = vi.fn(async () => 'lk_token_xyz')
const accessTokenCtor = vi.fn()

vi.mock('@liveblocks/node', () => ({
  Liveblocks: class {
    getRoom = getRoom
  },
}))

vi.mock('livekit-server-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('livekit-server-sdk')>()),
  AccessToken: class {
    constructor(...args: unknown[]) {
      accessTokenCtor(...args)
    }
    addGrant = addGrant
    toJwt = toJwt
  },
}))

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
    admins: ['adm@example.com'],
    editors: ['ada@example.com'],
    commenters: ['sam@example.com'],
    viewers: ['viv@example.com'],
  },
}

async function callMediaToken(body: unknown, method = 'POST') {
  const { default: handler } = await import('./media-token')
  const { res, sent } = makeRes()
  await handler({ method, body }, res)
  return sent
}

/** The grant object passed to LiveKit for the last call. */
function lastGrant() {
  return addGrant.mock.calls.at(-1)?.[0] as Record<string, unknown>
}

beforeEach(() => {
  vi.resetModules()
  getRoom.mockReset()
  addGrant.mockReset()
  accessTokenCtor.mockReset()
  getRoom.mockResolvedValue(ACL_ROOM)
  process.env.LIVEBLOCKS_SECRET_KEY = 'sk_test_never_real'
  process.env.LIVEKIT_API_KEY = 'lk_key_test'
  process.env.LIVEKIT_API_SECRET = 'lk_secret_never_real'
  process.env.VITE_LIVEKIT_URL = 'wss://example.livekit.cloud'
  process.env.VITE_GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authorized members', () => {
  it('mints a token scoped to the project media room', async () => {
    mockGoogle()
    const sent = await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })

    expect(sent.code).toBe(200)
    expect(sent.body).toMatchObject({
      token: 'lk_token_xyz',
      room: 'lattice-project-proj_1',
      role: 'editor',
      url: 'wss://example.livekit.cloud',
    })
    expect(lastGrant()).toMatchObject({ roomJoin: true, room: 'lattice-project-proj_1' })
  })

  it('keys the LiveKit identity to the Google-verified e-mail', async () => {
    mockGoogle()
    await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    expect(accessTokenCtor).toHaveBeenCalledWith(
      'lk_key_test',
      'lk_secret_never_real',
      expect.objectContaining({ identity: 'ada@example.com', name: 'Ada Lovelace' }),
    )
  })

  it('grants screen share to an editor', async () => {
    mockGoogle({ email: 'ada@example.com' })
    await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    expect(lastGrant().canPublishSources).toEqual([
      TrackSource.MICROPHONE,
      TrackSource.CAMERA,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ])
    expect(lastGrant().roomAdmin).toBe(false)
  })

  it('grants moderation to an admin', async () => {
    mockGoogle({ email: 'adm@example.com' })
    const sent = await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    expect(sent.body).toMatchObject({ role: 'admin' })
    expect(lastGrant().roomAdmin).toBe(true)
  })
})

describe('role is derived, never declared', () => {
  it('ignores a role claimed in the request body', async () => {
    mockGoogle({ email: 'viv@example.com' }) // a viewer
    const sent = await callMediaToken({
      projectId: 'proj_1',
      googleToken: 'ya29.valid',
      role: 'owner',
      capabilities: { screenShare: true, moderate: true },
    })
    // the ACL wins: still a viewer, still no screen share, still no moderation
    expect(sent.body).toMatchObject({ role: 'viewer' })
    expect(lastGrant().canPublishSources).toEqual([
      TrackSource.MICROPHONE,
      TrackSource.CAMERA,
    ])
    expect(lastGrant().roomAdmin).toBe(false)
  })

  it('ignores an identity claimed in the request body', async () => {
    mockGoogle({ email: 'viv@example.com' })
    await callMediaToken({
      projectId: 'proj_1',
      googleToken: 'ya29.valid',
      email: 'owner@example.com',
      identity: 'owner@example.com',
    })
    expect(accessTokenCtor).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ identity: 'viv@example.com' }),
    )
  })

  it('denies a viewer the screen-share source', async () => {
    mockGoogle({ email: 'viv@example.com' })
    await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    const sources = lastGrant().canPublishSources as TrackSource[]
    expect(sources).not.toContain(TrackSource.SCREEN_SHARE)
    expect(sources).not.toContain(TrackSource.SCREEN_SHARE_AUDIO)
  })

  it('denies a commenter the screen-share source', async () => {
    mockGoogle({ email: 'sam@example.com' })
    await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    expect(lastGrant().canPublishSources).toEqual([
      TrackSource.MICROPHONE,
      TrackSource.CAMERA,
    ])
  })
})

describe('rejections', () => {
  it('401s when no Google token is supplied', async () => {
    mockGoogle()
    const sent = await callMediaToken({ projectId: 'proj_1' })
    expect(sent.code).toBe(401)
    expect(addGrant).not.toHaveBeenCalled()
  })

  it('401s when Google rejects the token', async () => {
    mockGoogle({ ok: false })
    const sent = await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.forged' })
    expect(sent.code).toBe(401)
    expect(addGrant).not.toHaveBeenCalled()
  })

  it('401s a token minted for another application', async () => {
    mockGoogle({ aud: 'someone-elses-client.apps.googleusercontent.com' })
    const sent = await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.wrong' })
    expect(sent.code).toBe(401)
    expect(addGrant).not.toHaveBeenCalled()
  })

  it('403s a verified user who is not a member', async () => {
    mockGoogle({ email: 'stranger@example.com' })
    const sent = await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    expect(sent.code).toBe(403)
    expect(addGrant).not.toHaveBeenCalled()
  })

  it('403s when the project has no ACL to authorize against', async () => {
    mockGoogle()
    getRoom.mockRejectedValue(new Error('room not found'))
    const sent = await callMediaToken({ projectId: 'proj_missing', googleToken: 'ya29.valid' })
    expect(sent.code).toBe(403)
  })

  it('400s an invalid projectId before spending a Google round-trip', async () => {
    const fetchMock = mockGoogle()
    for (const projectId of ['', 'has space', '../etc', 'a:b', undefined, 42]) {
      const sent = await callMediaToken({ projectId, googleToken: 'ya29.valid' })
      expect(sent.code).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(addGrant).not.toHaveBeenCalled()
  })

  it('405s a non-POST method', async () => {
    mockGoogle()
    expect((await callMediaToken({}, 'GET')).code).toBe(405)
  })
})

describe('unconfigured deployments degrade honestly', () => {
  it('501s when LiveKit credentials are missing', async () => {
    delete process.env.LIVEKIT_API_KEY
    delete process.env.LIVEKIT_API_SECRET
    mockGoogle()
    const sent = await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    expect(sent.code).toBe(501)
    expect(String((sent.body as { error: string }).error)).toMatch(/not configured/i)
  })

  it('501s when there is no membership backend to authorize against', async () => {
    delete process.env.LIVEBLOCKS_SECRET_KEY
    mockGoogle()
    const sent = await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    expect(sent.code).toBe(501)
    expect(addGrant).not.toHaveBeenCalled()
  })
})

describe('secret hygiene', () => {
  it('never echoes a secret, on success or failure', async () => {
    mockGoogle()
    const ok = await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    const bad = await callMediaToken({ projectId: '', googleToken: 'ya29.valid' })
    for (const sent of [ok, bad]) {
      const dump = JSON.stringify(sent)
      expect(dump).not.toContain('lk_secret_never_real')
      expect(dump).not.toContain('sk_test_never_real')
    }
  })

  it('marks responses no-store so no cache can replay a token', async () => {
    mockGoogle()
    const sent = await callMediaToken({ projectId: 'proj_1', googleToken: 'ya29.valid' })
    expect(sent.headers['Cache-Control']).toBe('no-store')
  })
})

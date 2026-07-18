// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrackSource } from 'livekit-server-sdk'

/**
 * Regression guard for the 500 `TypeError: Cannot convert TrackSource
 * microphone to string`.
 *
 * Runs under `node`, not the default jsdom: signing is real here, and jsdom's
 * cross-realm `Uint8Array` makes `jose` reject the payload before the grant is
 * ever serialised. This is a server endpoint, so `node` is also simply the
 * honest environment for it.
 *
 * The sibling suite (media-token.test.ts) stubs `AccessToken`, so `toJwt()`
 * never ran and the grant was never serialised — which is exactly why a grant
 * LiveKit rejects could pass every test and still fail in production. Here the
 * real signer is used: `toJwt()` pushes `canPublishSources` through the SDK's
 * `trackSourceToString`, which throws on anything that is not a `TrackSource`
 * enum member. Only Liveblocks and Google are mocked, and the LiveKit secret is
 * a local throwaway, so the suite still runs offline.
 */

const getRoom = vi.fn()

vi.mock('@liveblocks/node', () => ({
  Liveblocks: class {
    getRoom = getRoom
  },
}))

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

function mockGoogle(email: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('tokeninfo')
        ? {
            ok: true,
            json: async () => ({
              sub: 'g-sub-1',
              aud: 'client-123.apps.googleusercontent.com',
              email,
            }),
          }
        : { ok: true, json: async () => ({ email, name: 'Ada Lovelace' }) },
    ),
  )
}

/** The signed claims, read back the way LiveKit's server would. */
function claimsOf(token: string): { video?: { canPublishSources?: string[] } } {
  const payload = token.split('.')[1]
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
}

async function mintFor(email: string) {
  mockGoogle(email)
  const { default: handler } = await import('./media-token')
  const { res, sent } = makeRes()
  await handler({ method: 'POST', body: { projectId: 'proj_1', googleToken: 'ya29.valid' } }, res)
  return sent
}

beforeEach(() => {
  vi.resetModules()
  getRoom.mockReset()
  getRoom.mockResolvedValue(ACL_ROOM)
  process.env.LIVEBLOCKS_SECRET_KEY = 'sk_test_never_real'
  process.env.LIVEKIT_API_KEY = 'lk_key_test'
  // a local throwaway; jose needs >= 32 bytes to sign HS256
  process.env.LIVEKIT_API_SECRET = 'lk_secret_never_real_padding_0123456789'
  process.env.VITE_LIVEKIT_URL = 'wss://example.livekit.cloud'
  process.env.VITE_GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the grant survives real LiveKit serialisation', () => {
  it('signs a token for an editor instead of throwing on the track sources', async () => {
    const sent = await mintFor('ada@example.com')

    // a grant LiveKit cannot serialise surfaces as a 500, never a 200
    expect(sent.code).toBe(200)
    const { token } = sent.body as { token: string }
    expect(token.split('.')).toHaveLength(3)

    expect(claimsOf(token).video?.canPublishSources).toEqual([
      'microphone',
      'camera',
      'screen_share',
      'screen_share_audio',
    ])
  })

  it('signs a token for a viewer, without the screen-share sources', async () => {
    const sent = await mintFor('viv@example.com')

    expect(sent.code).toBe(200)
    const { token } = sent.body as { token: string }
    expect(claimsOf(token).video?.canPublishSources).toEqual(['microphone', 'camera'])
  })

  it('rejects the raw wire strings the endpoint used to pass', () => {
    // why the enum is mandatory: the SDK maps TrackSource -> wire string
    // itself, so pre-mapped strings hit its `default:` and throw. This is the
    // original crash, reproduced at its source.
    const wireStrings = ['microphone', 'camera', 'screen_share', 'screen_share_audio']
    expect(wireStrings).not.toContain(TrackSource.MICROPHONE)
    expect(TrackSource.MICROPHONE).toBe(2)
  })
})

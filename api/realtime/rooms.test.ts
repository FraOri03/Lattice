import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guards /api/realtime/rooms — where memberships are granted, and where
 * 16.2's migration happens: the first time an invited person opens a
 * project, the slot opened with their address is bound to their userId
 * and stops answering to the address.
 *
 * The Liveblocks SDK and Google's token endpoints are mocked so the suite
 * runs offline and no real secret is ever needed.
 */

const getRoom = vi.fn()
const createRoom = vi.fn()
const updateRoom = vi.fn()
const deleteRoom = vi.fn()

vi.mock('@liveblocks/node', () => ({
  Liveblocks: class {
    getRoom = getRoom
    createRoom = createRoom
    updateRoom = updateRoom
    deleteRoom = deleteRoom
  },
}))

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

/** Google tokeninfo + userinfo, in the order verifyGoogleToken calls them. */
function mockGoogle(email = 'ada@example.com', sub = 'g-sub-1'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('tokeninfo')) {
        return {
          ok: true,
          json: async () => ({
            sub,
            aud: 'client-123.apps.googleusercontent.com',
            email,
          }),
        }
      }
      return { ok: true, json: async () => ({ email, name: 'Ada', picture: '' }) }
    }),
  )
}

type Meta = Record<string, unknown>

const room = (metadata: Meta) => ({
  metadata: { kind: 'lattice-project', projectId: 'proj_1', ...metadata },
})

const BASE: Meta = {
  ownerEmail: 'owner@example.com',
  admins: ['ada@example.com'],
  editors: ['bob@example.com'],
}

async function call(body: unknown) {
  const { default: handler } = await import('./rooms.js')
  const { res, sent } = makeRes()
  await handler({ method: 'POST', body }, res)
  return sent
}

/** The metadata the handler last wrote, or null if it wrote none. */
const lastWrite = (): Meta | null =>
  updateRoom.mock.calls.length
    ? (updateRoom.mock.calls.at(-1)?.[1] as { metadata: Meta }).metadata
    : null

let canonical: string

beforeEach(async () => {
  vi.resetModules()
  for (const fn of [getRoom, createRoom, updateRoom, deleteRoom]) fn.mockReset()
  getRoom.mockResolvedValue(room(BASE))
  process.env.LIVEBLOCKS_SECRET_KEY = 'sk_test_never_real'
  process.env.VITE_GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com'
  const { googleUserIds } = await import('../../src/lib/auth/identity.js')
  canonical = googleUserIds('g-sub-1')[0]
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ensure — accepting an invitation', () => {
  it('binds the slot to the userId of whoever first proves the address', async () => {
    mockGoogle('ada@example.com')
    const sent = await call({ action: 'ensure', projectId: 'proj_1', googleToken: 'ya29' })

    expect(sent.code).toBe(200)
    expect(sent.body).toEqual({ role: 'admin' })
    // both rooms carry the same ACL
    expect(updateRoom).toHaveBeenCalledTimes(2)
    expect(lastWrite()?.bound).toEqual([`${canonical} ada@example.com`])
    // and nothing else about the ACL moved
    expect(lastWrite()?.admins).toEqual(['ada@example.com'])
  })

  it('writes once and then leaves the room alone', async () => {
    getRoom.mockResolvedValue(
      room({ ...BASE, bound: [`${canonical} ada@example.com`] }),
    )
    mockGoogle('ada@example.com')
    const sent = await call({ action: 'ensure', projectId: 'proj_1', googleToken: 'ya29' })

    expect(sent.code).toBe(200)
    expect(updateRoom).not.toHaveBeenCalled()
  })

  it('refuses a slot already claimed by somebody else', async () => {
    getRoom.mockResolvedValue(
      room({ ...BASE, bound: ['usr_the_previous_holder ada@example.com'] }),
    )
    mockGoogle('ada@example.com')
    const sent = await call({ action: 'ensure', projectId: 'proj_1', googleToken: 'ya29' })

    expect(sent.code).toBe(403)
    expect(updateRoom).not.toHaveBeenCalled()
  })

  it('bootstraps a new project with its owner already bound', async () => {
    getRoom.mockRejectedValueOnce(new Error('no room')) // first load: none
    getRoom.mockResolvedValue(
      room({ ownerEmail: 'ada@example.com', bound: [`${canonical} ada@example.com`] }),
    )
    mockGoogle('ada@example.com')
    const sent = await call({ action: 'ensure', projectId: 'proj_1', googleToken: 'ya29' })

    expect(sent.code).toBe(200)
    expect(sent.body).toEqual({ role: 'owner' })
    const created = createRoom.mock.calls[0]?.[1] as { metadata: Meta }
    expect(created.metadata.bound).toEqual([`${canonical} ada@example.com`])
  })

  it('403s a stranger without touching the room', async () => {
    mockGoogle('stranger@example.com')
    const sent = await call({ action: 'ensure', projectId: 'proj_1', googleToken: 'ya29' })
    expect(sent.code).toBe(403)
    expect(updateRoom).not.toHaveBeenCalled()
  })
})

describe('set-role — rank rules survive the migration', () => {
  it('does not let an editor remove a BOUND admin', async () => {
    // the slot answers only to ada's userId, which is precisely why the
    // rank check must not ask "who can claim this" to find out what it is
    getRoom.mockResolvedValue(
      room({
        ...BASE,
        editors: ['bob@example.com'],
        bound: [
          'usr_ada ada@example.com',
          `${canonical} bob@example.com`,
        ],
      }),
    )
    mockGoogle('bob@example.com')
    const sent = await call({
      action: 'set-role',
      projectId: 'proj_1',
      email: 'ada@example.com',
      role: null,
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(403)
    expect(updateRoom).not.toHaveBeenCalled()
  })

  it('forgets the binding when a member is removed', async () => {
    getRoom.mockResolvedValue(
      room({
        ...BASE,
        ownerEmail: 'ada@example.com',
        admins: [],
        bound: [`${canonical} ada@example.com`, 'usr_bob bob@example.com'],
      }),
    )
    mockGoogle('ada@example.com')
    const sent = await call({
      action: 'set-role',
      projectId: 'proj_1',
      email: 'bob@example.com',
      role: null,
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(200)
    // bob is gone from the lists and from the bindings
    expect(lastWrite()?.editors).toBeNull()
    expect(lastWrite()?.bound).toEqual([`${canonical} ada@example.com`])
  })

  it('keeps the binding when a member changes role', async () => {
    getRoom.mockResolvedValue(
      room({
        ...BASE,
        ownerEmail: 'ada@example.com',
        admins: [],
        bound: [`${canonical} ada@example.com`, 'usr_bob bob@example.com'],
      }),
    )
    mockGoogle('ada@example.com')
    const sent = await call({
      action: 'set-role',
      projectId: 'proj_1',
      email: 'bob@example.com',
      role: 'viewer',
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(200)
    expect(lastWrite()?.viewers).toEqual(['bob@example.com'])
    expect(lastWrite()?.bound).toContain('usr_bob bob@example.com')
  })

  it('lets an owner open a slot for somebody who has never signed in', async () => {
    getRoom.mockResolvedValue(room({ ...BASE, ownerEmail: 'ada@example.com', admins: [] }))
    mockGoogle('ada@example.com')
    const sent = await call({
      action: 'set-role',
      projectId: 'proj_1',
      email: 'new@example.com',
      role: 'editor',
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(200)
    expect(lastWrite()?.editors).toContain('new@example.com')
    // unbound: an invitation not yet accepted is exactly this
    expect(lastWrite()?.bound ?? null).toBeNull()
  })
})

/**
 * transfer-ownership — the action `set-role` refuses to perform.
 *
 * `membersService.transferOwnership` rewrote the local member list and
 * mirrored nothing, so on a realtime project the ACL that actually decides
 * kept naming the previous owner: the recipient could not manage admins or
 * delete the rooms, and the sender still could. The UI reported success.
 */
describe('transfer-ownership', () => {
  const OWNED: Meta = {
    ownerEmail: 'ada@example.com',
    admins: [],
    editors: ['bob@example.com'],
  }

  it('swaps the two slots in a single write', async () => {
    getRoom.mockResolvedValue(room(OWNED))
    mockGoogle('ada@example.com')
    const sent = await call({
      action: 'transfer-ownership',
      projectId: 'proj_1',
      email: 'bob@example.com',
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(200)
    expect(lastWrite()?.ownerEmail).toBe('bob@example.com')
    // the sender lands as admin — never dropped, never left as owner too
    expect(lastWrite()?.admins).toEqual(['ada@example.com'])
    expect(lastWrite()?.editors ?? null).toBeNull()
    // both rooms, like every other ACL write
    expect(updateRoom).toHaveBeenCalledTimes(2)
  })

  it('carries both bindings across, so neither has to prove an address again', async () => {
    getRoom.mockResolvedValue(
      room({
        ...OWNED,
        bound: [`${canonical} ada@example.com`, 'usr_bob bob@example.com'],
      }),
    )
    mockGoogle('ada@example.com')
    const sent = await call({
      action: 'transfer-ownership',
      projectId: 'proj_1',
      email: 'bob@example.com',
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(200)
    expect(lastWrite()?.bound).toContain(`${canonical} ada@example.com`)
    expect(lastWrite()?.bound).toContain('usr_bob bob@example.com')
  })

  it('is refused to everybody but the owner', async () => {
    getRoom.mockResolvedValue(
      room({ ownerEmail: 'owner@example.com', admins: ['ada@example.com'] }),
    )
    mockGoogle('ada@example.com') // an admin, the highest rank below owner
    const sent = await call({
      action: 'transfer-ownership',
      projectId: 'proj_1',
      email: 'ada@example.com',
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(403)
    expect(updateRoom).not.toHaveBeenCalled()
  })

  it('refuses an address that is not already a member', async () => {
    // ownership is handed over, not granted: otherwise the one action nobody
    // else can authorise becomes a way to give the project to a stranger
    getRoom.mockResolvedValue(room(OWNED))
    mockGoogle('ada@example.com')
    const sent = await call({
      action: 'transfer-ownership',
      projectId: 'proj_1',
      email: 'nobody@example.com',
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(404)
    expect(updateRoom).not.toHaveBeenCalled()
  })

  it('refuses to hand the project to the person who already owns it', async () => {
    getRoom.mockResolvedValue(room(OWNED))
    mockGoogle('ada@example.com')
    const sent = await call({
      action: 'transfer-ownership',
      projectId: 'proj_1',
      email: 'ada@example.com',
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(409)
    expect(updateRoom).not.toHaveBeenCalled()
  })

  it('still refuses to move the owner slot through set-role', async () => {
    getRoom.mockResolvedValue(room(OWNED))
    mockGoogle('ada@example.com')
    const sent = await call({
      action: 'set-role',
      projectId: 'proj_1',
      email: 'ada@example.com',
      role: 'admin',
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(403)
    expect(updateRoom).not.toHaveBeenCalled()
  })
})

describe('members — reading the ACL the endpoints enforce', () => {
  it('hands the ACL to a member, which is what makes the drift visible', async () => {
    mockGoogle('ada@example.com')
    const sent = await call({ action: 'members', projectId: 'proj_1', googleToken: 'ya29' })

    expect(sent.code).toBe(200)
    expect((sent.body as { acl: { ownerEmail: string } }).acl.ownerEmail).toBe(
      'owner@example.com',
    )
  })

  /**
   * The two refusals used to be one 403, so the client could not tell "nobody
   * has opened this project with realtime yet" (which its owner fixes alone)
   * from "the server does not know you here" (which needs somebody else).
   */
  it('says 404 when the project has no rooms at all', async () => {
    getRoom.mockRejectedValue(new Error('room not found'))
    mockGoogle('ada@example.com')
    const sent = await call({ action: 'members', projectId: 'proj_1', googleToken: 'ya29' })

    expect(sent.code).toBe(404)
  })

  it('says 403 when the rooms exist and the caller is not in them', async () => {
    mockGoogle('stranger@example.com', 'g-sub-9')
    const sent = await call({ action: 'members', projectId: 'proj_1', googleToken: 'ya29' })

    expect(sent.code).toBe(403)
  })
})

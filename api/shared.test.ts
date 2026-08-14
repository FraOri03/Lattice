import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepositories } from './_lib/db/memory.js'
import { INVITE_TTL_MS } from '../src/lib/collab/invitations.js'
import type { ProjectInvite } from '../src/types/collab.js'
import type { SharedIndex } from '../src/types/shared.js'

/**
 * /api/shared — the index 15.5 was told to wait for (18.4, #91).
 *
 * The two sections it feeds could not be built before: a browser only knows
 * its own memberships, and the realtime backend can say whether an address
 * may enter a room but not which rooms it may enter.
 */

const db = new MemoryRepositories()
let databasePresent = true

vi.mock('./_lib/db/index.js', () => ({
  repositories: () => (databasePresent ? db : null),
  NO_DATABASE: 'no database is configured',
}))

const handler = (await import('./shared.js')).default

interface Sent {
  code: number
  body: unknown
}

function makeRes() {
  const sent: Sent = { code: 0, body: null }
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

function signedInAs(email: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('tokeninfo')) {
        return { ok: true, json: async () => ({ sub: `sub_${email}`, email }) }
      }
      return { ok: true, json: async () => ({ email, name: 'Grace', picture: '' }) }
    }),
  )
}

async function index(): Promise<Sent> {
  const { res, sent } = makeRes()
  await handler({ method: 'POST', body: { action: 'index', googleToken: 'ya29' } }, res)
  return sent
}

const asIndex = (sent: Sent) => sent.body as SharedIndex

/** A user with the identities their account has proved. */
async function account(
  userId: string,
  identities: { email: string; verified: boolean }[],
) {
  const now = Date.now()
  for (const [i, held] of identities.entries()) {
    await db.identities.saveResolved({
      user: {
        id: userId,
        primaryEmail: identities[0].email,
        displayName: userId,
        avatarUrl: '',
        createdAt: now,
        updatedAt: now,
      },
      identity: {
        id: `idn_${userId}_${i}`,
        userId,
        provider: i === 0 ? 'google' : 'email',
        providerSubject: `sub_${held.email}`,
        email: held.email,
        verifiedAt: held.verified ? now : null,
      },
      createdUser: i === 0,
      linkedIdentity: i > 0,
    })
  }
}

async function invitation(over: Partial<ProjectInvite> = {}): Promise<ProjectInvite> {
  const now = Date.now()
  return db.invitations.create({
    id: `inv_${Math.random().toString(36).slice(2)}`,
    projectId: 'proj_x',
    email: 'grace@example.com',
    role: 'editor',
    tokenHash: `h_${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    invitedBy: 'usr_owner',
    invitedByName: 'Owner',
    status: 'pending',
    expiresAt: now + INVITE_TTL_MS,
    updatedAt: now,
    ...over,
  })
}

beforeEach(() => {
  databasePresent = true
  db.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the projects half', () => {
  it('lists a project shared with the signed-in address', async () => {
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    await db.memberships.setRole('p1', 'owner@example.com', 'owner')
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')

    signedInAs('grace@example.com')
    const sent = await index()

    expect(sent.code).toBe(200)
    expect(asIndex(sent).projects).toEqual([
      {
        projectId: 'p1',
        role: 'editor',
        ownerEmail: 'owner@example.com',
        claimed: false,
      },
    ])
  })

  it('finds projects shared with ANY address the account has verified', async () => {
    await account('usr_grace', [
      { email: 'work@example.com', verified: true },
      { email: 'home@example.com', verified: true },
    ])
    await db.memberships.setRole('p1', 'work@example.com', 'editor')
    await db.memberships.setRole('p2', 'home@example.com', 'viewer')

    signedInAs('work@example.com')
    const projects = asIndex(await index()).projects
    expect(projects.map((p) => p.projectId).sort()).toEqual(['p1', 'p2'])
  })

  it('ignores an address the account holds but never verified', async () => {
    await account('usr_grace', [
      { email: 'work@example.com', verified: true },
      { email: 'claimed@example.com', verified: false },
    ])
    await db.memberships.setRole('p2', 'claimed@example.com', 'viewer')

    signedInAs('work@example.com')
    expect(asIndex(await index()).projects).toEqual([])
  })

  it('never lists a project you own — that is not shared WITH you', async () => {
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    await db.memberships.setRole('p1', 'grace@example.com', 'owner')

    signedInAs('grace@example.com')
    expect(asIndex(await index()).projects).toEqual([])
  })

  it('reports a bound slot as claimed', async () => {
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')
    await db.memberships.bind('p1', 'grace@example.com', 'usr_grace')

    signedInAs('grace@example.com')
    expect(asIndex(await index()).projects[0].claimed).toBe(true)
  })

  it('does not hand somebody a slot claimed by another account', async () => {
    // 16.2: a claimed slot answers to its userId, so a reassigned address
    // inherits nothing — the index must not undo that
    await account('usr_new', [{ email: 'grace@example.com', verified: true }])
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')
    await db.memberships.bind('p1', 'grace@example.com', 'usr_previous')

    signedInAs('grace@example.com')
    expect(asIndex(await index()).projects).toEqual([])
  })

  it('says the owner is unknown rather than inventing one', async () => {
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')

    signedInAs('grace@example.com')
    expect(asIndex(await index()).projects[0].ownerEmail).toBe('')
  })
})

describe('the invitations half', () => {
  it('lists what is waiting for the caller, without the token', async () => {
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    const invite = await invitation()

    signedInAs('grace@example.com')
    const invitations = asIndex(await index()).invitations

    expect(invitations).toHaveLength(1)
    expect(invitations[0]).toMatchObject({ id: invite.id, role: 'editor' })
    expect(invitations[0].token).toBeUndefined()
  })

  it('lists invitations sent to any verified address', async () => {
    await account('usr_grace', [
      { email: 'work@example.com', verified: true },
      { email: 'home@example.com', verified: true },
    ])
    await invitation({ email: 'work@example.com', projectId: 'p1' })
    await invitation({ email: 'home@example.com', projectId: 'p2' })

    signedInAs('work@example.com')
    expect(asIndex(await index()).invitations).toHaveLength(2)
  })

  it('never lists somebody else’s invitation', async () => {
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    await invitation({ email: 'mallory@example.com' })

    signedInAs('grace@example.com')
    expect(asIndex(await index()).invitations).toEqual([])
  })

  it('omits one whose deadline passed, without waiting for a sweep', async () => {
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    const invite = await invitation()
    vi.setSystemTime(invite.expiresAt + 1)

    signedInAs('grace@example.com')
    expect(asIndex(await index()).invitations).toEqual([])

    vi.useRealTimers()
  })

  it('omits a revoked one', async () => {
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    const invite = await invitation()
    await db.invitations.patch(invite.id, { status: 'revoked' })

    signedInAs('grace@example.com')
    expect(asIndex(await index()).invitations).toEqual([])
  })
})

describe('the endpoint itself', () => {
  it('reports the addresses the answer was assembled from', async () => {
    await account('usr_grace', [
      { email: 'work@example.com', verified: true },
      { email: 'home@example.com', verified: true },
    ])
    signedInAs('work@example.com')
    expect(asIndex(await index()).addresses.sort()).toEqual([
      'home@example.com',
      'work@example.com',
    ])
  })

  it('answers an empty index for somebody with nothing', async () => {
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    signedInAs('grace@example.com')
    expect(asIndex(await index())).toEqual({
      projects: [],
      invitations: [],
      addresses: ['grace@example.com'],
    })
  })

  it('refuses an unauthenticated caller', async () => {
    const { res, sent } = makeRes()
    await handler({ method: 'POST', body: { action: 'index' } }, res)
    expect(sent.code).toBe(401)
  })

  it('answers 501 rather than pretending, with no database', async () => {
    databasePresent = false
    expect((await index()).code).toBe(501)
  })

  it('is POST only', async () => {
    const { res, sent } = makeRes()
    await handler({ method: 'GET' }, res)
    expect(sent.code).toBe(405)
  })

  it('rejects an unknown action', async () => {
    const { res, sent } = makeRes()
    await handler({ method: 'POST', body: { action: 'nope' } }, res)
    expect(sent.code).toBe(400)
  })
})

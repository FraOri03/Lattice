import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepositories } from './_lib/db/memory.js'
import { hashToken } from './_lib/session.js'
import { INVITE_TTL_MS } from '../src/lib/collab/invitations.js'
import { recordSend } from './_lib/mailLimits.js'
import { MAIL_MAX_PER_PROJECT, MAIL_MAX_PER_RECIPIENT } from '../src/types/mail.js'
import type { RoomAcl } from '../src/lib/collab/acl.js'
import type { ProjectInvite } from '../src/types/collab.js'

/**
 * /api/invitations — where the invitation stops being a value one browser
 * happens to hold (18.1, #88).
 *
 * The suite is written around the two things that change: the token is a
 * credential now, so it must never come back out of storage; and the
 * recipient is somewhere else, so a link has to resolve without the store
 * that created it.
 */

const db = new MemoryRepositories()
let databasePresent = true

vi.mock('./_lib/db/index.js', () => ({
  repositories: () => (databasePresent ? db : null),
  NO_DATABASE: 'no database is configured',
}))

/** Every message the endpoint tried to send, newest last. */
const outbox: { to: string; subject: string; text: string; html?: string }[] = []
let mailConfigured = true
let mailFails = false
/** Makes the TEMPLATE throw, which is a different failure from the provider's. */
let templateThrows = false

vi.mock('./_lib/mailTemplates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/mailTemplates.js')>()
  return {
    ...actual,
    invitationMessage: (options: Parameters<typeof actual.invitationMessage>[0]) => {
      if (templateThrows) throw new RangeError('Invalid time value')
      return actual.invitationMessage(options)
    },
  }
})

/** Configured, and configured wrongly — a `MAIL_FROM` the provider refuses. */
let mailProblem = ''

vi.mock('./_lib/mail.js', () => ({
  mailSender: () =>
    mailConfigured
      ? {
          problem: mailProblem || undefined,
          send: async (message: { to: string; subject: string; text: string; html?: string }) => {
            if (mailFails) throw new Error('provider said no')
            outbox.push(message)
          },
        }
      : null,
}))

const handler = (await import('./invitations.js')).default

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

/** Google's answer, in the order verifyGoogleToken asks for it. */
function signedInAs(email: string, name = 'Ada'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('tokeninfo')) {
        return { ok: true, json: async () => ({ sub: `g-${email}`, email }) }
      }
      return { ok: true, json: async () => ({ email, name, picture: '' }) }
    }),
  )
}

async function call(body: unknown): Promise<Sent> {
  const { res, sent } = makeRes()
  // the Host header is where the invite link and the logo URL come from
  await handler(
    { method: 'POST', body, headers: { host: 'lattice.example.com' } },
    res,
  )
  return sent
}

const acl = (patch: Partial<RoomAcl> = {}): RoomAcl => ({
  ownerEmail: 'owner@example.com',
  admins: ['ada@example.com'],
  editors: ['bob@example.com'],
  commenters: [],
  viewers: [],
  bindings: {},
  ...patch,
})

const asInvite = (sent: Sent): ProjectInvite =>
  (sent.body as { invite: ProjectInvite }).invite

const tokenOf = (sent: Sent): string | null =>
  (sent.body as { token: string | null }).token

/** The owner invites grace@ as an editor and gets the link token back. */
async function seedInvite(over: Record<string, unknown> = {}) {
  signedInAs('owner@example.com', 'Owner')
  const sent = await call({
    action: 'create',
    projectId: 'proj_1',
    email: 'grace@example.com',
    role: 'editor',
    googleToken: 'ya29',
    ...over,
  })
  return { sent, invite: asInvite(sent), token: tokenOf(sent) as string }
}

beforeEach(async () => {
  databasePresent = true
  mailConfigured = true
  mailFails = false
  mailProblem = ''
  templateThrows = false
  outbox.length = 0
  db.clear()
  await db.memberships.replaceAcl('proj_1', acl())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('create', () => {
  it('mints an invitation and hands back the link token exactly once', async () => {
    const { sent, invite, token } = await seedInvite()

    expect(sent.code).toBe(201)
    expect(token).toMatch(/^[\w-]{20,}$/)
    expect(invite).toMatchObject({
      projectId: 'proj_1',
      email: 'grace@example.com',
      role: 'editor',
      status: 'pending',
      invitedByName: 'Owner',
    })
    expect(invite.expiresAt - invite.createdAt).toBe(INVITE_TTL_MS)
  })

  it('stores the digest and returns no token on the record itself', async () => {
    const { invite, token } = await seedInvite()

    expect(invite.token).toBeUndefined()
    expect(invite.tokenHash).toBe(hashToken(token))
    const stored = await db.invitations.byTokenHash(hashToken(token))
    expect(stored?.id).toBe(invite.id)
    expect(stored?.token).toBeUndefined()
  })

  it('refuses an address that is already a member', async () => {
    signedInAs('owner@example.com')
    const sent = await call({
      action: 'create',
      projectId: 'proj_1',
      email: 'bob@example.com',
      role: 'viewer',
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(409)
  })

  it('refuses a role the caller could not assign', async () => {
    // an admin may not create another admin; only the owner may
    signedInAs('ada@example.com')
    const sent = await call({
      action: 'create',
      projectId: 'proj_1',
      email: 'grace@example.com',
      role: 'admin',
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(403)
  })

  it('never offers ownership', async () => {
    signedInAs('owner@example.com')
    const sent = await call({
      action: 'create',
      projectId: 'proj_1',
      email: 'grace@example.com',
      role: 'owner',
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(400)
  })

  it('hands back the invitation already open for the address, and no link for it', async () => {
    const first = await seedInvite()
    const again = await seedInvite()

    // the token of the first one cannot be recovered from its digest, so a
    // second create says "one is already open" rather than inventing a link
    expect(again.sent.code).toBe(200)
    expect(again.invite.id).toBe(first.invite.id)
    expect(tokenOf(again.sent)).toBeNull()
  })
})

describe('who may manage invitations', () => {
  it('refuses somebody who is not in the project', async () => {
    signedInAs('stranger@example.com')
    const sent = await call({
      action: 'list',
      projectId: 'proj_1',
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(403)
  })

  it('refuses a member who cannot manage members', async () => {
    // an editor is a member, and still has no business knowing which
    // addresses have been approached
    signedInAs('bob@example.com')
    const sent = await call({
      action: 'list',
      projectId: 'proj_1',
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(403)
  })

  it('answers 501 rather than pretending, when the deployment has no database', async () => {
    databasePresent = false
    const sent = await call({ action: 'list', projectId: 'proj_1' })
    expect(sent.code).toBe(501)
  })
})

describe('resolve — the other browser', () => {
  it('finds the invitation from the token alone, with no session at all', async () => {
    const { token, invite } = await seedInvite()
    vi.unstubAllGlobals() // nobody is signed in on this side

    const sent = await call({ action: 'resolve', token })
    expect(sent.code).toBe(200)
    expect(asInvite(sent)).toMatchObject({
      id: invite.id,
      projectId: 'proj_1',
      email: 'grace@example.com',
      role: 'editor',
      status: 'pending',
    })
  })

  it('never returns the token it was asked about', async () => {
    const { token } = await seedInvite()
    const sent = await call({ action: 'resolve', token })
    expect(asInvite(sent).token).toBeUndefined()
  })

  it('rejects a token that matches nothing', async () => {
    await seedInvite()
    const sent = await call({ action: 'resolve', token: 'not-a-real-token' })
    expect(sent.code).toBe(404)
  })

  it('grants nothing: resolving does not touch the membership list', async () => {
    const { token } = await seedInvite()
    const before = await db.memberships.aclOf('proj_1')
    await call({ action: 'resolve', token })
    expect(await db.memberships.aclOf('proj_1')).toEqual(before)
  })
})

describe('expiry', () => {
  it('reports a lapsed invitation as expired and writes that down', async () => {
    const { invite, token } = await seedInvite()
    // walk the clock past the deadline rather than editing the record
    vi.setSystemTime(invite.expiresAt + 1)

    const sent = await call({ action: 'resolve', token })
    expect(asInvite(sent).status).toBe('expired')
    // the lazy sweep: the row itself now says so, with no cron involved
    expect((await db.invitations.byTokenHash(hashToken(token)))?.status).toBe('expired')

    vi.useRealTimers()
  })

  it('lets the address be invited again once the previous offer lapsed', async () => {
    const first = await seedInvite()
    vi.setSystemTime(first.invite.expiresAt + 1)

    const second = await seedInvite()
    expect(second.sent.code).toBe(201)
    expect(second.invite.id).not.toBe(first.invite.id)
    expect(second.token).not.toBe(first.token)

    vi.useRealTimers()
  })
})

describe('resend', () => {
  it('rotates the token: the old link stops working and the new one starts', async () => {
    const first = await seedInvite()

    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'resend',
      projectId: 'proj_1',
      inviteId: first.invite.id,
      googleToken: 'ya29',
    })
    const fresh = tokenOf(sent) as string

    expect(sent.code).toBe(200)
    expect(fresh).not.toBe(first.token)
    expect((await call({ action: 'resolve', token: first.token })).code).toBe(404)
    expect((await call({ action: 'resolve', token: fresh })).code).toBe(200)
  })

  it('gives it a fresh deadline', async () => {
    const first = await seedInvite()
    vi.setSystemTime(first.invite.createdAt + 60_000)

    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'resend',
      projectId: 'proj_1',
      inviteId: first.invite.id,
      googleToken: 'ya29',
    })
    expect(asInvite(sent).expiresAt).toBeGreaterThan(first.invite.expiresAt)
    expect(asInvite(sent).resentAt).toBeGreaterThan(0)

    vi.useRealTimers()
  })

  it('revives one that had lapsed', async () => {
    const first = await seedInvite()
    vi.setSystemTime(first.invite.expiresAt + 1)

    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'resend',
      projectId: 'proj_1',
      inviteId: first.invite.id,
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(200)
    expect(asInvite(sent).status).toBe('pending')

    vi.useRealTimers()
  })
})

describe('revoke and decline', () => {
  it('withdraws an invitation, and its link stops resolving to a live offer', async () => {
    const { invite, token } = await seedInvite()

    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'revoke',
      projectId: 'proj_1',
      inviteId: invite.id,
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(200)
    expect(asInvite(sent).status).toBe('revoked')
    expect(asInvite(await call({ action: 'resolve', token })).status).toBe('revoked')
  })

  it('lets the recipient say no, which is not the same fact as being revoked', async () => {
    const { token } = await seedInvite()

    const sent = await call({ action: 'decline', token })
    expect(sent.code).toBe(200)
    expect(asInvite(sent).status).toBe('declined')
  })

  it('refuses to decline something already settled', async () => {
    const { invite, token } = await seedInvite()
    signedInAs('owner@example.com', 'Owner')
    await call({
      action: 'revoke',
      projectId: 'proj_1',
      inviteId: invite.id,
      googleToken: 'ya29',
    })
    expect((await call({ action: 'decline', token })).code).toBe(409)
  })
})

describe('set-role before acceptance', () => {
  it('changes what is offered while the invitation is live', async () => {
    const { invite } = await seedInvite()

    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'set-role',
      projectId: 'proj_1',
      inviteId: invite.id,
      role: 'viewer',
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(200)
    expect(asInvite(sent).role).toBe('viewer')
  })

  it('refuses once the invitation has been accepted', async () => {
    const { invite } = await seedInvite()
    await db.invitations.patch(invite.id, {
      status: 'accepted',
      acceptedAt: Date.now(),
      acceptedBy: 'usr_grace',
    })

    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'set-role',
      projectId: 'proj_1',
      inviteId: invite.id,
      role: 'viewer',
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(409)
  })

  it('refuses to let an admin rewrite an offer of a rank they could not have made', async () => {
    // the owner offers admin; an admin must not be able to edit that record
    signedInAs('owner@example.com', 'Owner')
    const created = await call({
      action: 'create',
      projectId: 'proj_1',
      email: 'grace@example.com',
      role: 'admin',
      googleToken: 'ya29',
    })

    signedInAs('ada@example.com')
    const sent = await call({
      action: 'set-role',
      projectId: 'proj_1',
      inviteId: asInvite(created).id,
      role: 'viewer',
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(403)
  })

  it('does not reach into another project', async () => {
    const { invite } = await seedInvite()
    await db.memberships.replaceAcl('proj_2', acl())

    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'set-role',
      projectId: 'proj_2',
      inviteId: invite.id,
      role: 'viewer',
      googleToken: 'ya29',
    })
    expect(sent.code).toBe(404)
  })
})

describe('delivery (18.2)', () => {
  it('e-mails the invited address and says the message went', async () => {
    const { sent, invite, token } = await seedInvite({ projectName: 'Acme redesign' })

    expect((sent.body as { delivery: string }).delivery).toBe('sent')
    expect(outbox).toHaveLength(1)
    expect(outbox[0].to).toBe('grace@example.com')
    expect(outbox[0].subject).toContain('Acme redesign')
    // the link carries the token that was just minted, at this deployment
    expect(outbox[0].text).toContain(`https://lattice.example.com/#invite=${token}`)
    expect(outbox[0].html).toContain('https://lattice.example.com/brand/lattice-mark.png')
    expect(invite.token).toBeUndefined()
  })

  it('writes the message in the language the caller asked for', async () => {
    await seedInvite({ projectName: 'Acme', locale: 'it' })
    expect(outbox[0].subject).toContain('ti ha invitato')
  })

  it('reports a failed send without failing the request', async () => {
    mailFails = true
    const { sent, token } = await seedInvite()

    // the invitation and its link are valid either way, so this is a state
    // to report rather than an error to raise
    expect(sent.code).toBe(201)
    expect((sent.body as { delivery: string }).delivery).toBe('failed')
    expect(token).toBeTruthy()
  })

  it('hands the provider’s reason to the sender, who is the one who can act on it', async () => {
    mailFails = true
    const { sent } = await seedInvite()
    // "the domain is not verified" is an afternoon of guessing otherwise
    expect((sent.body as { deliveryError: string }).deliveryError).toContain(
      'provider said no',
    )
  })

  it('does not blame the provider for a message it never built', async () => {
    /**
     * A template that throws used to be caught by the handler meant for
     * provider rejections: reported as "not sent", the sender advised to
     * resend, and no request ever made. Two unrelated failures wearing one
     * face — which is exactly what made a live one impossible to diagnose.
     */
    templateThrows = true
    const { sent } = await seedInvite()

    expect(sent.code).toBe(201)
    expect((sent.body as { delivery: string }).delivery).toBe('failed')
    expect((sent.body as { deliveryError: string }).deliveryError).toContain(
      'could not compose',
    )
    // nothing was handed to the transport, which is the tell
    expect(outbox).toHaveLength(0)
  })

  it('does not spend the sender’s allowance on a message it never built', async () => {
    templateThrows = true
    await seedInvite()
    expect(await db.mailSends.countForRecipient('grace@example.com', 0)).toBe(0)
  })

  it('calls a broken MAIL_FROM broken, not missing', async () => {
    /**
     * The deployment HAS mail. Reporting "no mail backend" for a malformed
     * address would point the only person who can fix it at a key that is
     * already set — and the provider's own 422 names a format without
     * naming which setting holds it.
     */
    mailProblem = 'MAIL_FROM is not a valid From address: it has to be…'
    const { sent } = await seedInvite()

    expect(sent.code).toBe(201)
    expect((sent.body as { delivery: string }).delivery).toBe('failed')
    expect((sent.body as { deliveryError: string }).deliveryError).toContain('MAIL_FROM')
    expect(outbox).toHaveLength(0)
  })

  it('does not spend the allowance on a send it knew it could not make', async () => {
    // no request reached the provider and no mailbox was touched, so the
    // ceiling has nothing to count — charging it would lock this address out
    // of being invited for an hour over a typo in an environment variable
    mailProblem = 'MAIL_FROM is not a valid From address: it has to be…'
    await seedInvite()
    expect(await db.mailSends.countForRecipient('grace@example.com', 0)).toBe(0)
  })

  it('says delivery is unavailable when the server has no transport', async () => {
    mailConfigured = false
    const { sent } = await seedInvite()
    expect(sent.code).toBe(201)
    expect((sent.body as { delivery: string }).delivery).toBe('unavailable')
    expect(outbox).toHaveLength(0)
  })

  it('sends again on resend, with the rotated token', async () => {
    const first = await seedInvite()
    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'resend',
      projectId: 'proj_1',
      inviteId: first.invite.id,
      googleToken: 'ya29',
    })
    const fresh = tokenOf(sent) as string

    expect(outbox).toHaveLength(2)
    expect(outbox[1].text).toContain(fresh)
    expect(outbox[1].text).not.toContain(first.token)
  })

  it('does not send for an address that already had an invitation open', async () => {
    await seedInvite()
    await seedInvite()
    // the second create returned the existing record and no link, so there
    // was nothing to put in a message
    expect(outbox).toHaveLength(1)
  })
})

describe('rate limiting (18.2)', () => {
  it('refuses once the address has had its hour’s worth', async () => {
    for (let i = 0; i < MAIL_MAX_PER_RECIPIENT; i += 1) {
      await recordSend(db.mailSends, 'invitation', 'grace@example.com', `other_${i}`)
    }
    const { sent } = await seedInvite()

    expect(sent.code).toBe(429)
    expect(outbox).toHaveLength(0)
  })

  it('refuses a project that has sent too much, whoever the address is', async () => {
    for (let i = 0; i < MAIL_MAX_PER_PROJECT; i += 1) {
      await recordSend(db.mailSends, 'invitation', `p${i}@example.com`, 'proj_1')
    }
    const { sent } = await seedInvite()
    expect(sent.code).toBe(429)
  })

  it('creates no invitation when it refuses', async () => {
    for (let i = 0; i < MAIL_MAX_PER_RECIPIENT; i += 1) {
      await recordSend(db.mailSends, 'invitation', 'grace@example.com', `other_${i}`)
    }
    await seedInvite()
    // a record the sender believes they made, with nothing delivered, is
    // worse than a refusal they can act on
    expect(await db.invitations.ofProject('proj_1')).toEqual([])
  })

  it('counts a send that failed, so retrying is not a way around the ceiling', async () => {
    mailFails = true
    await seedInvite()
    expect(await db.mailSends.countForRecipient('grace@example.com', 0)).toBe(1)
  })

  it('does not limit anything when there is no transport to limit', async () => {
    mailConfigured = false
    for (let i = 0; i < MAIL_MAX_PER_RECIPIENT + 3; i += 1) {
      await recordSend(db.mailSends, 'invitation', 'grace@example.com', `other_${i}`)
    }
    const { sent } = await seedInvite()
    expect(sent.code).toBe(201)
  })
})

describe('acceptance (18.3)', () => {
  /** A user, and the identities their account has proved. */
  async function account(
    userId: string,
    identities: { email: string; verified: boolean; provider?: 'google' | 'email' }[],
  ) {
    const now = Date.now()
    for (const [index, held] of identities.entries()) {
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
          id: `idn_${userId}_${index}`,
          userId,
          provider: held.provider ?? 'google',
          providerSubject: `sub_${held.email}`,
          email: held.email,
          verifiedAt: held.verified ? now : null,
        },
        createdUser: index === 0,
        linkedIdentity: index > 0,
      })
    }
  }

  it('lets the invited address in, and records who accepted', async () => {
    const { token, invite } = await seedInvite()
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])

    signedInAs('grace@example.com', 'Grace')
    const sent = await call({ action: 'accept', token, googleToken: 'ya29' })

    expect(sent.code).toBe(200)
    expect(asInvite(sent)).toMatchObject({
      status: 'accepted',
      acceptedBy: 'usr_grace',
    })
    expect(asInvite(sent).acceptedAt).toBeGreaterThan(0)
    // the membership is real, at the role that was offered
    const acl = await db.memberships.aclOf('proj_1')
    expect(acl?.editors).toContain('grace@example.com')
    expect(invite.role).toBe('editor')
  })

  it('REFUSES somebody signed in as a different address', async () => {
    // the hole #90 exists to close: an invitation to one address granting
    // membership to whoever happened to be signed in
    const { token } = await seedInvite()
    await account('usr_mallory', [{ email: 'mallory@example.com', verified: true }])

    signedInAs('mallory@example.com', 'Mallory')
    const sent = await call({ action: 'accept', token, googleToken: 'ya29' })

    expect(sent.code).toBe(403)
    expect((sent.body as { error: string }).error).toContain('grace@example.com')
    const acl = await db.memberships.aclOf('proj_1')
    expect(acl?.editors ?? []).not.toContain('mallory@example.com')
    expect((await db.invitations.byTokenHash(hashToken(token)))?.status).toBe('pending')
  })

  it('refuses an account that holds the address WITHOUT having verified it', async () => {
    const { token } = await seedInvite()
    await account('usr_mallory', [
      { email: 'mallory@example.com', verified: true },
      { email: 'grace@example.com', verified: false, provider: 'email' },
    ])

    signedInAs('mallory@example.com', 'Mallory')
    expect((await call({ action: 'accept', token, googleToken: 'ya29' })).code).toBe(403)
  })

  it('accepts when the invited address is a SECOND verified identity', async () => {
    // 16.1's convergence: refusing this would tell somebody they cannot
    // accept an invitation sent to their own mailbox
    const { token } = await seedInvite()
    await account('usr_grace', [
      { email: 'work@example.com', verified: true },
      { email: 'grace@example.com', verified: true, provider: 'email' },
    ])

    signedInAs('work@example.com', 'Grace')
    const sent = await call({ action: 'accept', token, googleToken: 'ya29' })
    expect(sent.code).toBe(200)
    expect(asInvite(sent).acceptedBy).toBe('usr_grace')
  })

  it('refuses a caller the database has never verified at all', async () => {
    const { token } = await seedInvite()
    signedInAs('grace@example.com', 'Grace') // no account row behind it
    expect((await call({ action: 'accept', token, googleToken: 'ya29' })).code).toBe(403)
  })

  it('refuses without a signed-in caller', async () => {
    const { token } = await seedInvite()
    vi.unstubAllGlobals()
    expect((await call({ action: 'accept', token })).code).toBe(401)
  })

  it('refuses a token that matches nothing', async () => {
    await seedInvite()
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    signedInAs('grace@example.com', 'Grace')
    expect(
      (await call({ action: 'accept', token: 'nope', googleToken: 'ya29' })).code,
    ).toBe(404)
  })

  it('refuses an invitation that already lapsed', async () => {
    const { token, invite } = await seedInvite()
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    vi.setSystemTime(invite.expiresAt + 1)

    signedInAs('grace@example.com', 'Grace')
    expect((await call({ action: 'accept', token, googleToken: 'ya29' })).code).toBe(409)

    vi.useRealTimers()
  })

  it('refuses a revoked invitation, and cannot be accepted twice', async () => {
    const { token, invite } = await seedInvite()
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])

    signedInAs('owner@example.com', 'Owner')
    await call({
      action: 'revoke',
      projectId: 'proj_1',
      inviteId: invite.id,
      googleToken: 'ya29',
    })
    signedInAs('grace@example.com', 'Grace')
    expect((await call({ action: 'accept', token, googleToken: 'ya29' })).code).toBe(409)

    const fresh = await seedInvite()
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    signedInAs('grace@example.com', 'Grace')
    expect((await call({ action: 'accept', token: fresh.token, googleToken: 'ya29' })).code).toBe(200)
    expect((await call({ action: 'accept', token: fresh.token, googleToken: 'ya29' })).code).toBe(409)
  })

  it('binds the Postgres membership to the real user id', async () => {
    const { token } = await seedInvite()
    await account('usr_grace', [{ email: 'grace@example.com', verified: true }])
    signedInAs('grace@example.com', 'Grace')
    await call({ action: 'accept', token, googleToken: 'ya29' })

    // project_memberships.user_id is a foreign key to users, so the id that
    // belongs there is the caller's real one
    const slots = await db.memberships.slotsOf(['usr_grace'], [])
    expect(slots.map((s) => s.projectId)).toContain('proj_1')
  })
})

describe('a project the server has never seen', () => {
  /**
   * Most projects are local: nothing writes a membership until somebody
   * shares one, so `proj_default` and everything made offline land here. The
   * share dialog asks for their invitations on every open.
   */
  it('answers an empty list instead of 404', async () => {
    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'list',
      projectId: 'never_shared',
      googleToken: 'ya29',
    })

    expect(sent.code).toBe(200)
    expect((sent.body as { invites: unknown[] }).invites).toEqual([])
  })

  it('still refuses to write to it', async () => {
    signedInAs('owner@example.com', 'Owner')
    for (const body of [
      { action: 'create', email: 'grace@example.com', role: 'editor' },
      { action: 'revoke', inviteId: 'inv_1' },
      { action: 'set-role', inviteId: 'inv_1', role: 'viewer' },
      { action: 'resend', inviteId: 'inv_1' },
    ]) {
      const sent = await call({ projectId: 'never_shared', googleToken: 'ya29', ...body })
      expect(sent.code).toBe(404)
    }
  })
})

describe('list', () => {
  it('shows the project its own invitations, never their tokens', async () => {
    await seedInvite()

    signedInAs('owner@example.com', 'Owner')
    const sent = await call({
      action: 'list',
      projectId: 'proj_1',
      googleToken: 'ya29',
    })
    const invites = (sent.body as { invites: ProjectInvite[] }).invites
    expect(invites).toHaveLength(1)
    expect(invites[0].token).toBeUndefined()
    expect(invites[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

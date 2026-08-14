import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRepositories } from './memory.js'
import { aclFromRows, rowsFromAcl } from './rows.js'
import { resolveClaim } from '../../../src/lib/auth/identity.js'
import type { IdentityClaim } from '../../../src/types/identity.js'
import type { ProjectInvite } from '../../../src/types/collab.js'
import type { RoomAcl } from '../../../src/lib/collab/acl.js'
import { roleOf } from '../../../src/lib/collab/acl.js'

/**
 * The contract every repository implementation has to satisfy (17.1, #84).
 *
 * Run against `MemoryRepositories`, which is a real implementation rather
 * than a mock. The point of the phase is that nothing above these
 * interfaces knows which one it is talking to, and the only honest way to
 * check that is to have two.
 */

let db: MemoryRepositories

beforeEach(() => {
  db = new MemoryRepositories()
})

const googleClaim = (
  email: string,
  sub: string,
  verified = true,
): IdentityClaim => ({
  provider: 'google',
  providerSubject: sub,
  email,
  emailVerified: verified,
  displayName: 'Ada Lovelace',
  avatarUrl: '',
})

/** Sign in through the repository, using the PURE rules unchanged. */
async function signIn(claim: IdentityClaim) {
  const records = await db.identities.recordsForClaim(claim)
  const { resolved } = resolveClaim(records, claim)
  await db.identities.saveResolved(resolved)
  return resolved
}

describe('IdentityRepository — the pure rules, over storage', () => {
  it('creates a user on first sign-in', async () => {
    const resolved = await signIn(googleClaim('ada@example.com', 'g-1'))
    expect(resolved.createdUser).toBe(true)
    expect(await db.identities.user(resolved.user.id)).toMatchObject({
      primaryEmail: 'ada@example.com',
    })
  })

  it('lands on the same user when the same subject signs in again', async () => {
    const first = await signIn(googleClaim('ada@example.com', 'g-1'))
    const second = await signIn(googleClaim('ada@example.com', 'g-1'))
    expect(second.createdUser).toBe(false)
    expect(second.user.id).toBe(first.user.id)
    expect(db.data.users).toHaveLength(1)
    expect(db.data.identities).toHaveLength(1)
  })

  /** The convergence the identity model exists for. */
  it('converges a second provider onto the same user via a verified address', async () => {
    const google = await signIn(googleClaim('ada@example.com', 'g-1'))
    const otp = await signIn({
      provider: 'email',
      providerSubject: 'ada@example.com',
      email: 'ada@example.com',
      emailVerified: true,
      displayName: 'Ada',
      avatarUrl: '',
    })
    expect(otp.user.id).toBe(google.user.id)
    expect(otp.linkedIdentity).toBe(true)
    expect(db.data.users).toHaveLength(1)
    expect(await db.identities.identitiesOf(google.user.id)).toHaveLength(2)
  })

  /** Containment: the rule whose absence would be an authorisation bypass. */
  it('does not let an UNVERIFIED address reach an existing account', async () => {
    const owner = await signIn(googleClaim('owner@company.com', 'g-1'))
    const impostor = await signIn({
      provider: 'email',
      providerSubject: 'owner@company.com',
      email: 'owner@company.com',
      emailVerified: false,
      displayName: 'Not Ada',
      avatarUrl: '',
    })
    expect(impostor.user.id).not.toBe(owner.user.id)
    expect(db.data.users).toHaveLength(2)
  })

  it('resolves an address to its user — the question 16.2 needed a server for', async () => {
    const ada = await signIn(googleClaim('ada@example.com', 'g-1'))
    expect(await db.identities.userByVerifiedEmail('ADA@example.com')).toMatchObject({
      id: ada.user.id,
    })
  })

  it('does not resolve an address only an unverified identity carries', async () => {
    await signIn(googleClaim('ada@example.com', 'g-1', false))
    expect(await db.identities.userByVerifiedEmail('ada@example.com')).toBeNull()
  })

  it('mirrors a profile change onto the user record', async () => {
    const ada = await signIn(googleClaim('ada@example.com', 'g-1'))
    const updated = await db.identities.update(ada.user.id, { displayName: 'A. Lovelace' })
    expect(updated?.displayName).toBe('A. Lovelace')
    expect((await db.identities.user(ada.user.id))?.displayName).toBe('A. Lovelace')
  })

  it('loads only the records a claim can reach, never the whole table', async () => {
    await signIn(googleClaim('ada@example.com', 'g-1'))
    await signIn(googleClaim('grace@example.com', 'g-2'))
    await signIn(googleClaim('alan@example.com', 'g-3'))
    const slice = await db.identities.recordsForClaim(googleClaim('ada@example.com', 'g-1'))
    expect(slice.users).toHaveLength(1)
    expect(slice.identities).toHaveLength(1)
  })
})

describe('MembershipRepository — the ACL, in rows', () => {
  const acl: RoomAcl = {
    ownerEmail: 'ada@example.com',
    admins: ['grace@example.com'],
    editors: ['alan@example.com'],
    commenters: [],
    viewers: [],
    bindings: { 'grace@example.com': 'usr_grace' },
  }

  it('round-trips an ACL through storage', async () => {
    await db.memberships.replaceAcl('p1', acl)
    expect(await db.memberships.aclOf('p1')).toEqual(acl)
  })

  it('answers null for a project with no memberships, not an empty ACL', async () => {
    expect(await db.memberships.aclOf('nope')).toBeNull()
  })

  it('keeps roleOf working unchanged over the stored ACL', async () => {
    await db.memberships.replaceAcl('p1', acl)
    const stored = (await db.memberships.aclOf('p1')) as RoomAcl
    // a bound slot answers to its userId
    expect(roleOf(stored, { email: 'anyone@else.com', userIds: ['usr_grace'] })).toBe(
      'admin',
    )
    // an unbound slot still answers to its address
    expect(roleOf(stored, { email: 'alan@example.com', userIds: [] })).toBe('editor')
    // ...and a bound slot no longer answers to the address alone
    expect(roleOf(stored, { email: 'grace@example.com', userIds: [] })).toBeNull()
  })

  it('grants and revokes a role', async () => {
    await db.memberships.setRole('p1', 'ada@example.com', 'owner')
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')
    expect((await db.memberships.aclOf('p1'))?.editors).toEqual(['grace@example.com'])
    await db.memberships.setRole('p1', 'grace@example.com', null)
    expect((await db.memberships.aclOf('p1'))?.editors).toEqual([])
  })

  it('keeps exactly one owner per project', async () => {
    await db.memberships.setRole('p1', 'ada@example.com', 'owner')
    await db.memberships.setRole('p1', 'grace@example.com', 'owner')
    const stored = await db.memberships.aclOf('p1')
    expect(stored?.ownerEmail).toBe('grace@example.com')
    expect(stored?.admins).toEqual(['ada@example.com'])
  })

  it('binds an unclaimed slot', async () => {
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')
    await db.memberships.bind('p1', 'grace@example.com', 'usr_grace')
    expect((await db.memberships.aclOf('p1'))?.bindings).toEqual({
      'grace@example.com': 'usr_grace',
    })
  })

  /** 16.2's rule: a claimed slot is not handed to whoever holds the address next. */
  it('never re-binds a slot that is already claimed', async () => {
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')
    await db.memberships.bind('p1', 'grace@example.com', 'usr_grace')
    await db.memberships.bind('p1', 'grace@example.com', 'usr_impostor')
    expect((await db.memberships.aclOf('p1'))?.bindings['grace@example.com']).toBe(
      'usr_grace',
    )
  })

  it('lists the projects a person is a member of, by binding and by address', async () => {
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')
    await db.memberships.bind('p1', 'grace@example.com', 'usr_grace')
    await db.memberships.setRole('p2', 'grace@example.com', 'viewer') // unclaimed
    await db.memberships.setRole('p3', 'someone@else.com', 'viewer')

    expect((await db.memberships.projectsOf(['usr_grace'], 'grace@example.com')).sort()).toEqual(
      ['p1', 'p2'],
    )
  })

  it('does not report a bound slot to someone who merely holds the address', async () => {
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')
    await db.memberships.bind('p1', 'grace@example.com', 'usr_grace')
    expect(await db.memberships.projectsOf([], 'grace@example.com')).toEqual([])
  })

  it('drops every membership when a project goes', async () => {
    await db.memberships.replaceAcl('p1', acl)
    await db.memberships.removeProject('p1')
    expect(await db.memberships.aclOf('p1')).toBeNull()
  })
})

describe('InvitationRepository', () => {
  const invite = (over: Partial<ProjectInvite> = {}): ProjectInvite => ({
    id: 'inv_1',
    projectId: 'p1',
    email: 'grace@example.com',
    role: 'editor',
    tokenHash: 'hash_1',
    createdAt: 1_700_000_000_000,
    invitedBy: 'usr_ada',
    invitedByName: 'Ada',
    status: 'pending',
    expiresAt: 1_700_000_000_000 + 14 * 24 * 60 * 60 * 1000,
    updatedAt: 1_700_000_000_000,
    ...over,
  })

  it('stores and reads back an invitation', async () => {
    const created = await db.invitations.create(invite())
    expect(created).toMatchObject({ email: 'grace@example.com', role: 'editor' })
    expect(await db.invitations.byTokenHash('hash_1')).toMatchObject({ id: 'inv_1' })
  })

  it('stores the digest and never a token', async () => {
    // the domain type allows a raw token on a freshly minted copy; the row
    // has nowhere to put it, which is the property 18.1 is after
    await db.invitations.create(invite({ token: 'the-secret-token' }))
    const loaded = await db.invitations.byTokenHash('hash_1')
    expect(loaded?.token).toBeUndefined()
    expect(loaded?.tokenHash).toBe('hash_1')
  })

  it('keeps the deadline through a round trip', async () => {
    const created = await db.invitations.create(invite())
    expect(created.expiresAt).toBe(1_700_000_000_000 + 14 * 24 * 60 * 60 * 1000)
    expect((await db.invitations.byTokenHash('hash_1'))?.expiresAt).toBe(
      created.expiresAt,
    )
  })

  it('records who accepted, not only when', async () => {
    await db.invitations.create(invite())
    const accepted = await db.invitations.patch('inv_1', {
      status: 'accepted',
      acceptedAt: 1_700_000_100_000,
      acceptedBy: 'usr_grace',
    })
    expect(accepted).toMatchObject({ status: 'accepted', acceptedBy: 'usr_grace' })
    expect((await db.invitations.byTokenHash('hash_1'))?.acceptedBy).toBe('usr_grace')
  })

  it('returns a revoked invitation by digest rather than pretending it never existed', async () => {
    await db.invitations.create(invite())
    await db.invitations.patch('inv_1', { status: 'revoked' })
    expect(await db.invitations.byTokenHash('hash_1')).toMatchObject({
      status: 'revoked',
    })
  })

  it('returns the existing pending invitation rather than minting a second', async () => {
    await db.invitations.create(invite())
    const again = await db.invitations.create(invite({ id: 'inv_2', tokenHash: 'hash_2' }))
    expect(again.id).toBe('inv_1')
    expect(await db.invitations.ofProject('p1')).toHaveLength(1)
  })

  it('allows a new invitation once the previous one is no longer pending', async () => {
    await db.invitations.create(invite())
    await db.invitations.patch('inv_1', { status: 'revoked' })
    const second = await db.invitations.create(invite({ id: 'inv_2', tokenHash: 'hash_2' }))
    expect(second.id).toBe('inv_2')
  })

  it('lists what is waiting for an address', async () => {
    await db.invitations.create(invite())
    await db.invitations.create(
      invite({ id: 'inv_2', projectId: 'p2', tokenHash: 'hash_2' }),
    )
    expect(await db.invitations.pendingFor('grace@example.com')).toHaveLength(2)
  })

  it('does not list an accepted invitation as pending', async () => {
    await db.invitations.create(invite())
    await db.invitations.patch('inv_1', { status: 'accepted', acceptedAt: Date.now() })
    expect(await db.invitations.pendingFor('grace@example.com')).toEqual([])
  })

  it('does not list a declined invitation as pending', async () => {
    await db.invitations.create(invite())
    await db.invitations.patch('inv_1', { status: 'declined' })
    expect(await db.invitations.pendingFor('grace@example.com')).toEqual([])
  })

  it('answers null when patching something that is not there', async () => {
    expect(await db.invitations.patch('nope', { status: 'revoked' })).toBeNull()
  })
})

describe('EntitlementRepository', () => {
  it('reports the free plan for an account with no row', async () => {
    expect(await db.entitlements.of('usr_ada')).toMatchObject({
      plan: 'free',
      status: 'active',
    })
  })

  it('stores and reads back a plan', async () => {
    await db.entitlements.put('usr_ada', { plan: 'pro', source: 'manual' })
    expect(await db.entitlements.of('usr_ada')).toMatchObject({
      plan: 'pro',
      source: 'manual',
    })
  })

  it('leaves other accounts alone', async () => {
    await db.entitlements.put('usr_ada', { plan: 'team' })
    expect((await db.entitlements.of('usr_grace')).plan).toBe('free')
  })
})

describe('row mapping', () => {
  it('round-trips an ACL through rows without losing bindings', () => {
    const acl: RoomAcl = {
      ownerEmail: 'ada@example.com',
      admins: [],
      editors: ['grace@example.com'],
      commenters: ['alan@example.com'],
      viewers: [],
      bindings: { 'grace@example.com': 'usr_grace' },
    }
    expect(aclFromRows(rowsFromAcl('p1', acl))).toEqual(acl)
  })

  it('reads no rows as no ACL', () => {
    expect(aclFromRows([])).toBeNull()
  })

  it('reports an ownerless project honestly rather than inventing an owner', () => {
    const rows = rowsFromAcl('p1', {
      ownerEmail: '',
      admins: ['grace@example.com'],
      editors: [],
      commenters: [],
      viewers: [],
      bindings: {},
    })
    expect(aclFromRows(rows)?.ownerEmail).toBe('')
  })
})

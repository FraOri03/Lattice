import type {
  IdentityClaim,
  IdentityRecords,
  ResolvedIdentity,
  User,
  UserIdentity,
} from '../../../src/types/identity.js'
import type { CollabRole, ProjectInvite } from '../../../src/types/collab.js'
import type { Entitlement } from '../../../src/types/entitlement.js'
import { freeEntitlement } from '../../../src/types/entitlement.js'
import type { RoomAcl } from '../../../src/lib/collab/acl.js'
import type {
  EntitlementRepository,
  IdentityRepository,
  InvitationRepository,
  MembershipRepository,
  Repositories,
} from './repositories.js'
import {
  aclFromRows,
  entitlementFromRow,
  entitlementToRow,
  identityFromRow,
  identityToRow,
  inviteFromRow,
  inviteToRow,
  rowsFromAcl,
  toIso,
  userFromRow,
  userToRow,
  type EntitlementRow,
  type IdentityRow,
  type InvitationRow,
  type MembershipRow,
  type UserRow,
} from './rows.js'

/**
 * The repositories, in memory (Phase 17.1, #84).
 *
 * Not a mock. This is a second real implementation of the same four
 * interfaces, and the contract suite in `repositories.test.ts` runs against
 * it and against the Supabase adapter alike — which is the only way the
 * claim "the rest of the code depends on an interface rather than on
 * Supabase" gets checked rather than merely asserted.
 *
 * It stores ROWS and goes through the same mappers as the real adapter, so
 * the translation between epoch milliseconds and `timestamptz` is exercised
 * here too rather than skipped.
 *
 * The database invariants that matter are enforced here as well — one owner
 * per project, one pending invitation per address, a binding that is never
 * re-bound. An invariant only the SQL knows about is one the test suite
 * cannot see.
 */

/** The tables. Public so tests can seed and inspect them directly. */
export class MemoryDatabase {
  users: UserRow[] = []
  identities: IdentityRow[] = []
  memberships: MembershipRow[] = []
  invitations: InvitationRow[] = []
  entitlements: EntitlementRow[] = []

  clear(): void {
    this.users = []
    this.identities = []
    this.memberships = []
    this.invitations = []
    this.entitlements = []
  }
}

export class MemoryRepositories implements Repositories {
  readonly data = new MemoryDatabase()
  readonly identities: IdentityRepository = new MemoryIdentityRepository(this.data)
  readonly memberships: MembershipRepository = new MemoryMembershipRepository(this.data)
  readonly invitations: InvitationRepository = new MemoryInvitationRepository(this.data)
  readonly entitlements: EntitlementRepository = new MemoryEntitlementRepository(this.data)

  clear(): void {
    this.data.clear()
  }
}

/* ---------------- identity ---------------- */

class MemoryIdentityRepository implements IdentityRepository {
  constructor(private db: MemoryDatabase) {}

  async recordsForClaim(claim: IdentityClaim): Promise<IdentityRecords> {
    const email = claim.email.trim().toLowerCase()
    const hits: IdentityRow[] = []

    // step 1 — the ordinary re-sign-in
    if (claim.providerSubject) {
      const bySubject = this.db.identities.find(
        (i) =>
          i.provider === claim.provider && i.provider_subject === claim.providerSubject,
      )
      if (bySubject) hits.push(bySubject)
    }
    if (email) {
      // step 2 — a placeholder of the same provider carrying this address
      const placeholder = this.db.identities.find(
        (i) => i.provider === claim.provider && !i.provider_subject && i.email === email,
      )
      if (placeholder) hits.push(placeholder)
      // step 3 — a verified address already known to somebody
      const verified = this.db.identities.find(
        (i) => i.verified_at !== null && i.email === email,
      )
      if (verified) hits.push(verified)
    }

    const identities = dedupe(hits, (i) => i.id)
    const userIds = new Set(identities.map((i) => i.user_id))
    return {
      users: this.db.users.filter((u) => userIds.has(u.id)).map(userFromRow),
      identities: identities.map(identityFromRow),
    }
  }

  async saveResolved(resolved: ResolvedIdentity): Promise<void> {
    upsert(this.db.users, userToRow(resolved.user), (r) => r.id)
    upsert(this.db.identities, identityToRow(resolved.identity), (r) => r.id)
  }

  async user(id: string): Promise<User | null> {
    const row = this.db.users.find((u) => u.id === id)
    return row ? userFromRow(row) : null
  }

  async identitiesOf(userId: string): Promise<UserIdentity[]> {
    return this.db.identities.filter((i) => i.user_id === userId).map(identityFromRow)
  }

  async userByVerifiedEmail(email: string): Promise<User | null> {
    const clean = email.trim().toLowerCase()
    if (!clean) return null
    const identity = this.db.identities.find(
      (i) => i.verified_at !== null && i.email === clean,
    )
    if (!identity) return null
    return this.user(identity.user_id)
  }

  async update(
    userId: string,
    patch: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'primaryEmail' | 'usageType'>>,
  ): Promise<User | null> {
    const row = this.db.users.find((u) => u.id === userId)
    if (!row) return null
    const next: User = { ...userFromRow(row), ...patch, updatedAt: Date.now() }
    upsert(this.db.users, userToRow(next), (r) => r.id)
    return next
  }
}

/* ---------------- membership ---------------- */

class MemoryMembershipRepository implements MembershipRepository {
  constructor(private db: MemoryDatabase) {}

  private rowsOf(projectId: string): MembershipRow[] {
    return this.db.memberships.filter((r) => r.project_id === projectId)
  }

  async aclOf(projectId: string): Promise<RoomAcl | null> {
    return aclFromRows(this.rowsOf(projectId))
  }

  async replaceAcl(projectId: string, acl: RoomAcl): Promise<void> {
    const kept = this.db.memberships.filter((r) => r.project_id !== projectId)
    this.db.memberships = [...kept, ...rowsFromAcl(projectId, acl)]
  }

  async setRole(projectId: string, email: string, role: CollabRole | null): Promise<void> {
    const clean = email.toLowerCase()
    if (!clean) return
    if (role === null) {
      this.db.memberships = this.db.memberships.filter(
        (r) => !(r.project_id === projectId && r.email === clean),
      )
      return
    }
    // one owner per project, as the partial unique index enforces: the
    // previous owner is demoted rather than the write failing
    if (role === 'owner') {
      for (const row of this.rowsOf(projectId)) {
        if (row.role === 'owner' && row.email !== clean) row.role = 'admin'
      }
    }
    const stamp = toIso(Date.now())
    const existing = this.db.memberships.find(
      (r) => r.project_id === projectId && r.email === clean,
    )
    if (existing) {
      existing.role = role
      existing.updated_at = stamp
      return
    }
    this.db.memberships.push({
      project_id: projectId,
      email: clean,
      role,
      user_id: null,
      invited_by: null,
      created_at: stamp,
      updated_at: stamp,
    })
  }

  async bind(projectId: string, email: string, userId: string): Promise<void> {
    if (!email || !userId) return
    const row = this.db.memberships.find(
      (r) => r.project_id === projectId && r.email === email.toLowerCase(),
    )
    // never re-bind: a claimed slot stays claimed until an admin removes it
    if (!row || row.user_id) return
    row.user_id = userId
    row.updated_at = toIso(Date.now())
  }

  async projectsOf(userIds: string[], email: string): Promise<string[]> {
    const clean = email.toLowerCase()
    const hits = this.db.memberships.filter((r) =>
      r.user_id ? userIds.includes(r.user_id) : !!clean && r.email === clean,
    )
    return dedupe(
      hits.map((r) => r.project_id),
      (id) => id,
    )
  }

  async removeProject(projectId: string): Promise<void> {
    this.db.memberships = this.db.memberships.filter((r) => r.project_id !== projectId)
  }
}

/* ---------------- invitations ---------------- */

class MemoryInvitationRepository implements InvitationRepository {
  constructor(private db: MemoryDatabase) {}

  async create(invite: ProjectInvite): Promise<ProjectInvite> {
    const existing = this.db.invitations.find(
      (r) =>
        r.project_id === invite.projectId &&
        r.email === invite.email.toLowerCase() &&
        r.status === 'pending',
    )
    if (existing) return inviteFromRow(existing)
    const row = inviteToRow(invite)
    this.db.invitations.push(row)
    return inviteFromRow(row)
  }

  async byToken(token: string): Promise<ProjectInvite | null> {
    const row = this.db.invitations.find((r) => r.token === token)
    return row ? inviteFromRow(row) : null
  }

  async ofProject(projectId: string): Promise<ProjectInvite[]> {
    return this.db.invitations
      .filter((r) => r.project_id === projectId)
      .map(inviteFromRow)
  }

  async pendingFor(email: string): Promise<ProjectInvite[]> {
    const clean = email.toLowerCase()
    return this.db.invitations
      .filter((r) => r.email === clean && r.status === 'pending')
      .map(inviteFromRow)
  }

  async patch(id: string, patch: Partial<ProjectInvite>): Promise<ProjectInvite | null> {
    const row = this.db.invitations.find((r) => r.id === id)
    if (!row) return null
    const next: ProjectInvite = { ...inviteFromRow(row), ...patch, updatedAt: Date.now() }
    Object.assign(row, inviteToRow(next))
    return next
  }
}

/* ---------------- entitlements ---------------- */

class MemoryEntitlementRepository implements EntitlementRepository {
  constructor(private db: MemoryDatabase) {}

  async of(userId: string): Promise<Entitlement> {
    const row = this.db.entitlements.find((r) => r.user_id === userId)
    return row ? entitlementFromRow(row) : freeEntitlement(userId)
  }

  async put(
    userId: string,
    patch: Partial<Omit<Entitlement, 'userId' | 'createdAt'>>,
  ): Promise<Entitlement> {
    const current = await this.of(userId)
    const next: Entitlement = { ...current, ...patch, userId, updatedAt: Date.now() }
    upsert(this.db.entitlements, entitlementToRow(next), (r) => r.user_id)
    return next
  }
}

/* ---------------- tiny helpers ---------------- */

function upsert<T>(list: T[], row: T, key: (row: T) => string): void {
  const at = list.findIndex((r) => key(r) === key(row))
  if (at >= 0) list[at] = row
  else list.push(row)
}

function dedupe<T>(list: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of list) {
    const k = key(row)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(row)
  }
  return out
}

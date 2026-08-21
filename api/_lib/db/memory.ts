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
import type { Session } from '../../../src/types/session.js'
import type { OtpCode } from '../../../src/types/otpRecord.js'
import type { MailSend } from '../../../src/types/mail.js'
import type { AiJobClosure, AiJobRecord } from '../../../src/types/aiJob.js'
import type { RoomAcl } from '../../../src/lib/collab/acl.js'
import type {
  AiJobRepository,
  EntitlementRepository,
  IdentityRepository,
  InvitationRepository,
  MailSendRepository,
  MembershipRepository,
  MembershipSlot,
  OtpRepository,
  Repositories,
  SessionRepository,
} from './repositories.js'
import {
  aclFromRows,
  aiJobFromRow,
  aiJobToRow,
  entitlementFromRow,
  entitlementToRow,
  fromIso,
  identityFromRow,
  identityToRow,
  inviteFromRow,
  inviteToRow,
  mailSendToRow,
  rowsFromAcl,
  otpFromRow,
  otpToRow,
  sessionFromRow,
  sessionToRow,
  toIso,
  userFromRow,
  userToRow,
  type AiJobRow,
  type EntitlementRow,
  type IdentityRow,
  type InvitationRow,
  type MailSendRow,
  type MembershipRow,
  type OtpRow,
  type SessionRow,
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
  sessions: SessionRow[] = []
  otp: OtpRow[] = []
  mailSends: MailSendRow[] = []
  aiJobs: AiJobRow[] = []

  clear(): void {
    this.users = []
    this.identities = []
    this.memberships = []
    this.invitations = []
    this.entitlements = []
    this.sessions = []
    this.otp = []
    this.mailSends = []
    this.aiJobs = []
  }
}

export class MemoryRepositories implements Repositories {
  readonly data = new MemoryDatabase()
  readonly identities: IdentityRepository = new MemoryIdentityRepository(this.data)
  readonly memberships: MembershipRepository = new MemoryMembershipRepository(this.data)
  readonly invitations: InvitationRepository = new MemoryInvitationRepository(this.data)
  readonly entitlements: EntitlementRepository = new MemoryEntitlementRepository(this.data)
  readonly sessions: SessionRepository = new MemorySessionRepository(this.data)
  readonly otp: OtpRepository = new MemoryOtpRepository(this.data)
  readonly mailSends: MailSendRepository = new MemoryMailSendRepository(this.data)
  readonly aiJobs: AiJobRepository = new MemoryAiJobRepository(this.data)

  clear(): void {
    this.data.clear()
  }
}

/* ---------------- ai jobs ---------------- */

class MemoryAiJobRepository implements AiJobRepository {
  constructor(private db: MemoryDatabase) {}

  async record(job: AiJobRecord): Promise<void> {
    // The id is RunPod's, so a duplicate means a retry rather than a second
    // job. Replacing keeps the invariant the primary key states in SQL.
    this.db.aiJobs = this.db.aiJobs.filter((r) => r.id !== job.jobId)
    this.db.aiJobs.push(aiJobToRow(job))
  }

  async get(jobId: string): Promise<AiJobRecord | null> {
    const row = this.db.aiJobs.find((r) => r.id === jobId)
    return row ? aiJobFromRow(row) : null
  }

  async close(jobId: string, closure: AiJobClosure): Promise<AiJobRecord | null> {
    const at = this.db.aiJobs.findIndex((r) => r.id === jobId)
    if (at < 0) return null
    const current = aiJobFromRow(this.db.aiJobs[at])
    // One-way, and it is the invariant the SQL enforces too: a webhook and a
    // poll race routinely, and the loser must not overwrite the winner.
    if (current.closedAt !== null) return current
    const closed: AiJobRecord = {
      ...current,
      state: closure.state,
      closedAt: closure.closedAt,
      failureReason: closure.failureReason ?? null,
      executionMs: closure.executionMs ?? current.executionMs,
    }
    this.db.aiJobs[at] = aiJobToRow(closed)
    return closed
  }

  async openFor(subject: string): Promise<AiJobRecord[]> {
    return this.db.aiJobs
      .filter((r) => r.subject === subject && r.closed_at === null)
      .map(aiJobFromRow)
  }
}

/* ---------------- mail sends ---------------- */

class MemoryMailSendRepository implements MailSendRepository {
  constructor(private db: MemoryDatabase) {}

  async record(send: MailSend): Promise<void> {
    this.db.mailSends.push(mailSendToRow(send))
  }

  async countForRecipient(recipient: string, since: number): Promise<number> {
    const clean = recipient.toLowerCase()
    return this.db.mailSends.filter(
      (r) => r.recipient === clean && fromIso(r.created_at) >= since,
    ).length
  }

  async countForScope(scope: string, since: number): Promise<number> {
    if (!scope) return 0
    return this.db.mailSends.filter(
      (r) => r.scope === scope && fromIso(r.created_at) >= since,
    ).length
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

  async slotsOf(userIds: string[], emails: string[]): Promise<MembershipSlot[]> {
    const clean = emails.map((e) => e.toLowerCase()).filter(Boolean)
    return this.db.memberships
      .filter((r) =>
        // a claimed slot answers to its userId and to nothing else — 16.2's
        // rule, and the reason a reassigned address inherits nothing
        r.user_id ? userIds.includes(r.user_id) : clean.includes(r.email),
      )
      .map((r) => ({
        projectId: r.project_id,
        email: r.email,
        role: r.role as CollabRole,
        userId: r.user_id,
      }))
  }

  async ownersOf(projectIds: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (const row of this.db.memberships) {
      if (row.role === 'owner' && projectIds.includes(row.project_id)) {
        out[row.project_id] = row.email
      }
    }
    return out
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

  async byTokenHash(tokenHash: string): Promise<ProjectInvite | null> {
    const row = this.db.invitations.find((r) => r.token_hash === tokenHash)
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

/* ---------------- sessions ---------------- */

class MemorySessionRepository implements SessionRepository {
  constructor(private db: MemoryDatabase) {}

  async create(
    session: Session,
    hashes: { tokenHash: string; csrfHash: string },
  ): Promise<Session> {
    this.db.sessions.push(sessionToRow(session, hashes))
    return session
  }

  /** Live only: revoked and expired are resolved as "no session". */
  async byTokenHash(tokenHash: string, now = Date.now()): Promise<Session | null> {
    const row = this.db.sessions.find((r) => r.token_hash === tokenHash)
    if (!row) return null
    const session = sessionFromRow(row)
    if (session.revokedAt !== null) return null
    if (session.expiresAt <= now) return null
    return session
  }

  async csrfHashOf(sessionId: string): Promise<string | null> {
    return this.db.sessions.find((r) => r.id === sessionId)?.csrf_hash ?? null
  }

  async rotateCsrf(sessionId: string, csrfHash: string): Promise<void> {
    const row = this.db.sessions.find((r) => r.id === sessionId)
    if (row) row.csrf_hash = csrfHash
  }

  async touch(sessionId: string, lastSeenAt: number, expiresAt: number): Promise<void> {
    const row = this.db.sessions.find((r) => r.id === sessionId)
    if (!row) return
    row.last_seen_at = toIso(lastSeenAt)
    row.expires_at = toIso(expiresAt)
  }

  async revoke(sessionId: string, now = Date.now()): Promise<void> {
    const row = this.db.sessions.find((r) => r.id === sessionId)
    if (!row || row.revoked_at) return
    row.revoked_at = toIso(now)
  }

  async revokeAllOf(userId: string, now = Date.now()): Promise<number> {
    let count = 0
    for (const row of this.db.sessions) {
      if (row.user_id !== userId || row.revoked_at) continue
      if (Date.parse(row.expires_at) <= now) continue
      row.revoked_at = toIso(now)
      count += 1
    }
    return count
  }

  async liveOf(userId: string, now = Date.now()): Promise<Session[]> {
    return this.db.sessions
      .filter(
        (r) =>
          r.user_id === userId && !r.revoked_at && Date.parse(r.expires_at) > now,
      )
      .map(sessionFromRow)
      .sort((a, b) => b.createdAt - a.createdAt)
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

/* ---------------- e-mail one-time codes ---------------- */

class MemoryOtpRepository implements OtpRepository {
  constructor(private db: MemoryDatabase) {}

  /** Issuing invalidates every earlier live code, in one operation. */
  async issue(code: OtpCode): Promise<OtpCode> {
    const email = code.email.toLowerCase()
    const stamp = toIso(code.createdAt)
    for (const row of this.db.otp) {
      if (row.email === email && !row.consumed_at) row.consumed_at = stamp
    }
    this.db.otp.push(otpToRow(code))
    return code
  }

  async liveFor(email: string, now = Date.now()): Promise<OtpCode | null> {
    const clean = email.toLowerCase()
    const row = this.db.otp.find(
      (r) => r.email === clean && !r.consumed_at && Date.parse(r.expires_at) > now,
    )
    return row ? otpFromRow(row) : null
  }

  async noteAttempt(id: string): Promise<number> {
    const row = this.db.otp.find((r) => r.id === id)
    if (!row) return 0
    row.attempts += 1
    return row.attempts
  }

  async consume(id: string, now = Date.now()): Promise<void> {
    const row = this.db.otp.find((r) => r.id === id)
    if (!row || row.consumed_at) return
    row.consumed_at = toIso(now)
  }

  async countForEmail(email: string, since: number): Promise<number> {
    const clean = email.toLowerCase()
    return this.db.otp.filter(
      (r) => r.email === clean && Date.parse(r.created_at) >= since,
    ).length
  }

  async countForIp(ip: string, since: number): Promise<number> {
    if (!ip) return 0
    return this.db.otp.filter(
      (r) => r.request_ip === ip && Date.parse(r.created_at) >= since,
    ).length
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

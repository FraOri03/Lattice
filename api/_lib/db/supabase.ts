import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
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
import type { RoomAcl } from '../../../src/lib/collab/acl.js'
import type {
  EntitlementRepository,
  IdentityRepository,
  InvitationRepository,
  MailSendRepository,
  MembershipRepository,
  OtpRepository,
  Repositories,
  SessionRepository,
} from './repositories.js'
import {
  aclFromRows,
  entitlementFromRow,
  entitlementToRow,
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
  type EntitlementRow,
  type IdentityRow,
  type InvitationRow,
  type MembershipRow,
  type OtpRow,
  type SessionRow,
  type UserRow,
} from './rows.js'

/**
 * The Supabase-backed repositories (Phase 17.1, #84).
 *
 * The only module in the codebase that knows Supabase exists, apart from
 * the client factory that builds its connection. Everything above it talks
 * to the interfaces in `repositories.ts`.
 *
 * ## Errors are thrown, never swallowed
 *
 * A failed query is not an empty result. `userByVerifiedEmail` returning
 * null because the database was unreachable would read as "nobody owns
 * this address", which is the difference between an outage and an
 * authorisation bypass. Every call goes through {@link unwrap}, and an
 * endpoint that cannot reach the database fails loudly.
 */

const USERS = 'users'
const IDENTITIES = 'user_identities'
const MEMBERSHIPS = 'project_memberships'
const INVITATIONS = 'project_invitations'
const ENTITLEMENTS = 'entitlements'
const SESSIONS = 'sessions'
const OTP = 'email_otp_codes'
const MAIL_SENDS = 'mail_sends'

/** Postgres unique-violation; the only conflict this layer expects to lose. */
const UNIQUE_VIOLATION = '23505'

interface Result<T> {
  data: T | null
  error: PostgrestError | null
}

function unwrap<T>(result: Result<T>, what: string): T | null {
  if (result.error) {
    throw new Error(`[db] ${what} failed: ${result.error.message}`)
  }
  return result.data
}

export class SupabaseRepositories implements Repositories {
  readonly identities: IdentityRepository
  readonly memberships: MembershipRepository
  readonly invitations: InvitationRepository
  readonly entitlements: EntitlementRepository
  readonly sessions: SessionRepository
  readonly otp: OtpRepository
  readonly mailSends: MailSendRepository

  constructor(client: SupabaseClient) {
    this.identities = new SupabaseIdentityRepository(client)
    this.memberships = new SupabaseMembershipRepository(client)
    this.invitations = new SupabaseInvitationRepository(client)
    this.entitlements = new SupabaseEntitlementRepository(client)
    this.sessions = new SupabaseSessionRepository(client)
    this.otp = new SupabaseOtpRepository(client)
    this.mailSends = new SupabaseMailSendRepository(client)
  }
}

/* ---------------- mail sends ---------------- */

class SupabaseMailSendRepository implements MailSendRepository {
  constructor(private db: SupabaseClient) {}

  async record(send: MailSend): Promise<void> {
    unwrap(
      await this.db.from(MAIL_SENDS).insert(mailSendToRow(send)),
      'record mail send',
    )
  }

  async countForRecipient(recipient: string, since: number): Promise<number> {
    return this.countWhere('recipient', recipient.toLowerCase(), since)
  }

  async countForScope(scope: string, since: number): Promise<number> {
    if (!scope) return 0
    return this.countWhere('scope', scope, since)
  }

  /**
   * `head: true` with an exact count: the rows themselves are never wanted,
   * only how many there are, and shipping an hour of them across the wire to
   * call `.length` on it would be the same answer at a worse price.
   */
  private async countWhere(
    column: 'recipient' | 'scope',
    value: string,
    since: number,
  ): Promise<number> {
    const result = await this.db
      .from(MAIL_SENDS)
      .select('id', { count: 'exact', head: true })
      .eq(column, value)
      .gte('created_at', toIso(since))
    if (result.error) {
      throw new Error(`[db] count mail sends failed: ${result.error.message}`)
    }
    return result.count ?? 0
  }
}

/* ---------------- identity ---------------- */

class SupabaseIdentityRepository implements IdentityRepository {
  constructor(private db: SupabaseClient) {}

  /**
   * Three targeted lookups, one per step of `resolveClaim` that can match,
   * plus the users they point at. Never the whole table: that is every
   * account in the system.
   */
  async recordsForClaim(claim: IdentityClaim): Promise<IdentityRecords> {
    const email = claim.email.trim().toLowerCase()

    // PromiseLike: a PostgREST builder is thenable but not a real Promise
    const lookups: PromiseLike<IdentityRow[]>[] = []
    const rows = (result: Result<IdentityRow[]>): IdentityRow[] =>
      unwrap<IdentityRow[]>(result, 'load identities') ?? []

    // step 1 — the ordinary re-sign-in
    if (claim.providerSubject) {
      lookups.push(
        this.db
          .from(IDENTITIES)
          .select('*')
          .eq('provider', claim.provider)
          .eq('provider_subject', claim.providerSubject)
          .limit(1)
          .then(rows),
      )
    }
    if (email) {
      // step 2 — a placeholder of the same provider carrying this address
      lookups.push(
        this.db
          .from(IDENTITIES)
          .select('*')
          .eq('provider', claim.provider)
          .eq('provider_subject', '')
          .eq('email', email)
          .limit(1)
          .then(rows),
      )
      // step 3 — a verified address already known to somebody
      lookups.push(
        this.db
          .from(IDENTITIES)
          .select('*')
          .eq('email', email)
          .not('verified_at', 'is', null)
          .limit(1)
          .then(rows),
      )
    }

    const identities = dedupe((await Promise.all(lookups)).flat(), (i) => i.id)
    const userIds = dedupe(
      identities.map((i) => i.user_id),
      (id) => id,
    )
    const users = userIds.length
      ? (unwrap<UserRow[]>(
          await this.db.from(USERS).select('*').in('id', userIds),
          'load users for claim',
        ) ?? [])
      : []

    return {
      users: users.map(userFromRow),
      identities: identities.map(identityFromRow),
    }
  }

  /**
   * One user and one identity — every branch of `resolveClaim` changes
   * exactly that much, which is why this contract is an upsert pair rather
   * than a snapshot diff.
   */
  async saveResolved(resolved: ResolvedIdentity): Promise<void> {
    unwrap(
      await this.db.from(USERS).upsert(userToRow(resolved.user), { onConflict: 'id' }),
      'save user',
    )
    unwrap(
      await this.db
        .from(IDENTITIES)
        .upsert(identityToRow(resolved.identity), { onConflict: 'id' }),
      'save identity',
    )
  }

  async user(id: string): Promise<User | null> {
    const row = unwrap<UserRow>(
      await this.db.from(USERS).select('*').eq('id', id).maybeSingle(),
      'load user',
    )
    return row ? userFromRow(row) : null
  }

  async identitiesOf(userId: string): Promise<UserIdentity[]> {
    const rows =
      unwrap<IdentityRow[]>(
        await this.db.from(IDENTITIES).select('*').eq('user_id', userId),
        'load identities of user',
      ) ?? []
    return rows.map(identityFromRow)
  }

  async userByVerifiedEmail(email: string): Promise<User | null> {
    const clean = email.trim().toLowerCase()
    if (!clean) return null
    const identity = unwrap<IdentityRow>(
      await this.db
        .from(IDENTITIES)
        .select('*')
        .eq('email', clean)
        .not('verified_at', 'is', null)
        .limit(1)
        .maybeSingle(),
      'resolve address to user',
    )
    if (!identity) return null
    return this.user(identity.user_id)
  }

  async update(
    userId: string,
    patch: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'primaryEmail' | 'usageType'>>,
  ): Promise<User | null> {
    const current = await this.user(userId)
    if (!current) return null
    const next: User = { ...current, ...patch, updatedAt: Date.now() }
    unwrap(
      await this.db.from(USERS).update(userToRow(next)).eq('id', userId),
      'update user',
    )
    return next
  }
}

/* ---------------- membership ---------------- */

class SupabaseMembershipRepository implements MembershipRepository {
  constructor(private db: SupabaseClient) {}

  async aclOf(projectId: string): Promise<RoomAcl | null> {
    const rows =
      unwrap<MembershipRow[]>(
        await this.db.from(MEMBERSHIPS).select('*').eq('project_id', projectId),
        'load acl',
      ) ?? []
    return aclFromRows(rows)
  }

  /**
   * Delete-then-insert, mirroring how the endpoints replace Liveblocks room
   * metadata today. Last write wins, exactly as it does now — use
   * {@link setRole} or {@link bind} where a concurrent change to a
   * different member must not be lost.
   */
  async replaceAcl(projectId: string, acl: RoomAcl): Promise<void> {
    await this.removeProject(projectId)
    const rows = rowsFromAcl(projectId, acl)
    if (!rows.length) return
    unwrap(await this.db.from(MEMBERSHIPS).insert(rows), 'replace acl')
  }

  async setRole(projectId: string, email: string, role: CollabRole | null): Promise<void> {
    const clean = email.toLowerCase()
    if (!clean) return
    if (role === null) {
      unwrap(
        await this.db
          .from(MEMBERSHIPS)
          .delete()
          .eq('project_id', projectId)
          .eq('email', clean),
        'revoke role',
      )
      return
    }
    // `project_memberships_single_owner` allows exactly one: demote the
    // incumbent first, or the upsert below violates it.
    //
    // NOT atomic across the two statements. Transferring ownership is an
    // owner-only action taken by one person at a time, and the failure mode
    // of a lost race is a project with no owner rather than two — visible,
    // and repairable by the same action.
    if (role === 'owner') {
      unwrap(
        await this.db
          .from(MEMBERSHIPS)
          .update({ role: 'admin', updated_at: toIso(Date.now()) })
          .eq('project_id', projectId)
          .eq('role', 'owner')
          .neq('email', clean),
        'demote previous owner',
      )
    }
    const stamp = toIso(Date.now())
    unwrap(
      await this.db.from(MEMBERSHIPS).upsert(
        {
          project_id: projectId,
          email: clean,
          role,
          created_at: stamp,
          updated_at: stamp,
        },
        { onConflict: 'project_id,email', ignoreDuplicates: false },
      ),
      'set role',
    )
  }

  /**
   * Atomic by construction: `is('user_id', null)` is part of the WHERE
   * clause, so a slot someone else claimed first is simply not matched.
   * The "never re-bind" rule of 16.2 is therefore enforced by the
   * statement rather than by a read-then-write that could race.
   */
  async bind(projectId: string, email: string, userId: string): Promise<void> {
    if (!email || !userId) return
    unwrap(
      await this.db
        .from(MEMBERSHIPS)
        .update({ user_id: userId, updated_at: toIso(Date.now()) })
        .eq('project_id', projectId)
        .eq('email', email.toLowerCase())
        .is('user_id', null),
      'bind membership',
    )
  }

  /**
   * Two queries rather than one `or(...)` filter: the address goes into a
   * PostgREST filter expression as text, and keeping it out of one avoids
   * having to reason about quoting rules for a value a stranger chose.
   */
  async projectsOf(userIds: string[], email: string): Promise<string[]> {
    const clean = email.toLowerCase()
    type ProjectIdRow = { project_id: string }
    const queries: PromiseLike<ProjectIdRow[]>[] = []

    if (userIds.length) {
      queries.push(
        this.db
          .from(MEMBERSHIPS)
          .select('project_id')
          .in('user_id', userIds)
          .then((r) => unwrap<ProjectIdRow[]>(r as Result<ProjectIdRow[]>, 'projects by userId') ?? []),
      )
    }
    if (clean) {
      queries.push(
        this.db
          .from(MEMBERSHIPS)
          .select('project_id')
          .eq('email', clean)
          .is('user_id', null)
          .then((r) => unwrap<ProjectIdRow[]>(r as Result<ProjectIdRow[]>, 'projects by address') ?? []),
      )
    }

    const rows = (await Promise.all(queries)).flat()
    return dedupe(
      rows.map((r) => r.project_id),
      (id) => id,
    )
  }

  async removeProject(projectId: string): Promise<void> {
    unwrap(
      await this.db.from(MEMBERSHIPS).delete().eq('project_id', projectId),
      'remove project memberships',
    )
  }
}

/* ---------------- invitations ---------------- */

class SupabaseInvitationRepository implements InvitationRepository {
  constructor(private db: SupabaseClient) {}

  /**
   * Losing the `project_invitations_single_pending` race is a SUCCESS, not
   * an error: somebody else invited the same address a moment earlier, and
   * the caller wanted an invitation to exist. Re-read theirs and return it.
   */
  async create(invite: ProjectInvite): Promise<ProjectInvite> {
    const existing = await this.pendingOf(invite.projectId, invite.email)
    if (existing) return existing

    const result = await this.db
      .from(INVITATIONS)
      .insert(inviteToRow(invite))
      .select('*')
      .maybeSingle()

    if (result.error?.code === UNIQUE_VIOLATION) {
      const winner = await this.pendingOf(invite.projectId, invite.email)
      if (winner) return winner
    }
    const row = unwrap<InvitationRow>(result, 'create invitation')
    return row ? inviteFromRow(row) : invite
  }

  private async pendingOf(
    projectId: string,
    email: string,
  ): Promise<ProjectInvite | null> {
    const row = unwrap<InvitationRow>(
      await this.db
        .from(INVITATIONS)
        .select('*')
        .eq('project_id', projectId)
        .eq('email', email.toLowerCase())
        .eq('status', 'pending')
        .maybeSingle(),
      'load pending invitation',
    )
    return row ? inviteFromRow(row) : null
  }

  async byTokenHash(tokenHash: string): Promise<ProjectInvite | null> {
    const row = unwrap<InvitationRow>(
      await this.db
        .from(INVITATIONS)
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle(),
      'load invitation by token',
    )
    return row ? inviteFromRow(row) : null
  }

  async ofProject(projectId: string): Promise<ProjectInvite[]> {
    const rows =
      unwrap<InvitationRow[]>(
        await this.db
          .from(INVITATIONS)
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        'load project invitations',
      ) ?? []
    return rows.map(inviteFromRow)
  }

  async pendingFor(email: string): Promise<ProjectInvite[]> {
    const rows =
      unwrap<InvitationRow[]>(
        await this.db
          .from(INVITATIONS)
          .select('*')
          .eq('email', email.toLowerCase())
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        'load pending invitations',
      ) ?? []
    return rows.map(inviteFromRow)
  }

  async patch(id: string, patch: Partial<ProjectInvite>): Promise<ProjectInvite | null> {
    const current = unwrap<InvitationRow>(
      await this.db.from(INVITATIONS).select('*').eq('id', id).maybeSingle(),
      'load invitation',
    )
    if (!current) return null
    const next: ProjectInvite = {
      ...inviteFromRow(current),
      ...patch,
      updatedAt: Date.now(),
    }
    unwrap(
      await this.db.from(INVITATIONS).update(inviteToRow(next)).eq('id', id),
      'patch invitation',
    )
    return next
  }
}

/* ---------------- sessions ---------------- */

class SupabaseSessionRepository implements SessionRepository {
  constructor(private db: SupabaseClient) {}

  async create(
    session: Session,
    hashes: { tokenHash: string; csrfHash: string },
  ): Promise<Session> {
    unwrap(
      await this.db.from(SESSIONS).insert(sessionToRow(session, hashes)),
      'create session',
    )
    return session
  }

  /**
   * "Live" is part of the WHERE clause, not a check the caller is trusted
   * to remember. A revoked or expired session resolves to nothing here, so
   * there is no path where an endpoint gets one and forgets to look.
   */
  async byTokenHash(tokenHash: string, now = Date.now()): Promise<Session | null> {
    const row = unwrap<SessionRow>(
      await this.db
        .from(SESSIONS)
        .select('*')
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .gt('expires_at', toIso(now))
        .maybeSingle(),
      'resolve session',
    )
    return row ? sessionFromRow(row) : null
  }

  async csrfHashOf(sessionId: string): Promise<string | null> {
    const row = unwrap<{ csrf_hash: string }>(
      await this.db
        .from(SESSIONS)
        .select('csrf_hash')
        .eq('id', sessionId)
        .maybeSingle(),
      'load csrf hash',
    )
    return row?.csrf_hash ?? null
  }

  async rotateCsrf(sessionId: string, csrfHash: string): Promise<void> {
    unwrap(
      await this.db.from(SESSIONS).update({ csrf_hash: csrfHash }).eq('id', sessionId),
      'rotate csrf',
    )
  }

  async touch(sessionId: string, lastSeenAt: number, expiresAt: number): Promise<void> {
    unwrap(
      await this.db
        .from(SESSIONS)
        .update({ last_seen_at: toIso(lastSeenAt), expires_at: toIso(expiresAt) })
        .eq('id', sessionId),
      'touch session',
    )
  }

  /** `is('revoked_at', null)` keeps the first revocation's timestamp. */
  async revoke(sessionId: string, now = Date.now()): Promise<void> {
    unwrap(
      await this.db
        .from(SESSIONS)
        .update({ revoked_at: toIso(now) })
        .eq('id', sessionId)
        .is('revoked_at', null),
      'revoke session',
    )
  }

  async revokeAllOf(userId: string, now = Date.now()): Promise<number> {
    const stamp = toIso(now)
    const rows =
      unwrap<{ id: string }[]>(
        await this.db
          .from(SESSIONS)
          .update({ revoked_at: stamp })
          .eq('user_id', userId)
          .is('revoked_at', null)
          .gt('expires_at', stamp)
          .select('id'),
        'revoke all sessions',
      ) ?? []
    return rows.length
  }

  async liveOf(userId: string, now = Date.now()): Promise<Session[]> {
    const rows =
      unwrap<SessionRow[]>(
        await this.db
          .from(SESSIONS)
          .select('*')
          .eq('user_id', userId)
          .is('revoked_at', null)
          .gt('expires_at', toIso(now))
          .order('created_at', { ascending: false }),
        'list sessions',
      ) ?? []
    return rows.map(sessionFromRow)
  }
}

/* ---------------- entitlements ---------------- */

class SupabaseEntitlementRepository implements EntitlementRepository {
  constructor(private db: SupabaseClient) {}

  async of(userId: string): Promise<Entitlement> {
    const row = unwrap<EntitlementRow>(
      await this.db.from(ENTITLEMENTS).select('*').eq('user_id', userId).maybeSingle(),
      'load entitlement',
    )
    // a missing row is the free plan, not an error: reading an entitlement
    // must never lock someone out of a workspace that worked before
    return row ? entitlementFromRow(row) : freeEntitlement(userId)
  }

  async put(
    userId: string,
    patch: Partial<Omit<Entitlement, 'userId' | 'createdAt'>>,
  ): Promise<Entitlement> {
    const current = await this.of(userId)
    const next: Entitlement = { ...current, ...patch, userId, updatedAt: Date.now() }
    unwrap(
      await this.db
        .from(ENTITLEMENTS)
        .upsert(entitlementToRow(next), { onConflict: 'user_id' }),
      'save entitlement',
    )
    return next
  }
}

/* ---------------- e-mail one-time codes ---------------- */

class SupabaseOtpRepository implements OtpRepository {
  constructor(private db: SupabaseClient) {}

  /**
   * Invalidate, then insert. "Previous codes invalidated" is a requirement,
   * so it is not left to the caller to remember — and the order matters: a
   * failure between the two leaves nobody able to sign in, which is far
   * better than leaving two codes live.
   */
  async issue(code: OtpCode): Promise<OtpCode> {
    const email = code.email.toLowerCase()
    unwrap(
      await this.db
        .from(OTP)
        .update({ consumed_at: toIso(code.createdAt) })
        .eq('email', email)
        .is('consumed_at', null),
      'invalidate previous codes',
    )
    unwrap(await this.db.from(OTP).insert(otpToRow(code)), 'issue code')
    return code
  }

  async liveFor(email: string, now = Date.now()): Promise<OtpCode | null> {
    const row = unwrap<OtpRow>(
      await this.db
        .from(OTP)
        .select('*')
        .eq('email', email.toLowerCase())
        .is('consumed_at', null)
        .gt('expires_at', toIso(now))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      'load live code',
    )
    return row ? otpFromRow(row) : null
  }

  async noteAttempt(id: string): Promise<number> {
    const current = unwrap<{ attempts: number }>(
      await this.db.from(OTP).select('attempts').eq('id', id).maybeSingle(),
      'load attempts',
    )
    if (!current) return 0
    const attempts = current.attempts + 1
    unwrap(await this.db.from(OTP).update({ attempts }).eq('id', id), 'record attempt')
    return attempts
  }

  async consume(id: string, now = Date.now()): Promise<void> {
    unwrap(
      await this.db
        .from(OTP)
        .update({ consumed_at: toIso(now) })
        .eq('id', id)
        .is('consumed_at', null),
      'consume code',
    )
  }

  async countForEmail(email: string, since: number): Promise<number> {
    return this.countWhere('email', email.toLowerCase(), since)
  }

  async countForIp(ip: string, since: number): Promise<number> {
    if (!ip) return 0
    return this.countWhere('request_ip', ip, since)
  }

  /** HEAD + exact count: the rows themselves are never needed here. */
  private async countWhere(
    column: string,
    value: string,
    since: number,
  ): Promise<number> {
    const result = await this.db
      .from(OTP)
      .select('id', { count: 'exact', head: true })
      .eq(column, value)
      .gte('created_at', toIso(since))
    if (result.error) {
      throw new Error(`[db] count codes failed: ${result.error.message}`)
    }
    return result.count ?? 0
  }
}

/* ---------------- helpers ---------------- */

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

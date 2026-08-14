import type { User, UserIdentity, IdentityProvider } from '../../../src/types/identity.js'
import type { CollabRole, InviteStatus, ProjectInvite } from '../../../src/types/collab.js'
import type {
  Entitlement,
  EntitlementPlan,
  EntitlementStatus,
} from '../../../src/types/entitlement.js'
import type { RoomAcl } from '../../../src/lib/collab/acl.js'
import type { UsageType } from '../../../src/types/model.js'
import type { Session } from '../../../src/types/session.js'
import type { OtpCode } from '../../../src/types/otpRecord.js'
import type { MailKind, MailSend } from '../../../src/types/mail.js'

/**
 * The shape the database actually stores, and the translation to and from
 * the domain types (Phase 17.1, #84).
 *
 * Two differences are deliberate and live only here, so no caller has to
 * know about either:
 *
 *  - **Time.** The domain counts epoch milliseconds, because the pure
 *    rules in `identity.ts` do arithmetic on them and are shared with the
 *    browser. Postgres stores `timestamptz`, because a database that
 *    cannot be queried by date is a database nobody can operate.
 *  - **Case.** `snake_case` columns, `camelCase` fields.
 */

/* ---------------- time ---------------- */

export const toIso = (ms: number): string => new Date(ms).toISOString()

export const fromIso = (value: string): number => Date.parse(value)

const toIsoOrNull = (ms: number | null | undefined): string | null =>
  typeof ms === 'number' ? toIso(ms) : null

const fromIsoOrNull = (value: string | null): number | null =>
  value ? Date.parse(value) : null

/* ---------------- users ---------------- */

export interface UserRow {
  id: string
  primary_email: string
  display_name: string
  avatar_url: string
  usage_type: string | null
  created_at: string
  updated_at: string
}

export function userFromRow(row: UserRow): User {
  const user: User = {
    id: row.id,
    primaryEmail: row.primary_email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  }
  // optional in the domain type: present only when 14.2 collected it
  if (row.usage_type) user.usageType = row.usage_type as UsageType
  return user
}

export function userToRow(user: User): UserRow {
  return {
    id: user.id,
    primary_email: user.primaryEmail.toLowerCase(),
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    usage_type: user.usageType ?? null,
    created_at: toIso(user.createdAt),
    updated_at: toIso(user.updatedAt),
  }
}

/* ---------------- identities ---------------- */

export interface IdentityRow {
  id: string
  user_id: string
  provider: string
  provider_subject: string
  email: string
  verified_at: string | null
}

export function identityFromRow(row: IdentityRow): UserIdentity {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider as IdentityProvider,
    providerSubject: row.provider_subject,
    email: row.email,
    verifiedAt: fromIsoOrNull(row.verified_at),
  }
}

export function identityToRow(identity: UserIdentity): IdentityRow {
  return {
    id: identity.id,
    user_id: identity.userId,
    provider: identity.provider,
    provider_subject: identity.providerSubject,
    email: identity.email.toLowerCase(),
    verified_at: toIsoOrNull(identity.verifiedAt),
  }
}

/* ---------------- memberships ---------------- */

/**
 * One ACL slot, as a row: the address it was opened with, the role it
 * carries, and the userId that has claimed it (null = unclaimed, which is
 * what an open invitation looks like).
 */
export interface MembershipRow {
  project_id: string
  email: string
  role: string
  user_id: string | null
  invited_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Rebuild the `RoomAcl` the endpoints already read.
 *
 * Returns null for a project with no rows at all, matching `loadAcl`'s
 * "no room yet" answer — an empty ACL and a missing one mean different
 * things, and only the second is "this project does not exist here".
 *
 * A project whose rows contain no owner is still an ACL: `ownerEmail` is
 * '' and `roleOf` simply matches nobody to that slot. Inventing an owner
 * would be worse than reporting the truth.
 */
export function aclFromRows(rows: MembershipRow[]): RoomAcl | null {
  if (!rows.length) return null
  const acl: RoomAcl = {
    ownerEmail: '',
    admins: [],
    editors: [],
    commenters: [],
    viewers: [],
    bindings: {},
  }
  for (const row of rows) {
    const email = row.email
    switch (row.role as CollabRole) {
      case 'owner':
        acl.ownerEmail = email
        break
      case 'admin':
        acl.admins.push(email)
        break
      case 'editor':
        acl.editors.push(email)
        break
      case 'commenter':
        acl.commenters.push(email)
        break
      case 'viewer':
        acl.viewers.push(email)
        break
    }
    if (row.user_id) acl.bindings[email] = row.user_id
  }
  return acl
}

/** The inverse: one row per slot the ACL names. */
export function rowsFromAcl(
  projectId: string,
  acl: RoomAcl,
  now = Date.now(),
): MembershipRow[] {
  const stamp = toIso(now)
  const rows: MembershipRow[] = []
  const push = (email: string, role: CollabRole) => {
    if (!email) return
    rows.push({
      project_id: projectId,
      email: email.toLowerCase(),
      role,
      user_id: acl.bindings[email] ?? null,
      invited_by: null,
      created_at: stamp,
      updated_at: stamp,
    })
  }
  push(acl.ownerEmail, 'owner')
  for (const email of acl.admins) push(email, 'admin')
  for (const email of acl.editors) push(email, 'editor')
  for (const email of acl.commenters) push(email, 'commenter')
  for (const email of acl.viewers) push(email, 'viewer')
  return rows
}

/* ---------------- invitations ---------------- */

/**
 * `token_hash` gets the same treatment as `session.token_hash`: the digest
 * is stored, the value never is. {@link ProjectInvite.token} exists in the
 * domain only on the copy that was just minted, and there is deliberately
 * no column it could be written to.
 */
export interface InvitationRow {
  id: string
  project_id: string
  email: string
  role: string
  token_hash: string
  status: string
  invited_by: string | null
  invited_by_name: string
  created_at: string
  updated_at: string
  resent_at: string | null
  accepted_at: string | null
  accepted_by: string | null
  expires_at: string
}

export function inviteFromRow(row: InvitationRow): ProjectInvite {
  const invite: ProjectInvite = {
    id: row.id,
    projectId: row.project_id,
    email: row.email,
    role: row.role as CollabRole,
    tokenHash: row.token_hash,
    createdAt: fromIso(row.created_at),
    invitedBy: row.invited_by ?? '',
    invitedByName: row.invited_by_name,
    status: row.status as InviteStatus,
    expiresAt: fromIso(row.expires_at),
    updatedAt: fromIso(row.updated_at),
  }
  const resentAt = fromIsoOrNull(row.resent_at)
  if (resentAt !== null) invite.resentAt = resentAt
  const acceptedAt = fromIsoOrNull(row.accepted_at)
  if (acceptedAt !== null) invite.acceptedAt = acceptedAt
  if (row.accepted_by) invite.acceptedBy = row.accepted_by
  return invite
}

export function inviteToRow(invite: ProjectInvite): InvitationRow {
  return {
    id: invite.id,
    project_id: invite.projectId,
    email: invite.email.toLowerCase(),
    role: invite.role,
    token_hash: invite.tokenHash,
    status: invite.status,
    invited_by: invite.invitedBy || null,
    invited_by_name: invite.invitedByName,
    created_at: toIso(invite.createdAt),
    updated_at: toIso(invite.updatedAt),
    resent_at: toIsoOrNull(invite.resentAt),
    accepted_at: toIsoOrNull(invite.acceptedAt),
    accepted_by: invite.acceptedBy ?? null,
    expires_at: toIso(invite.expiresAt),
  }
}

/* ---------------- sessions ---------------- */

/**
 * `token_hash` and `csrf_hash` have no domain counterpart on purpose: they
 * never leave this layer, and a {@link Session} that carried them could be
 * returned to a browser by accident.
 */
export interface SessionRow {
  id: string
  user_id: string
  token_hash: string
  csrf_hash: string
  provider: string
  provider_subject: string
  email: string
  display_name: string
  avatar_url: string
  created_at: string
  last_seen_at: string
  expires_at: string
  revoked_at: string | null
  user_agent: string
}

export function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider as IdentityProvider,
    providerSubject: row.provider_subject,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: fromIso(row.created_at),
    lastSeenAt: fromIso(row.last_seen_at),
    expiresAt: fromIso(row.expires_at),
    revokedAt: fromIsoOrNull(row.revoked_at),
    userAgent: row.user_agent,
  }
}

export function sessionToRow(
  session: Session,
  hashes: { tokenHash: string; csrfHash: string },
): SessionRow {
  return {
    id: session.id,
    user_id: session.userId,
    token_hash: hashes.tokenHash,
    csrf_hash: hashes.csrfHash,
    provider: session.provider,
    provider_subject: session.providerSubject,
    email: session.email.toLowerCase(),
    display_name: session.displayName,
    avatar_url: session.avatarUrl,
    created_at: toIso(session.createdAt),
    last_seen_at: toIso(session.lastSeenAt),
    expires_at: toIso(session.expiresAt),
    revoked_at: toIsoOrNull(session.revokedAt),
    user_agent: session.userAgent,
  }
}

/* ---------------- e-mail one-time codes ---------------- */

export interface OtpRow {
  id: string
  email: string
  code_hash: string
  created_at: string
  expires_at: string
  consumed_at: string | null
  attempts: number
  request_ip: string
}

export function otpFromRow(row: OtpRow): OtpCode {
  return {
    id: row.id,
    email: row.email,
    codeHash: row.code_hash,
    createdAt: fromIso(row.created_at),
    expiresAt: fromIso(row.expires_at),
    consumedAt: fromIsoOrNull(row.consumed_at),
    attempts: row.attempts,
    requestIp: row.request_ip,
  }
}

export function otpToRow(code: OtpCode): OtpRow {
  return {
    id: code.id,
    email: code.email.toLowerCase(),
    code_hash: code.codeHash,
    created_at: toIso(code.createdAt),
    expires_at: toIso(code.expiresAt),
    consumed_at: toIsoOrNull(code.consumedAt),
    attempts: code.attempts,
    request_ip: code.requestIp,
  }
}

/* ---------------- mail sends ---------------- */

export interface MailSendRow {
  id: string
  kind: string
  recipient: string
  scope: string
  created_at: string
}

export function mailSendFromRow(row: MailSendRow): MailSend {
  return {
    id: row.id,
    kind: row.kind as MailKind,
    recipient: row.recipient,
    scope: row.scope,
    createdAt: fromIso(row.created_at),
  }
}

export function mailSendToRow(send: MailSend): MailSendRow {
  return {
    id: send.id,
    kind: send.kind,
    recipient: send.recipient.toLowerCase(),
    scope: send.scope,
    created_at: toIso(send.createdAt),
  }
}

/* ---------------- entitlements ---------------- */

export interface EntitlementRow {
  user_id: string
  plan: string
  status: string
  source: string
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export function entitlementFromRow(row: EntitlementRow): Entitlement {
  return {
    userId: row.user_id,
    plan: row.plan as EntitlementPlan,
    status: row.status as EntitlementStatus,
    source: row.source,
    currentPeriodEnd: fromIsoOrNull(row.current_period_end),
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  }
}

export function entitlementToRow(entitlement: Entitlement): EntitlementRow {
  return {
    user_id: entitlement.userId,
    plan: entitlement.plan,
    status: entitlement.status,
    source: entitlement.source,
    current_period_end: toIsoOrNull(entitlement.currentPeriodEnd),
    created_at: toIso(entitlement.createdAt),
    updated_at: toIso(entitlement.updatedAt),
  }
}

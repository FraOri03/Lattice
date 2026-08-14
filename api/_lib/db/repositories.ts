import type {
  IdentityClaim,
  IdentityRecords,
  ResolvedIdentity,
  User,
  UserIdentity,
} from '../../../src/types/identity.js'
import type { CollabRole, ProjectInvite } from '../../../src/types/collab.js'
import type { Entitlement } from '../../../src/types/entitlement.js'
import type { Session } from '../../../src/types/session.js'
import type { OtpCode } from '../../../src/types/otpRecord.js'
import type { MailSend } from '../../../src/types/mail.js'
import type { RoomAcl } from '../../../src/lib/collab/acl.js'

/**
 * The repository interfaces (Phase 17.1, #84).
 *
 * This file is the point of the phase. Everything above it — endpoints,
 * and the pure rule modules they share with the browser — depends on these
 * four interfaces and never on Supabase: `supabase.ts` is one
 * implementation and `memory.ts` is another, and the contract test suite
 * runs against both. Swapping the database, or running a test offline,
 * touches nothing that decides who may do what.
 *
 * Server-side only, by construction. The browser never holds a Supabase
 * credential (docs/authorisation-phase-16-3.md), so nothing under `src/`
 * may import this module — it lives in `api/_lib` for the same reason
 * `realtime.ts` does.
 */

/* ---------------- identity ---------------- */

/**
 * Identity storage, shaped so the PURE rules in `src/lib/auth/identity.ts`
 * can run against Postgres unchanged.
 *
 * That is why {@link IdentityRepository.recordsForClaim} exists rather than
 * a `resolve(claim)` that would re-implement the rules in SQL. The rules
 * are a function of `(records, claim)`, and the only records a given claim
 * can possibly touch are the handful this method loads — so `resolveClaim`
 * keeps running verbatim, and the convergence and containment tests that
 * guard it keep testing the code that actually runs.
 */
export interface IdentityRepository {
  /**
   * The slice of records `resolveClaim` can reach for this claim: the
   * identity matching its subject, any placeholder of the same provider
   * carrying its address, any verified identity for that address, and the
   * users those identities belong to.
   *
   * Loading the whole table would be the naive alternative and is not an
   * option — this is every user in the system.
   */
  recordsForClaim(claim: IdentityClaim): Promise<IdentityRecords>

  /**
   * Persist what `resolveClaim` decided.
   *
   * One user and one identity is always enough: every branch of
   * `resolveClaim` creates or patches exactly one of each, which is what
   * makes this contract narrow rather than a full snapshot diff.
   */
  saveResolved(resolved: ResolvedIdentity): Promise<void>

  user(id: string): Promise<User | null>

  identitiesOf(userId: string): Promise<UserIdentity[]>

  /**
   * Which user holds this address — the question 16.2 was waiting for a
   * server to be able to answer for *somebody other than yourself*, and
   * what turns an invited address into a binding.
   *
   * Only VERIFIED identities are consulted. An unverified claim on an
   * address must not be able to resolve to the account that owns it.
   */
  userByVerifiedEmail(email: string): Promise<User | null>

  update(
    userId: string,
    patch: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'primaryEmail' | 'usageType'>>,
  ): Promise<User | null>
}

/* ---------------- membership ---------------- */

/** One ACL slot as the shared-projects index reads it (Phase 18.4, #91). */
export interface MembershipSlot {
  projectId: string
  /** The address the slot was opened with. */
  email: string
  role: CollabRole
  /** The userId that claimed it, or null while nobody has. */
  userId: string | null
}

/**
 * The project ACL, in the storage the 16.3 decision picked for it.
 *
 * {@link MembershipRepository.aclOf} returns the same `RoomAcl` that
 * `loadAcl` reads out of Liveblocks metadata today, which is the promise
 * 16.3 made: "same signature, reads Postgres instead". The role matrix,
 * `roleOf`, `addEmail` and `stripEmail` are untouched by this phase.
 */
export interface MembershipRepository {
  /** Null when the project has no memberships at all — never an empty ACL. */
  aclOf(projectId: string): Promise<RoomAcl | null>

  /**
   * Write an ACL back wholesale, mirroring how the endpoints mutate it
   * today: load, transform with a pure function, store.
   *
   * Last write wins, exactly as the Liveblocks metadata does now. The
   * targeted methods below exist for the paths where that is not good
   * enough — {@link setRole} and {@link bind} touch one row and cannot lose
   * a concurrent change to another member.
   */
  replaceAcl(projectId: string, acl: RoomAcl): Promise<void>

  /** Grant, change or (with `null`) revoke one address's role. */
  setRole(projectId: string, email: string, role: CollabRole | null): Promise<void>

  /**
   * Bind an address to the userId that just proved it.
   *
   * Idempotent and never re-binding: a slot already claimed stays claimed
   * until an admin removes it. Re-binding on sight would hand the
   * membership to whoever holds the address today, which is the behaviour
   * 16.2 exists to remove.
   */
  bind(projectId: string, email: string, userId: string): Promise<void>

  /**
   * Every slot this person holds — by binding, or by an address nobody has
   * claimed yet.
   *
   * This is what "Shared with me" needs and what no store can answer: a
   * browser only ever sees its own memberships.
   *
   * Several addresses, not one, because 16.1 lets an account hold more than
   * one verified identity and a project shared with either of them is
   * shared with the same person. The role travels with the row rather than
   * being fetched per project afterwards: the dashboard needs it for every
   * entry, and one query that already knows it beats N that ask again.
   */
  slotsOf(userIds: string[], emails: string[]): Promise<MembershipSlot[]>

  /**
   * Who owns each of these projects, keyed by projectId.
   *
   * "Shared with me" groups by the person on the other side, and the owner
   * is the only slot that identifies them. One query for the whole page,
   * rather than an ACL load per row.
   */
  ownersOf(projectIds: string[]): Promise<Record<string, string>>

  /** Drop every membership of a project — the project itself is gone. */
  removeProject(projectId: string): Promise<void>
}

/* ---------------- invitations ---------------- */

export interface InvitationRepository {
  /**
   * Returns the EXISTING pending invitation when one already covers this
   * address, rather than minting a second — the behaviour `InviteService`
   * already implements, made a database invariant so two concurrent
   * invites cannot both land.
   */
  create(invite: ProjectInvite): Promise<ProjectInvite>

  /**
   * The invitation a link presents, found by the DIGEST of its token
   * (Phase 18.1).
   *
   * The raw token never reaches this layer, which is what makes "the
   * database holds no usable invitation credential" a property of the
   * types rather than a habit — the same arrangement sessions and one-time
   * codes already have.
   *
   * Every status is returned, not only `pending`: a caller that asks about
   * a revoked invitation needs to be told it was revoked, and answering
   * `null` would make an expired link and a forged one indistinguishable to
   * the person holding a real one.
   */
  byTokenHash(tokenHash: string): Promise<ProjectInvite | null>

  ofProject(projectId: string): Promise<ProjectInvite[]>

  /** Invitations waiting for an address — pending invites on the dashboard. */
  pendingFor(email: string): Promise<ProjectInvite[]>

  patch(id: string, patch: Partial<ProjectInvite>): Promise<ProjectInvite | null>
}

/* ---------------- sessions ---------------- */

/**
 * Session storage (Phase 17.2, #85).
 *
 * The repository only ever sees HASHES. Minting the token, hashing it and
 * comparing it are `api/_lib/session.ts`'s job; keeping the raw token out
 * of this interface is what makes "the database never holds a usable
 * credential" a property of the types rather than a habit.
 */
export interface SessionRepository {
  /**
   * Store a new session. `tokenHash` and `csrfHash` are SHA-256 digests;
   * the values they came from are never passed here.
   */
  create(
    session: Session,
    hashes: { tokenHash: string; csrfHash: string },
  ): Promise<Session>

  /**
   * Resolve a token hash to a LIVE session — never a revoked or expired
   * one. Returning an expired session and leaving the check to the caller
   * would put the most important condition in the least reliable place.
   */
  byTokenHash(tokenHash: string, now?: number): Promise<Session | null>

  /** Whether this CSRF token belongs to this session. Constant-time upstream. */
  csrfHashOf(sessionId: string): Promise<string | null>

  /**
   * Replace the CSRF token bound to a session.
   *
   * Called on every "who am I", so a token that did leak is valid for one
   * page load rather than for the month the session lives.
   */
  rotateCsrf(sessionId: string, csrfHash: string): Promise<void>

  /** Slide the expiry of a session that is still being used. */
  touch(sessionId: string, lastSeenAt: number, expiresAt: number): Promise<void>

  /** Sign out this device. Idempotent. */
  revoke(sessionId: string, now?: number): Promise<void>

  /**
   * Sign out everywhere. Returns how many sessions were live, so the UI can
   * say what actually happened rather than guess.
   */
  revokeAllOf(userId: string, now?: number): Promise<number>

  /** Live sessions of a user, newest first — the "where am I signed in" list. */
  liveOf(userId: string, now?: number): Promise<Session[]>
}

/* ---------------- entitlements ---------------- */

/**
 * Account-level plan. Phase 27 owns what the values mean; 17.1 owns only
 * the seam. See `src/types/entitlement.ts`.
 */
export interface EntitlementRepository {
  /** Never null: an account with no row is on the free plan. */
  of(userId: string): Promise<Entitlement>

  put(
    userId: string,
    patch: Partial<Omit<Entitlement, 'userId' | 'createdAt'>>,
  ): Promise<Entitlement>
}

/* ---------------- e-mail one-time codes ---------------- */

/**
 * One-time code storage (Phase 17.3, #86).
 *
 * As with sessions, the repository only ever sees a HASH. Minting the code
 * and hashing it belong to `api/_lib/otp.ts`; keeping the digits out of
 * this interface is what makes "the database never holds a usable code" a
 * property of the types.
 */
export interface OtpRepository {
  /**
   * Store a new code, after invalidating every earlier live one for the
   * same address.
   *
   * The two are one operation on purpose: "previous codes invalidated" is
   * a requirement, and a caller that could forget the first half would
   * leave several codes valid at once.
   */
  issue(code: OtpCode): Promise<OtpCode>

  /** The one live, unconsumed code for an address; null when there is none. */
  liveFor(email: string, now?: number): Promise<OtpCode | null>

  /** Record a wrong guess. Returns the new count. */
  noteAttempt(id: string): Promise<number>

  /** Burn a code — accepted, superseded, or out of attempts. */
  consume(id: string, now?: number): Promise<void>

  /** How many codes this address asked for since `since`. */
  countForEmail(email: string, since: number): Promise<number>

  /** How many codes this source asked for since `since`. */
  countForIp(ip: string, since: number): Promise<number>
}

/* ---------------- mail sends ---------------- */

/**
 * The evidence rate limiting is decided on (Phase 18.2, #89).
 *
 * One row per message attempted, because that is the thing being limited.
 * `project_invitations` cannot answer this: one row covers an invitation for
 * its whole life, so a sender who resends fifty times produces one row and
 * fifty e-mails.
 */
export interface MailSendRepository {
  /** Record an attempt. Called whether or not the provider then accepts it. */
  record(send: MailSend): Promise<void>

  /** Messages to this address since `since` — the per-recipient ceiling. */
  countForRecipient(recipient: string, since: number): Promise<number>

  /** Messages from this project since `since` — the per-project ceiling. */
  countForScope(scope: string, since: number): Promise<number>
}

/* ---------------- the set of them ---------------- */

export interface Repositories {
  identities: IdentityRepository
  memberships: MembershipRepository
  invitations: InvitationRepository
  entitlements: EntitlementRepository
  sessions: SessionRepository
  otp: OtpRepository
  mailSends: MailSendRepository
}

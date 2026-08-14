import { nid } from '@/lib/id'
import type { Account, AuthProviderId } from '@/types/model'
import type {
  IdentityClaim,
  IdentityRecords,
  ResolvedIdentity,
  User,
  UserIdentity,
} from '@/types/identity'

/**
 * Identity rules (Phase 16.1) — pure, because the two things that must not
 * be got wrong are exactly the two that are hard to test in a browser:
 *
 *  - **convergence**: signing in a second way must land on the account you
 *    already have, not create a twin;
 *  - **containment**: an *unverified* address must never reach an existing
 *    account, or "sign in with e-mail as owner@company.com" would be a
 *    complete authorisation bypass.
 *
 * Everything here is a function of (records, claim). The store in
 * `identityStore.ts` only decides where the records live, which is what
 * lets Phase 17 swap localStorage for Supabase without touching a rule.
 */

/* ---------------- ids ---------------- */

/** FNV-1a, base36. Small, dependency-free, and stable across devices. */
function hash36(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).padStart(7, '0')
}

/**
 * The id of a brand-new user, seeded once from the identity that created
 * it and never re-derived afterwards.
 *
 * The seed is deliberate. With no server to ask, a random id would be a
 * regression on a workspace people already open from several machines:
 * device B has an empty local store, so the same person would mint a
 * second id and appear as a second author on every comment they had
 * already written. Seeding from the provider subject keeps one person to
 * one id across devices, while the id itself stays opaque and immutable —
 * linking or dropping a provider never changes it, which is the property
 * 16.2 needs to key ACLs on. Phase 17 replaces the seed with a
 * server-issued id; the seeding happens exactly once per user, so users
 * created before then keep working unchanged.
 */
export function newUserId(claim: Pick<IdentityClaim, 'provider' | 'providerSubject' | 'email'>): string {
  const seed = claim.providerSubject || claim.email
  return seed ? `usr_${hash36(`${claim.provider}:${seed}`)}` : nid('usr')
}

/* ---------------- lookups ---------------- */

const sameEmail = (a: string, b: string): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase()

export function identitiesOf(
  records: IdentityRecords,
  userId: string,
): UserIdentity[] {
  return records.identities.filter((i) => i.userId === userId)
}

export function userById(records: IdentityRecords, id: string): User | null {
  return records.users.find((u) => u.id === id) ?? null
}

/** Sign-in methods to show for a user, in the shape the account UI reads. */
export function providerIdsOf(identities: UserIdentity[]): AuthProviderId[] {
  const seen: AuthProviderId[] = []
  for (const identity of identities) {
    const id = identity.provider as AuthProviderId
    if (!seen.includes(id)) seen.push(id)
  }
  return seen
}

/* ---------------- resolution ---------------- */

/**
 * Resolve a completed sign-in against the stored records, in four steps
 * that are tried in this order and stop at the first that matches.
 *
 *  1. the same provider subject — the ordinary re-sign-in;
 *  2. a *placeholder* row of the same provider carrying the same address:
 *     a migrated identity whose subject was not recoverable, repaired in
 *     place instead of being duplicated;
 *  3. a VERIFIED address already known to some user — this is the
 *     convergence the phase exists for, and the reason step 3 is the only
 *     one that consults e-mail across providers;
 *  4. nobody: a new user, with the claim as its first identity.
 *
 * Pure: the caller persists the returned records.
 */
export function resolveClaim(
  records: IdentityRecords,
  claim: IdentityClaim,
  now = Date.now(),
): { records: IdentityRecords; resolved: ResolvedIdentity } {
  const email = claim.email.trim().toLowerCase()
  const verifiedAt = claim.emailVerified && email ? now : null

  const write = (
    users: User[],
    identities: UserIdentity[],
    user: User,
    identity: UserIdentity,
    flags: { createdUser: boolean; linkedIdentity: boolean },
  ) => ({
    records: { users, identities },
    resolved: { user, identity, ...flags },
  })

  /** Replace one identity row, keeping the rest untouched. */
  const patchIdentity = (target: UserIdentity, patch: Partial<UserIdentity>) => {
    const next = { ...target, ...patch }
    return {
      identity: next,
      identities: records.identities.map((i) => (i.id === target.id ? next : i)),
    }
  }

  // 1 — known subject
  const bySubject = claim.providerSubject
    ? records.identities.find(
        (i) => i.provider === claim.provider && i.providerSubject === claim.providerSubject,
      )
    : undefined
  if (bySubject) {
    const user = userById(records, bySubject.userId)
    if (user) {
      // an address can change under a stable subject (Google alias, renamed
      // workspace account): follow it, but never downgrade a verification
      const { identity, identities } = patchIdentity(bySubject, {
        email: email || bySubject.email,
        verifiedAt: verifiedAt ?? bySubject.verifiedAt,
      })
      const nextUser = fillPrimaryEmail(user, email, now)
      return write(
        replaceUser(records.users, nextUser),
        identities,
        nextUser,
        identity,
        { createdUser: false, linkedIdentity: false },
      )
    }
  }

  // 2 — placeholder left by the migration, repaired in place
  const placeholder = records.identities.find(
    (i) => i.provider === claim.provider && !i.providerSubject && sameEmail(i.email, email),
  )
  if (placeholder) {
    const user = userById(records, placeholder.userId)
    if (user) {
      const { identity, identities } = patchIdentity(placeholder, {
        providerSubject: claim.providerSubject,
        email: email || placeholder.email,
        verifiedAt: verifiedAt ?? placeholder.verifiedAt,
      })
      const nextUser = fillPrimaryEmail(user, email, now)
      return write(
        replaceUser(records.users, nextUser),
        identities,
        nextUser,
        identity,
        { createdUser: false, linkedIdentity: false },
      )
    }
  }

  // 3 — convergence: a verified address both sides agree on
  if (verifiedAt) {
    const known = records.identities.find(
      (i) => i.verifiedAt !== null && sameEmail(i.email, email),
    )
    const user = known ? userById(records, known.userId) : null
    if (user) {
      const identity: UserIdentity = {
        id: nid('uid'),
        userId: user.id,
        provider: claim.provider,
        providerSubject: claim.providerSubject,
        email,
        verifiedAt,
      }
      const nextUser = fillPrimaryEmail(user, email, now)
      return write(
        replaceUser(records.users, nextUser),
        [...records.identities, identity],
        nextUser,
        identity,
        { createdUser: false, linkedIdentity: true },
      )
    }
  }

  // 4 — a person we have never seen
  const user: User = {
    id: newUserId({ ...claim, email }),
    primaryEmail: email,
    displayName: claim.displayName || email || 'User',
    avatarUrl: claim.avatarUrl,
    createdAt: now,
    updatedAt: now,
  }
  const identity: UserIdentity = {
    id: nid('uid'),
    userId: user.id,
    provider: claim.provider,
    providerSubject: claim.providerSubject,
    email,
    verifiedAt,
  }
  return write(
    [...records.users, user],
    [...records.identities, identity],
    user,
    identity,
    { createdUser: true, linkedIdentity: true },
  )
}

/**
 * A user's address is filled in when it is missing, never silently
 * replaced: it is where invitations and notifications go, so linking a
 * work Google account must not quietly redirect them.
 */
function fillPrimaryEmail(user: User, email: string, now: number): User {
  if (user.primaryEmail || !email) return user
  return { ...user, primaryEmail: email, updatedAt: now }
}

function replaceUser(users: User[], user: User): User[] {
  return users.some((u) => u.id === user.id)
    ? users.map((u) => (u.id === user.id ? user : u))
    : [...users, user]
}

/** Mirror the effective profile onto the user record. */
export function applyUserPatch(
  records: IdentityRecords,
  userId: string,
  patch: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'primaryEmail' | 'usageType'>>,
  now = Date.now(),
): IdentityRecords {
  const user = userById(records, userId)
  if (!user) return records
  const next: User = { ...user, ...patch, updatedAt: now }
  return { users: replaceUser(records.users, next), identities: records.identities }
}

/* ---------------- migration ---------------- */

/** Google subjects are long numeric strings; `nid` ids never are. */
const LEGACY_GOOGLE_ID = /^acc_(\d{5,})$/

/**
 * Turn the pre-16.1 `Account` into a user and its identities.
 *
 * The legacy id is PRESERVED as the user id. It is already stamped on
 * every local member record, comment author and activity entry — and, for
 * Google accounts, on rows other people's browsers hold too. Minting a
 * fresh id here would have orphaned all of it for a cosmetic gain.
 *
 * The Google subject is recovered from the legacy id when it has the
 * shape the old code wrote (`acc_<sub>`); otherwise the identity is stored
 * as a placeholder and the next sign-in repairs it through step 2 of
 * {@link resolveClaim}.
 */
export function migrateLegacyAccount(
  account: Account,
  now = Date.now(),
): IdentityRecords {
  const email = (account.email || '').toLowerCase()
  const user: User = {
    id: account.id,
    primaryEmail: email,
    displayName: account.name,
    avatarUrl: account.avatarUrl,
    usageType: account.usageType,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt || now,
  }
  const providers: AuthProviderId[] = account.providers.length
    ? account.providers
    : ['mock']
  const identities = providers.flatMap((provider): UserIdentity[] => {
    // `github` was declarable on an account but was never a way to sign in
    // — it is a repository connection — so it becomes no identity at all
    if (provider === 'github') return []
    const row: UserIdentity = {
      id: nid('uid'),
      userId: user.id,
      provider,
      providerSubject: provider === 'mock' ? MOCK_SUBJECT : '',
      email,
      verifiedAt: null, // a local account vouches for nothing
    }
    if (provider === 'google') {
      row.providerSubject = LEGACY_GOOGLE_ID.exec(account.id)?.[1] ?? ''
      // Google had vouched for this address, which is what allows a
      // placeholder row to be repaired by convergence at all
      row.verifiedAt = email ? user.updatedAt : null
    }
    return [row]
  })
  return { users: [user], identities }
}

/** Subject of the local-only account: there is one, and it is not verified. */
export const MOCK_SUBJECT = 'local'

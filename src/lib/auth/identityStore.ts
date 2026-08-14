import type { Account } from '@/types/model'
import type {
  IdentityClaim,
  IdentityProvider,
  IdentityRecords,
  ResolvedIdentity,
  User,
  UserIdentity,
} from '@/types/identity'
import { nid } from '@/lib/id'
import {
  applyUserPatch,
  identitiesOf,
  migrateLegacyAccount,
  resolveClaim,
  userById,
} from './identity'

/**
 * IdentityStore — where {@link User} and {@link UserIdentity} live.
 *
 * The rules are in `identity.ts` and are pure; this module only decides
 * storage. That split is the point of shipping 16.1 before the backend:
 * Phase 17 adds an implementation that asks `/api` behind this same
 * interface — the browser never talks to the database itself
 * (`docs/authorisation-phase-16-3.md`) — and the rules the endpoint
 * enforces are the ones already under test here.
 *
 * HONEST LIMIT — the local store is per-browser. It gives one person one
 * id across devices (see `newUserId`), but it cannot see other people's
 * users, so nothing here can authorise anything on its own. Room access
 * is decided server-side, and the server derives the caller's userIds
 * from the Google subject it verified rather than believing this store
 * (`googleUserIds`, and `src/lib/collab/acl.ts` for what it is used for).
 */

export interface IdentityStore {
  /** Resolve a completed sign-in; persists whatever it had to create. */
  resolve(claim: IdentityClaim): ResolvedIdentity
  user(id: string): User | null
  identitiesOf(userId: string): UserIdentity[]
  /** Mirror the effective profile onto the user record. */
  update(
    userId: string,
    patch: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'primaryEmail' | 'usageType'>>,
  ): User | null
  /**
   * Record an identity the SERVER has already resolved (17.3, #86).
   *
   * Distinct from {@link resolve} in the only way that matters: it does not
   * decide who this is. E-mail sign-in gets its answer from the endpoint,
   * which ran the same rules over every account rather than over this
   * browser's — so re-deciding here would mint a local id for someone the
   * server has already given one, and one person would hold two.
   */
  adopt(claim: AdoptedIdentity): ResolvedIdentity

  /** Everything stored — for tests, diagnostics and the account panel. */
  records(): IdentityRecords
}

/** A user and identity the server has already decided on. */
export interface AdoptedIdentity {
  userId: string
  provider: IdentityProvider
  providerSubject: string
  email: string
  displayName: string
  avatarUrl: string
}

const KEY = 'lattice-identity'
/**
 * Read directly rather than through AuthService: the account module
 * imports this one, so going the other way would close a cycle.
 */
const LEGACY_ACCOUNT_KEY = 'lattice-account'

/** A fresh pair every time: nothing may hand callers a shared array. */
const empty = (): IdentityRecords => ({ users: [], identities: [] })

export class LocalIdentityStore implements IdentityStore {
  private cache: IdentityRecords | null = null

  private load(): IdentityRecords {
    if (this.cache) return this.cache
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<IdentityRecords>
        this.cache = {
          users: Array.isArray(parsed.users) ? parsed.users : [],
          identities: Array.isArray(parsed.identities) ? parsed.identities : [],
        }
        return this.cache
      }
    } catch {
      // a corrupt store must not lock anyone out of their own account
    }
    // first run after the upgrade: adopt whoever is already signed in,
    // keeping their id so nothing they have already written is orphaned
    const migrated = this.adoptLegacyAccount()
    this.cache = migrated
    if (migrated.users.length) this.persist(migrated)
    return migrated
  }

  private adoptLegacyAccount(): IdentityRecords {
    try {
      const raw = localStorage.getItem(LEGACY_ACCOUNT_KEY)
      if (!raw) return empty()
      const account = JSON.parse(raw) as Account
      if (!account?.id) return empty()
      return migrateLegacyAccount({
        ...account,
        providers: Array.isArray(account.providers) ? account.providers : [],
      })
    } catch {
      return empty()
    }
  }

  private persist(records: IdentityRecords): void {
    this.cache = records
    try {
      localStorage.setItem(KEY, JSON.stringify(records))
    } catch {
      // storage full or blocked: the session still works, it just will not
      // survive a reload — which is exactly what it did before 16.1
    }
  }

  resolve(claim: IdentityClaim): ResolvedIdentity {
    const { records, resolved } = resolveClaim(this.load(), claim)
    this.persist(records)
    return resolved
  }

  user(id: string): User | null {
    return userById(this.load(), id)
  }

  identitiesOf(userId: string): UserIdentity[] {
    return identitiesOf(this.load(), userId)
  }

  update(
    userId: string,
    patch: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'primaryEmail' | 'usageType'>>,
  ): User | null {
    const next = applyUserPatch(this.load(), userId, patch)
    this.persist(next)
    return userById(next, userId)
  }

  adopt(claim: AdoptedIdentity): ResolvedIdentity {
    const records = this.load()
    const now = Date.now()

    const existingUser = userById(records, claim.userId)
    const user: User = existingUser
      ? {
          ...existingUser,
          // the server is authoritative about the address it just verified;
          // a name already chosen here is not overwritten by one derived
          // from an address
          primaryEmail: existingUser.primaryEmail || claim.email,
          updatedAt: now,
        }
      : {
          id: claim.userId,
          primaryEmail: claim.email,
          displayName: claim.displayName || claim.email,
          avatarUrl: claim.avatarUrl,
          createdAt: now,
          updatedAt: now,
        }

    const existingIdentity = records.identities.find(
      (i) => i.provider === claim.provider && i.providerSubject === claim.providerSubject,
    )
    const identity: UserIdentity = existingIdentity
      ? { ...existingIdentity, userId: claim.userId, email: claim.email, verifiedAt: now }
      : {
          id: nid('uid'),
          userId: claim.userId,
          provider: claim.provider,
          providerSubject: claim.providerSubject,
          email: claim.email,
          // the code proved control of the mailbox: this address is verified
          verifiedAt: now,
        }

    this.persist({
      users: records.users.some((u) => u.id === user.id)
        ? records.users.map((u) => (u.id === user.id ? user : u))
        : [...records.users, user],
      identities: records.identities.some((i) => i.id === identity.id)
        ? records.identities.map((i) => (i.id === identity.id ? identity : i))
        : [...records.identities, identity],
    })

    return {
      user,
      identity,
      createdUser: !existingUser,
      linkedIdentity: !existingIdentity,
    }
  }

  records(): IdentityRecords {
    return this.load()
  }

  /** Drop the in-memory copy; the next read goes back to storage. */
  reset(): void {
    this.cache = null
  }
}

export const identityStore = new LocalIdentityStore()

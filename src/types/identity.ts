import type { UsageType } from './model.js'

/* ---------------- identity model (Phase 16.1) ---------------- */

/**
 * The identity model, split in two so that *who you are* stops being *how
 * you signed in*.
 *
 * Until now a person WAS their Google e-mail: the account id was derived
 * from the Google subject, room ACLs were keyed by address, and an invite
 * had to be sent to the exact mailbox someone happened to sign in with.
 * A {@link User} is instead an opaque, durable record; every way of
 * proving you are that user — Google today, e-mail OTP in Phase 17 — is a
 * {@link UserIdentity} row pointing at it.
 *
 * One user, several identities: the same *verified* address reached
 * through Google or through OTP converges on one account instead of
 * silently creating a second one.
 */

/**
 * How an identity was proven.
 *
 * `mock` is the local-only account used when no Google client id is
 * configured; it is never verified, so it can never converge with a real
 * one (see the convergence rules in `lib/auth/identity.ts`).
 */
export type IdentityProvider = 'google' | 'email' | 'mock'

/** The person. Nothing here names a provider — that is the whole point. */
export interface User {
  /** Opaque and durable. Never re-derived from a provider; see `newUserId`. */
  id: string
  /**
   * The address the user is reached at: invitations, notifications, and —
   * until 16.2 lands — the key rooms are still shared with. It follows the
   * primary identity and is not itself an identifier.
   */
  primaryEmail: string
  /** Effective display name, mirrored from the account record. */
  displayName: string
  /** Effective avatar, mirrored from the account record. */
  avatarUrl: string
  /** Collected in 14.2; carried here so it survives a provider change. */
  usageType?: UsageType
  createdAt: number
  updatedAt: number
}

/** One proven way of signing in as a given {@link User}. */
export interface UserIdentity {
  id: string
  userId: string
  provider: IdentityProvider
  /**
   * The provider's own id for this person (Google's `sub`, the address for
   * an e-mail identity). Empty string = placeholder: the identity is known
   * to exist but its subject was not recoverable, and the next real
   * sign-in fills it in rather than adding a second row.
   */
  providerSubject: string
  /** Lowercased address this identity carries; '' when it carries none. */
  email: string
  /**
   * When the provider vouched for {@link email}, or null when nobody has.
   * Only a verified address may converge onto an existing user — an
   * unverified one claiming `owner@company.com` must never inherit that
   * account.
   */
  verifiedAt: number | null
}

/** Everything the identity store persists. */
export interface IdentityRecords {
  users: User[]
  identities: UserIdentity[]
}

/** What a completed sign-in asserts about the person who just signed in. */
export interface IdentityClaim {
  provider: IdentityProvider
  /** Provider's stable subject; '' only for providers that have none. */
  providerSubject: string
  email: string
  /** Whether the provider itself vouched for the address. */
  emailVerified: boolean
  displayName: string
  avatarUrl: string
}

/** Outcome of resolving a claim against the stored records. */
export interface ResolvedIdentity {
  user: User
  identity: UserIdentity
  /** The user did not exist before this claim. */
  createdUser: boolean
  /** The identity row is new: a second provider was linked to this user. */
  linkedIdentity: boolean
}

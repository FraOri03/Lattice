/* ---------------- entitlements (Phase 17.1 storage seam) ---------------- */

/**
 * What an *account* is allowed to do, as opposed to what a *member* may do
 * inside one project. The two are deliberately separate: `CollabRole`
 * answers "may you edit this board", an entitlement answers "may you have
 * this many projects at all".
 *
 * HONEST SCOPE — Phase 27 ([#103](https://github.com/FraOri03/Lattice/issues/103)–#106)
 * owns billing and the meaning of every value here. These types exist now
 * because 17.1 is where the storage seam is drawn, and shipping a
 * repository interface with no type behind it would be a lie. Nothing
 * reads an entitlement yet: every account is implicitly {@link FREE_PLAN}
 * until something does.
 */

export type EntitlementPlan = 'free' | 'pro' | 'team'

export type EntitlementStatus = 'active' | 'past_due' | 'canceled'

export interface Entitlement {
  userId: string
  plan: EntitlementPlan
  status: EntitlementStatus
  /** Where it came from — `'manual'` until a billing provider exists to name. */
  source: string
  /** End of the paid period, or null for a plan that does not renew. */
  currentPeriodEnd: number | null
  createdAt: number
  updatedAt: number
}

export const FREE_PLAN: EntitlementPlan = 'free'

/**
 * What an account has when no row exists for it.
 *
 * A missing row is not an error and never blocks anyone: an account that
 * has never been billed is on the free plan, and reading an entitlement
 * must not be able to lock a user out of a workspace that worked before
 * the table existed.
 */
export function freeEntitlement(userId: string, now = Date.now()): Entitlement {
  return {
    userId,
    plan: FREE_PLAN,
    status: 'active',
    source: 'default',
    currentPeriodEnd: null,
    createdAt: now,
    updatedAt: now,
  }
}

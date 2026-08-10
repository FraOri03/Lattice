import type { Account, UsageType } from '@/types/model'

/**
 * Profile rules (Phase 14.2) — pure, so the one thing that is easy to get
 * wrong can be asserted without a browser: **signing in again must not undo
 * the name you chose.**
 *
 * `Account.name` and `Account.avatarUrl` stay the effective values every
 * consumer already reads (`currentIdentity`, ProfileMenu, the greeting, collab
 * members). What changes is who last wrote them: the provider, or you.
 */

/** The editable half of a profile. */
export interface ProfilePatch {
  name?: string
  avatarUrl?: string | null
  usageType?: UsageType
}

/** What a provider reported about the person signing in. */
export interface ProviderProfile {
  name: string
  avatarUrl: string
}

/** Longest display name we store — a name, not a paragraph. */
export const MAX_DISPLAY_NAME = 60

/**
 * Apply a user edit. An empty name is not an edit, it is a request to go back
 * to what the provider says — the same for clearing the avatar with `null`.
 */
export function applyProfilePatch(account: Account, patch: ProfilePatch): Account {
  const next: Account = { ...account, updatedAt: Date.now() }
  const provider = account.providerProfile

  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, MAX_DISPLAY_NAME)
    if (name) {
      next.name = name
      next.nameOverridden = name !== provider?.name
    } else {
      // cleared: fall back to the provider's name, or keep the current one
      // when there is no provider profile to fall back to (mock accounts)
      next.name = provider?.name || account.name
      next.nameOverridden = false
    }
  }

  if (patch.avatarUrl !== undefined) {
    if (patch.avatarUrl) {
      next.avatarUrl = patch.avatarUrl
      next.avatarOverridden = true
    } else {
      next.avatarUrl = provider?.avatarUrl ?? ''
      next.avatarOverridden = false
    }
  }

  if (patch.usageType !== undefined) next.usageType = patch.usageType

  return next
}

/**
 * Merge a fresh sign-in into the stored account.
 *
 * The provider always wins on `providerProfile` — that is a fact about the
 * Google account, and the UI shows it — but it only wins on the effective
 * name and avatar while the user has not taken them over. Without this,
 * every re-sign-in silently renamed you back.
 */
export function mergeProviderProfile(
  existing: Account | null,
  incoming: Account,
  provider: ProviderProfile,
): Account {
  const merged: Account = {
    ...incoming,
    providerProfile: provider,
    nameOverridden: existing?.nameOverridden ?? false,
    avatarOverridden: existing?.avatarOverridden ?? false,
    usageType: existing?.usageType,
  }
  if (existing?.nameOverridden && existing.name) merged.name = existing.name
  if (existing?.avatarOverridden && existing.avatarUrl) merged.avatarUrl = existing.avatarUrl
  return merged
}

/** Initials for the avatar fallback — never more than two letters. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words[words.length - 1][0]]
  return letters.join('').toUpperCase()
}

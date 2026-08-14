import type { Account } from '@/types/model'
import { identityStore } from './identityStore'
import { providerIdsOf } from './identity'
import { mergeProviderProfile } from './profile'
import { sessionClient } from './sessionClient'
import { loadStoredAccount, storeAccount } from './AuthService'

/**
 * Signing in with an e-mail code (Phase 17.3, #86).
 *
 * The second provider, on the session 17.2 already issues. Deliberately
 * NOT part of `AuthService`: that class exists to manage a Google OAuth
 * token — silent renewal, gesture gating, backoff, Drive scopes — and an
 * e-mail sign-in has none of those problems. Folding it in would have
 * meant a second `kind`, a token lifecycle that does not apply, and a
 * `getAccessToken()` that has to answer for a provider with no token.
 *
 * What it shares instead is everything that matters: the same session, the
 * same identity rules, and the same local `Account` record the rest of the
 * app reads.
 */

export type CodeRequest = 'sent' | 'unavailable' | 'error'

/** Ask for a code. See `sessionClient.requestEmailCode` on what 'sent' means. */
export function requestEmailCode(email: string): Promise<CodeRequest> {
  return sessionClient.requestEmailCode(email.trim().toLowerCase())
}

/**
 * Verify a code and adopt the account it resolves to.
 *
 * The server has already run the 16.1 rules and decided *which user this
 * is* — converging onto the existing account when the address is one
 * Google already verified. This mirrors that answer into the local records
 * so presence, comments and invitations read the same identity they always
 * have.
 */
export async function signInWithEmailCode(
  email: string,
  code: string,
): Promise<Account> {
  const clean = email.trim().toLowerCase()
  const info = await sessionClient.signInWithEmailCode(clean, code.trim())
  if (!info) {
    throw new Error('That code is not valid. Request a new one.')
  }

  /**
   * The local store is told what the SERVER decided, rather than deciding
   * again. Its own `resolve()` would mint an id from the local records,
   * which on a fresh browser means a different id from the one the session
   * is bound to — two ids for one person, which is exactly what 16.1
   * exists to prevent.
   */
  identityStore.adopt({
    userId: info.userId,
    provider: 'email',
    providerSubject: clean,
    email: clean,
    displayName: info.displayName,
    avatarUrl: info.avatarUrl,
  })

  const existing = loadStoredAccount()
  const now = Date.now()
  const account = mergeProviderProfile(
    existing?.id === info.userId ? existing : null,
    {
      id: info.userId,
      name: info.displayName || clean,
      email: clean,
      avatarUrl: info.avatarUrl,
      providers: providerIdsOf(identityStore.identitiesOf(info.userId)),
      createdAt: existing?.id === info.userId ? existing.createdAt : now,
      updatedAt: now,
    },
    // an e-mail identity vouches for the address and nothing else: it has
    // no name or picture of its own to merge in
    { name: info.displayName || clean, avatarUrl: info.avatarUrl },
  )
  storeAccount(account)
  return account
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Account } from '@/types/model'
import { authService, updateStoredAccount } from './AuthService'
import { signInWithEmailCode } from './emailSignIn'
import type { ProfilePatch } from './profile'
import { hasGoogleAuth } from '@/lib/env'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { sharedIndex } from '@/lib/dashboard/sharedIndex'
import { adoptGuestVault, bootScope, GUEST_SCOPE } from '@/lib/storage/vaultScope'

/**
 * AccountProvider — session state for the personal account area.
 * Wraps the app; components read it through useAccount().
 */

export type AccountStatus = 'signed-out' | 'signing-in' | 'signed-in'

export interface AccountContextValue {
  account: Account | null
  status: AccountStatus
  /** 'google' = real OAuth configured; 'mock' = local-only account */
  authKind: 'google' | 'mock'
  /** user chose "continue without an account" on the login screen */
  loginSkipped: boolean
  error: string | null
  signIn: () => Promise<void>
  /**
   * Sign in with an e-mail code (17.3). Separate from {@link signIn}
   * because it is a different provider, not a different button for the
   * same one — see `lib/auth/emailSignIn.ts`.
   */
  signInWithCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
  skipLogin: () => void
  /**
   * Edit the profile (14.2). Writes the stored account, so the new name and
   * avatar reach presence, comments and invitations through the same record
   * `currentIdentity()` already reads.
   */
  updateProfile: (patch: ProfilePatch) => void
}

const AccountContext = createContext<AccountContextValue | null>(null)

const SKIP_KEY = 'lattice-login-skipped'

/**
 * Land on the vault that belongs to whoever just signed in.
 *
 * Every persisted store is keyed by account (`lib/storage/vaultScope`), and
 * those names are read ONCE, when the modules are first imported. So a
 * sign-in that changes who this browser is cannot be applied in place: the
 * hydrated vault, the Drive push bookkeeping, the collaboration records and
 * every singleton sitting on top of them still belong to the previous
 * person. Until this reload existed, the dashboard showed the departing
 * account's projects to the arriving one, and the sync engine went on to
 * push them into the new account's Drive.
 *
 * Reloading is the honest instrument here: it is the only way to guarantee
 * that nothing of the previous account survives — not a store, not a cache,
 * not a subscription — and it costs one navigation on an action nobody
 * performs twice a minute.
 *
 * @returns whether the page is being replaced (callers must stop).
 */
function switchVault(accountId: string): boolean {
  if (accountId === bootScope()) return false
  // work done before signing in was done by this person: hand them the guest
  // vault, unless they already have one of their own on this machine
  adoptGuestVault(accountId)
  window.location.reload()
  return true
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(() => authService.restore())
  const [status, setStatus] = useState<AccountStatus>(() =>
    authService.restore() ? 'signed-in' : 'signed-out',
  )
  const [error, setError] = useState<string | null>(null)
  const [loginSkipped, setLoginSkipped] = useState(
    () => localStorage.getItem(SKIP_KEY) === '1',
  )

  // a restored Google session resumes Drive sync on startup; start()
  // verifies the connection first and reports errors via the sync store
  useEffect(() => {
    if (account && authService.kind === 'google') {
      void syncEngine.start()
    }
    // run once for the restored session; sign-in path calls start() itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = useCallback(async () => {
    setStatus('signing-in')
    setError(null)
    try {
      const acc = await authService.signIn()
      // signing in ends "continue without an account" either way, so this
      // runs before the reload rather than after a return it never reaches
      localStorage.removeItem(SKIP_KEY)
      setLoginSkipped(false)
      // a different person than the one this page load is keyed to: the
      // reload finishes the sign-in, and nothing below it must run first
      if (switchVault(acc.id)) return
      setAccount(acc)
      setStatus('signed-in')
      // whoever was here before is not this person: the shared index answers
      // for one account, and it is a singleton that outlives a sign-in
      sharedIndex.reset()
      if (authService.kind === 'google') void syncEngine.start()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setStatus(account ? 'signed-in' : 'signed-out')
    }
  }, [account])

  const signInWithCode = useCallback(
    async (email: string, code: string) => {
      setStatus('signing-in')
      setError(null)
      try {
        const acc = await signInWithEmailCode(email, code)
        localStorage.removeItem(SKIP_KEY)
        setLoginSkipped(false)
        if (switchVault(acc.id)) return
        setAccount(acc)
        setStatus('signed-in')
        sharedIndex.reset()
        // no Drive token comes with an e-mail sign-in, so no sync to start:
        // "Connect Drive" is how this account gets one, if it wants one
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed')
        setStatus(account ? 'signed-in' : 'signed-out')
        throw err
      }
    },
    [account],
  )

  const signOut = useCallback(async () => {
    syncEngine.stop()
    // before the await: the pages reading it stay mounted through a sign-out,
    // and until this runs they are showing the departing account's projects
    // and the invitations sent to their addresses
    sharedIndex.reset()
    await authService.signOut()
    setAccount(null)
    setStatus('signed-out')
    /**
     * The account record is gone, so a reload boots into the guest vault —
     * and that is the point. Sign-out used to leave the vault, the document
     * bodies and the collaboration records of the departing account loaded
     * and on screen, which is what let the next person to sign in read them.
     */
    if (bootScope() !== GUEST_SCOPE) window.location.reload()
  }, [])

  const skipLogin = useCallback(() => {
    localStorage.setItem(SKIP_KEY, '1')
    setLoginSkipped(true)
  }, [])

  const updateProfile = useCallback((patch: ProfilePatch) => {
    const next = updateStoredAccount(patch)
    if (next) setAccount(next)
  }, [])

  const value = useMemo<AccountContextValue>(
    () => ({
      account,
      status,
      authKind: hasGoogleAuth ? 'google' : 'mock',
      loginSkipped,
      error,
      signIn,
      signInWithCode,
      signOut,
      skipLogin,
      updateProfile,
    }),
    [
      account,
      status,
      loginSkipped,
      error,
      signIn,
      signInWithCode,
      signOut,
      skipLogin,
      updateProfile,
    ],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccount must be used inside <AccountProvider>')
  return ctx
}

/**
 * The account when there is one and a provider to ask, `null` otherwise.
 *
 * For surfaces that merely *decorate* with the identity — a greeting, an
 * avatar — and must not become unrenderable without the provider. Anything
 * that acts on the account (sign in/out, sync, sharing) uses `useAccount`
 * and should still fail loudly when it is mounted outside one.
 */
export function useOptionalAccount(): Account | null {
  return useContext(AccountContext)?.account ?? null
}

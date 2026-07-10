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
import { authService } from './AuthService'
import { hasGoogleAuth } from '@/lib/env'
import { syncEngine } from '@/lib/sync/SyncEngine'

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
  signOut: () => Promise<void>
  skipLogin: () => void
}

const AccountContext = createContext<AccountContextValue | null>(null)

const SKIP_KEY = 'lattice-login-skipped'

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
      setAccount(acc)
      setStatus('signed-in')
      localStorage.removeItem(SKIP_KEY)
      setLoginSkipped(false)
      if (authService.kind === 'google') void syncEngine.start()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setStatus(account ? 'signed-in' : 'signed-out')
    }
  }, [account])

  const signOut = useCallback(async () => {
    syncEngine.stop()
    await authService.signOut()
    setAccount(null)
    setStatus('signed-out')
  }, [])

  const skipLogin = useCallback(() => {
    localStorage.setItem(SKIP_KEY, '1')
    setLoginSkipped(true)
  }, [])

  const value = useMemo<AccountContextValue>(
    () => ({
      account,
      status,
      authKind: hasGoogleAuth ? 'google' : 'mock',
      loginSkipped,
      error,
      signIn,
      signOut,
      skipLogin,
    }),
    [account, status, loginSkipped, error, signIn, signOut, skipLogin],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccount must be used inside <AccountProvider>')
  return ctx
}

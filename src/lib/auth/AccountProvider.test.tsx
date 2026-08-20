import { act, render, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AccountProvider, useAccount } from './AccountProvider'

/**
 * The two halves of a sign-out that a namespace alone does not finish (#257).
 *
 * Scoping the storage keys stopped the next person READING the last one's
 * vault. It said nothing about the two credentials that are not keys: the
 * "continue without an account" flag, which had no off switch, and the
 * HttpOnly session cookie, which the browser cannot see and a sign-out
 * performed offline never revoked.
 */

let storedAccount: { id: string; name: string; email: string } | null = null
const discardOrphanSession = vi.fn(async () => {})

vi.mock('./AuthService', () => ({
  authService: {
    kind: 'mock',
    restore: () => storedAccount,
    signIn: async () => storedAccount,
    signOut: async () => {},
  },
  updateStoredAccount: () => null,
}))

vi.mock('./sessionClient', () => ({
  sessionClient: {
    discardOrphanSession: () => discardOrphanSession(),
  },
}))

vi.mock('@/lib/sync/SyncEngine', () => ({
  syncEngine: { start: async () => {}, stop: () => {} },
}))

vi.mock('@/lib/dashboard/sharedIndex', () => ({
  sharedIndex: { reset: () => {} },
}))

const reload = vi.fn()

const wrapper = ({ children }: { children: ReactNode }) => (
  <AccountProvider>{children}</AccountProvider>
)

beforeEach(() => {
  localStorage.clear()
  storedAccount = null
  discardOrphanSession.mockClear()
  reload.mockClear()
  // jsdom refuses a real navigation, and the assertions are about the state
  // that survives it rather than about the reload itself
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
})

describe('the orphan server session', () => {
  it('is revoked when this browser boots with nobody signed in', () => {
    render(<div />, { wrapper })
    expect(discardOrphanSession).toHaveBeenCalledTimes(1)
  })

  it('is left alone when there is an account for it to belong to', () => {
    storedAccount = { id: 'usr_ada', name: 'Ada', email: 'ada@example.com' }
    render(<div />, { wrapper })
    expect(discardOrphanSession).not.toHaveBeenCalled()
  })
})

describe('guest mode', () => {
  it('opens the app and remembers it across loads', () => {
    const { result } = renderHook(() => useAccount(), { wrapper })
    expect(result.current.loginSkipped).toBe(false)

    act(() => result.current.skipLogin())

    expect(result.current.loginSkipped).toBe(true)
    expect(localStorage.getItem('lattice-login-skipped')).toBe('1')
  })

  /**
   * The flag used to be cleared only by a successful sign-in, and the
   * signed-out profile menu offered one button: "Sign in". So a browser that
   * had once skipped the login screen never showed it again, and everyone who
   * opened Lattice on that machine afterwards landed in the same guest vault.
   */
  it('can be left, which is what put the login screen back', () => {
    localStorage.setItem('lattice-login-skipped', '1')
    const { result } = renderHook(() => useAccount(), { wrapper })
    expect(result.current.loginSkipped).toBe(true)

    act(() => result.current.exitGuest())

    expect(result.current.loginSkipped).toBe(false)
    expect(localStorage.getItem('lattice-login-skipped')).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("keeps the guest vault, which is somebody's work and not a leak", () => {
    localStorage.setItem('lattice-login-skipped', '1')
    localStorage.setItem('lattice-vault-v1', '{"state":{"projects":{"p":1}}}')
    const { result } = renderHook(() => useAccount(), { wrapper })

    act(() => result.current.exitGuest())

    expect(localStorage.getItem('lattice-vault-v1')).toBe('{"state":{"projects":{"p":1}}}')
  })
})

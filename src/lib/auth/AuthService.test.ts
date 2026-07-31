import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthService } from './AuthService'

/**
 * Guards the token machinery against the failure that broke realtime and
 * Drive sync: every GIS token request goes through window.open, so firing
 * one from background code (realtime attach, sync start, media grant) got
 * the popup blocked and returned null — the app then reported "sign in
 * with Google" to a user who was already signed in.
 *
 * Two rules keep that from coming back:
 *  - no token request without transient user activation; the refresh waits
 *    for the next gesture instead;
 *  - concurrent callers share one round-trip, because the GIS TokenClient
 *    has a single callback slot and overlapping requests strand promises.
 */

vi.mock('@/lib/env', () => ({
  env: { googleClientId: 'test-client-id' },
  hasGoogleAuth: true,
}))

interface TokenResponse {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

let prompts: string[] = []

/** Stub Google Identity Services: loadGis() short-circuits on window.google. */
function installGis(): void {
  prompts = []
  const client: {
    callback?: (resp: TokenResponse) => void
    requestAccessToken: (opts?: { prompt?: string }) => void
  } = {
    requestAccessToken: (opts) => {
      prompts.push(opts?.prompt ?? 'consent')
      const n = prompts.length
      // GIS always answers asynchronously
      setTimeout(
        () => client.callback?.({ access_token: `tok-${n}`, expires_in: 3600 }),
        0,
      )
    },
  }
  ;(window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: { initTokenClient: () => client, revoke: () => {} },
    },
  }
}

/** A signed-in user whose Drive consent was granted, token since expired. */
function seedExpiredSession(): void {
  localStorage.setItem(
    'lattice-account',
    JSON.stringify({ id: 'acc_1', name: 'Tester', email: 't@example.com' }),
  )
  localStorage.setItem(
    'lattice-google-token',
    JSON.stringify({ accessToken: 'stale', expiresAt: Date.now() - 1000 }),
  )
}

let authService: AuthService

beforeEach(async () => {
  localStorage.clear()
  installGis()
  vi.resetModules()
  authService = (await import('./AuthService')).authService
})

describe('background token refresh', () => {
  it('never asks Google for a token without user activation', async () => {
    seedExpiredSession()

    expect(await authService.getAccessToken()).toBeNull()
    expect(prompts).toEqual([]) // no window.open → no blocked popup
  })

  it('refreshes on the next user gesture and tells listeners', async () => {
    seedExpiredSession()
    const onChange = vi.fn()
    authService.subscribe(onChange)

    expect(await authService.getAccessToken()).toBeNull()
    window.dispatchEvent(new Event('pointerdown'))

    await vi.waitFor(() => expect(authService.peekToken()?.accessToken).toBe('tok-1'))
    expect(prompts).toEqual(['']) // silent prompt, one attempt
    expect(onChange).toHaveBeenCalled() // realtime + sync resume on this
  })

  it('shares one round-trip between concurrent callers', async () => {
    seedExpiredSession()
    window.dispatchEvent(new Event('pointerdown'))

    const tokens = await Promise.all([
      authService.getAccessToken(),
      authService.getAccessToken(),
      authService.getAccessToken(),
    ])

    expect(prompts).toEqual(['']) // one popup, not three
    expect(new Set(tokens)).toEqual(new Set(['tok-1']))
  })

  it('serves a live token without touching Google', async () => {
    localStorage.setItem(
      'lattice-account',
      JSON.stringify({ id: 'acc_1', name: 'Tester', email: 't@example.com' }),
    )
    localStorage.setItem(
      'lattice-google-token',
      JSON.stringify({ accessToken: 'live', expiresAt: Date.now() + 3_600_000 }),
    )

    expect(await authService.getAccessToken()).toBe('live')
    expect(prompts).toEqual([])
  })

  it('reports the session as unrecoverable when consent was never granted', async () => {
    localStorage.setItem(
      'lattice-account',
      JSON.stringify({ id: 'acc_1', name: 'Tester', email: 't@example.com' }),
    )
    window.dispatchEvent(new Event('pointerdown'))

    expect(await authService.getAccessToken()).toBeNull()
    expect(prompts).toEqual([]) // silent renewal is pointless without consent
    expect(authService.needsReauth()).toBe(true) // UI must offer "Reconnect"
  })
})

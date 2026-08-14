import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
let hints: Array<string | undefined> = []
/** What Google answers the n-th request with; `null` = it never answers. */
let respond: (n: number) => TokenResponse | null = (n) => ({
  access_token: `tok-${n}`,
  expires_in: 3600,
})
/** The stub TokenClient, so a test can deliver a response out of band. */
let gisClient: { callback?: (resp: TokenResponse) => void }

/** Stub Google Identity Services: loadGis() short-circuits on window.google. */
function installGis(): void {
  prompts = []
  hints = []
  respond = (n) => ({ access_token: `tok-${n}`, expires_in: 3600 })
  const client: {
    callback?: (resp: TokenResponse) => void
    requestAccessToken: (opts?: { prompt?: string; hint?: string }) => void
  } = {
    requestAccessToken: (opts) => {
      prompts.push(opts?.prompt ?? 'consent')
      hints.push(opts?.hint)
      const n = prompts.length
      // GIS always answers asynchronously
      setTimeout(() => {
        const resp = respond(n)
        if (resp) client.callback?.(resp)
      }, 0)
    },
  }
  gisClient = client
  ;(window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: { initTokenClient: () => client, revoke: () => {} },
    },
  }
}

/**
 * A signed-in user whose Drive consent was granted and who holds no live
 * token — which since 17.2 (#85) is simply the state after any reload: the
 * token lives in memory, and what persists is the consent flag rather than
 * the credential.
 */
function seedExpiredSession(): void {
  localStorage.setItem(
    'lattice-account',
    JSON.stringify({ id: 'acc_1', name: 'Tester', email: 't@example.com' }),
  )
  localStorage.setItem('lattice-drive-consent', '1')
}

/**
 * Drive the mock GIS once, so a real token lands in memory. The gesture
 * comes first: with user activation already present, the silent refresh
 * runs straight away instead of arming a retry.
 */
async function landToken(service: AuthService): Promise<void> {
  window.dispatchEvent(new Event('pointerdown'))
  await service.getAccessToken()
  await vi.waitFor(() => expect(service.peekToken()).not.toBeNull())
}

let authService: AuthService

/**
 * `vi.resetModules()` hands every test a fresh AuthService, but jsdom shares
 * one `window` across the whole file. A test that ends with a gesture retry
 * still armed leaves its listener attached to it, so the NEXT test's gesture
 * fires two refreshes — the orphan's and its own — and the second token
 * request lands in assertions that counted on one. Record what each test
 * attaches, detach it when the test ends.
 */
type Listener = EventListenerOrEventListenerObject

const attached: Array<{
  type: string
  handler: Listener
  options?: boolean | AddEventListenerOptions
}> = []

// The worker lib in this project's tsconfig makes the untyped overloads
// resolve against DedicatedWorkerGlobalScope, so both ends take one plain
// signature instead.
const realAddEventListener = window.addEventListener as (
  type: string,
  handler: Listener,
  options?: boolean | AddEventListenerOptions,
) => void
const realRemoveEventListener = window.removeEventListener as (
  type: string,
  handler: Listener,
  options?: boolean | EventListenerOptions,
) => void

beforeEach(async () => {
  localStorage.clear()
  installGis()
  window.addEventListener = ((
    type: string,
    handler: Listener,
    options?: boolean | AddEventListenerOptions,
  ) => {
    attached.push({ type, handler, options })
    realAddEventListener.call(window, type, handler, options)
  }) as typeof window.addEventListener
  vi.resetModules()
  authService = (await import('./AuthService')).authService
})

afterEach(() => {
  window.addEventListener = realAddEventListener as typeof window.addEventListener
  for (const { type, handler, options } of attached) {
    realRemoveEventListener.call(window, type, handler, options)
  }
  attached.length = 0
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

  it('serves a live token from memory without touching Google again', async () => {
    seedExpiredSession()
    await landToken(authService)
    expect(prompts).toHaveLength(1)

    // the token is cached in the field, so further callers cost nothing
    expect(await authService.getAccessToken()).toBe('tok-1')
    expect(await authService.getAccessToken()).toBe('tok-1')
    expect(prompts).toHaveLength(1)
  })

  /**
   * The regression that made the consent flag necessary: with the token in
   * memory, every reload starts with no token, and treating that as "the
   * grant is gone" would have demanded a reconnect on every single load.
   */
  it('does not mistake a reload for a lost Drive grant', async () => {
    seedExpiredSession()

    expect(await authService.getAccessToken()).toBeNull()
    expect(authService.needsReauth()).toBe(false)
  })

  it('does ask for a reconnect when consent was never granted here', async () => {
    localStorage.setItem(
      'lattice-account',
      JSON.stringify({ id: 'acc_1', name: 'Tester', email: 't@example.com' }),
    )
    // no consent flag: this browser has never completed the Drive grant
    expect(await authService.getAccessToken()).toBeNull()
    expect(authService.needsReauth()).toBe(true)
  })

  it('keeps no OAuth token in browser storage', async () => {
    seedExpiredSession()
    await landToken(authService)

    // the whole point of #85: a live token exists, and none of it is on disk
    expect(authService.peekToken()?.accessToken).toBe('tok-1')
    const dumped = JSON.stringify(localStorage)
    expect(dumped).not.toContain('tok-1')
    expect(localStorage.getItem('lattice-google-token')).toBeNull()
  })

  it('preselects the signed-in account so the renewal stays silent', async () => {
    seedExpiredSession()
    window.dispatchEvent(new Event('pointerdown'))

    await authService.getAccessToken()

    // without a hint a browser holding several Google sessions answers
    // `prompt: ''` with the account chooser — a visible sign-in prompt
    expect(hints).toEqual(['t@example.com'])
  })

  it('backs off after a failed refresh instead of asking on every click', async () => {
    seedExpiredSession()
    respond = () => ({ error: 'server_error' })

    window.dispatchEvent(new Event('pointerdown'))
    expect(await authService.getAccessToken()).toBeNull()
    await vi.waitFor(() => expect(prompts).toHaveLength(1))

    // the Drive poll and the sync debounce keep asking; a cooling-down
    // service must answer them from memory, not with another Google window
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new Event('pointerdown'))
      expect(await authService.getAccessToken()).toBeNull()
    }
    expect(prompts).toHaveLength(1)
    // one transient hiccup is not an expired session: don't say it is
    expect(authService.needsReauth()).toBe(false)
  })

  it('asks for a reconnect straight away when the grant itself is gone', async () => {
    seedExpiredSession()
    respond = () => ({ error: 'access_denied' })

    window.dispatchEvent(new Event('pointerdown'))
    expect(await authService.getAccessToken()).toBeNull()

    await vi.waitFor(() => expect(authService.needsReauth()).toBe(true))
  })

  it('keeps a token that lands after its round-trip was abandoned', async () => {
    vi.useFakeTimers()
    try {
      seedExpiredSession()
      respond = () => null // GIS opened its window and never called back

      window.dispatchEvent(new Event('pointerdown'))
      const pending = authService.getAccessToken()
      // the silent round-trip gives up so it can't block the queue forever
      await vi.advanceTimersByTimeAsync(31_000)
      expect(await pending).toBeNull()

      // …and then Google answers anyway
      gisClient.callback?.({ access_token: 'late-tok', expires_in: 3600 })
      await vi.advanceTimersByTimeAsync(0)

      // dropping it left the app announcing an expired session while the
      // browser held a perfectly good token
      expect(authService.peekToken()?.accessToken).toBe('late-tok')
      expect(authService.needsReauth()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
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

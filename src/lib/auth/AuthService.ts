import { env, hasGoogleAuth } from '@/lib/env'
import type { Account } from '@/types/model'
import { applyProfilePatch, mergeProviderProfile, type ProfilePatch } from './profile'
import { MOCK_SUBJECT, providerIdsOf } from './identity'
import { identityStore } from './identityStore'
import { sessionClient } from './sessionClient'

/**
 * AuthService — personal account sign-in.
 *
 * Two implementations behind one interface:
 *  - GoogleAuthService: REAL Google OAuth (Google Identity Services token
 *    flow). Used whenever VITE_GOOGLE_CLIENT_ID is configured. The token
 *    it manages carries the drive.file scope, so the same session powers
 *    Google Drive sync.
 *  - MockAuthService: used when no client id is configured (local dev
 *    without credentials). It creates a LOCAL-ONLY account so the account
 *    area, projects and UI can be exercised — it never pretends cloud
 *    sync works: getAccessToken() returns null and Drive stays disabled.
 */

/** Scope Lattice needs: access only to files it creates in the user's Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
/** Optional scope for the hidden appDataFolder — NOT requested: Lattice uses a visible /Lattice folder. */
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
/** Scopes that must be granted for Drive sync to work. */
export const REQUIRED_DRIVE_SCOPES = [DRIVE_SCOPE]

export interface StoredToken {
  accessToken: string
  /** epoch ms after which the token is considered dead */
  expiresAt: number
  /** space-separated scopes Google reported as granted with this token */
  scope?: string
}

export interface AuthService {
  readonly kind: 'google' | 'mock'
  /** Interactive sign-in. Rejects if the user closes the consent flow. */
  signIn(): Promise<Account>
  signOut(): Promise<void>
  /** Restore a previous session from storage (no network). */
  restore(): Account | null
  /**
   * A valid OAuth access token for Google APIs, refreshing silently if
   * possible. null → not signed in / mock provider / refresh needs user
   * interaction.
   */
  getAccessToken(): Promise<string | null>
  /** Current stored token if still valid — no network, no popup. */
  peekToken(): StoredToken | null
  /**
   * true when the session can only be restored by an explicit user action
   * ("Reconnect Drive"): the silent refresh was refused or consent was
   * never granted. Background callers use it to explain themselves.
   */
  needsReauth(): boolean
  /**
   * Notified whenever the token state changes — a fresh token was acquired
   * (silent renewal, sign-in, reconnect) or the session went stale.
   * Realtime and Drive sync listen to resume as soon as a token lands.
   */
  subscribe(listener: () => void): () => void
  /**
   * Interactive (re)connect to Google Drive: forces a fresh consent
   * round-trip and stores the new token. Rejects with a human-readable
   * message on failure (popup blocked, origin not authorized, denied…).
   */
  connectDrive(): Promise<void>
  /** Revoke and drop the Drive token but keep the account signed in. */
  disconnectDrive(): Promise<void>
}

const ACCOUNT_KEY = 'lattice-account'
const TOKEN_KEY = 'lattice-google-token'
/**
 * "Drive consent was granted in this browser at some point" — a fact, not
 * a credential (17.2, #85).
 *
 * The token used to be its own evidence: something in TOKEN_KEY meant
 * consent had happened, so a silent refresh was worth attempting. Moving
 * the token into memory took that evidence away, and without a replacement
 * every reload would have declared the Drive session expired and demanded
 * a reconnect — a token-shaped hole where a boolean belongs. This flag is
 * what survives instead, and it grants nothing to whoever reads it.
 */
const DRIVE_CONSENT_KEY = 'lattice-drive-consent'

function hasDriveConsent(): boolean {
  try {
    return localStorage.getItem(DRIVE_CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

function setDriveConsent(granted: boolean): void {
  try {
    if (granted) localStorage.setItem(DRIVE_CONSENT_KEY, '1')
    else localStorage.removeItem(DRIVE_CONSENT_KEY)
  } catch {
    // storage blocked: the session still works for as long as the tab lives
  }
}
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPES = `openid email profile ${DRIVE_SCOPE}`
/**
 * Renew this long before expiry. Wide on purpose: renewal needs a user
 * gesture (see below), so the window has to be long enough that an ordinary
 * click lands inside it — otherwise the token dies and every background
 * caller starts reporting a session that is not actually gone.
 */
const RENEW_AHEAD_MS = 10 * 60_000
/** A silent round-trip that never answers must not block the next one. */
const SILENT_TIMEOUT_MS = 30_000
/**
 * Wait this long after a failed silent refresh before trying another one.
 *
 * Without a cooldown the failure was re-armed by the very next caller —
 * Drive polling asks every 20s, sync every 10s — so each of those armed the
 * gesture retry again and Google's window reappeared on click after click.
 * That is the "it asks me to sign in twice in a few minutes" bug.
 */
const SILENT_BACKOFF_MS = [30_000, 2 * 60_000, 8 * 60_000, 15 * 60_000]
/** Consecutive silent failures after which the UI must offer "Reconnect". */
const MAX_SILENT_FAILURES = 3

/* ---------------- transient user activation ---------------- */

/**
 * Every GIS token request goes through window.open, so the browser blocks
 * it unless the page has transient user activation. Background callers —
 * realtime attach, Drive sync, media grants — have none: asking anyway
 * yielded a blocked popup and a null token instead of a refreshed session.
 * We therefore only request a token while a gesture is still "hot", and
 * otherwise defer the refresh to the next one.
 */
const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const
/** Fallback window for browsers without navigator.userActivation. */
const GESTURE_WINDOW_MS = 3000

let lastGestureAt = 0

if (typeof window !== 'undefined') {
  for (const type of GESTURE_EVENTS) {
    window.addEventListener(
      type,
      () => {
        lastGestureAt = Date.now()
      },
      { capture: true, passive: true },
    )
  }
}

function hasUserActivation(): boolean {
  const activation = (
    navigator as Navigator & { userActivation?: { isActive?: boolean } }
  ).userActivation
  if (typeof activation?.isActive === 'boolean') return activation.isActive
  return Date.now() - lastGestureAt < GESTURE_WINDOW_MS
}

/**
 * The stored account record. Exported because e-mail sign-in (17.3) writes
 * the same record through a path that is deliberately not this class —
 * `emailSignIn.ts` explains why.
 */
export function loadStoredAccount(): Account | null {
  return loadAccount()
}

/** @see loadStoredAccount */
export function storeAccount(account: Account | null): void {
  saveAccount(account)
}

function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    return raw ? (JSON.parse(raw) as Account) : null
  } catch {
    return null
  }
}

function saveAccount(account: Account | null) {
  if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  else localStorage.removeItem(ACCOUNT_KEY)
}

/**
 * Persist a profile edit (14.2).
 *
 * It writes the same record `currentIdentity()` reads, which is the point:
 * the name you choose is the name comments, presence and invitations show,
 * without a second identity to keep in step.
 */
export function updateStoredAccount(patch: ProfilePatch): Account | null {
  const existing = loadAccount()
  if (!existing) return null
  const next = applyProfilePatch(existing, patch)
  saveAccount(next)
  mirrorProfileToUser(next)
  return next
}

/**
 * Restore a session, and make sure the identity store knows about it.
 *
 * A session restored from storage never goes through `signIn()`, so
 * without this the store would stay empty until the next sign-in or
 * profile edit and the account would be a person the model has never
 * heard of. Reading it is enough: the store adopts whoever is already
 * signed in on its first read, keeping their id.
 */
function restoreAccount(): Account | null {
  const account = loadAccount()
  if (account) identityStore.user(account.id)
  return account
}

/**
 * Keep the user record in step with the account (16.1).
 *
 * One direction only, and deliberately: the account owns the *effective*
 * name and avatar, including the override bookkeeping that decides whether
 * a re-sign-in may touch them, while the user record owns identity — the
 * id, the address, and what other people will read once the profile lives
 * on a server. `primaryEmail` is not mirrored: it is where invitations go,
 * so linking a second provider must not quietly redirect them.
 */
function mirrorProfileToUser(account: Account): void {
  identityStore.update(account.id, {
    displayName: account.name,
    avatarUrl: account.avatarUrl,
    usageType: account.usageType,
  })
}

/* ---------------- Google Identity Services ---------------- */

interface TokenResponse {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

interface GisClientError {
  type: 'popup_failed_to_open' | 'popup_closed' | 'unknown'
  message?: string
}

interface TokenClient {
  /**
   * `hint` preselects the Google account. Without it a browser signed into
   * more than one account cannot resolve `prompt: ''` on its own and shows
   * the account chooser — a visible sign-in prompt where a silent renewal
   * was intended.
   */
  requestAccessToken(opts?: { prompt?: string; hint?: string }): void
  callback?: (resp: TokenResponse) => void
}

interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string
        scope: string
        callback: (resp: TokenResponse) => void
        error_callback?: (err: GisClientError) => void
      }): TokenClient
      revoke(token: string, done?: () => void): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleGlobal
  }
}

let gisPromise: Promise<GoogleGlobal> | null = null

function loadGis(): Promise<GoogleGlobal> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GIS_SRC
      script.async = true
      script.onload = () => {
        if (window.google?.accounts?.oauth2) resolve(window.google)
        else reject(new Error('Google Identity Services failed to initialize'))
      }
      script.onerror = () =>
        reject(new Error('Could not load Google Identity Services (offline?)'))
      document.head.appendChild(script)
    })
  }
  return gisPromise
}

/**
 * Failures no amount of silent retrying can fix: the grant is gone, or the
 * OAuth client itself is wrong. Everything else — a blocked or undetectable
 * popup, a dead network, a round-trip Google never answered — is transient
 * and must NOT be reported as an expired session, because telling a signed-in
 * user to sign in again over a 3-second network blip is the whole complaint.
 */
const USER_ACTION_CODES = new Set([
  'access_denied',
  'consent_required',
  'interaction_required',
  'login_required',
  'invalid_client',
  'origin_mismatch',
  'redirect_uri_mismatch',
])

/** A GIS/OAuth failure that still knows which code produced it. */
class AuthRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthRequestError'
  }

  /** true when only an explicit "Reconnect Drive" can restore the session. */
  get needsUserAction(): boolean {
    return USER_ACTION_CODES.has(this.code)
  }
}

/** Translate GIS / OAuth failures into actionable messages. */
function describeAuthError(code: string, description?: string): string {
  const origin = window.location.origin
  switch (code) {
    case 'access_denied':
      return 'Google denied the request: the Drive permission was not granted. Reconnect and accept the "See and manage files created with this app" permission.'
    case 'invalid_client':
      return `Google rejected the OAuth client id. Check that VITE_GOOGLE_CLIENT_ID matches a Web application client in Google Cloud Console → Credentials.`
    case 'redirect_uri_mismatch':
    case 'origin_mismatch':
      return `This origin is not authorized for the OAuth client. Add ${origin} to "Authorized JavaScript origins" in Google Cloud Console → Credentials, then retry (changes can take a few minutes).`
    case 'popup_failed_to_open':
      return 'The Google sign-in popup was blocked. Allow popups for this site and retry.'
    case 'popup_closed':
      return `The Google window closed before finishing. If it showed an error page, verify that ${origin} is listed under "Authorized JavaScript origins" for this OAuth client in Google Cloud Console.`
    case 'interaction_required':
    case 'consent_required':
    case 'login_required':
      return 'Google needs you to sign in again — use "Reconnect Drive".'
    default:
      return description
        ? `Google sign-in failed: ${code} — ${description}`
        : `Google sign-in failed: ${code}`
  }
}

class GoogleAuthService implements AuthService {
  readonly kind = 'google' as const
  private tokenClient: TokenClient | null = null
  /** reject of the token request currently in flight (error_callback path) */
  private pendingReject: ((err: Error) => void) | null = null
  /**
   * The TokenClient has a single callback slot, so two overlapping requests
   * stomp on each other and leave promises pending forever. Every round-trip
   * queues behind this chain instead.
   */
  private chain: Promise<unknown> = Promise.resolve()
  /** The silent refresh in flight — concurrent callers share it. */
  private silentFlight: Promise<StoredToken> | null = null
  /** Silent renewal is no longer possible: only an explicit reconnect helps. */
  private reauthNeeded = false
  /** One-shot "refresh on the next user gesture" listener, when armed. */
  private gestureRetry: (() => void) | null = null
  /** Consecutive failed silent refreshes; reset the moment a token lands. */
  private silentFailures = 0
  /** Epoch ms before which no silent refresh may be attempted (backoff). */
  private nextSilentAt = 0
  /** The single pending wake-up: renewal due, or the end of a backoff. */
  private wakeTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()

  constructor() {
    // 17.2 — delete any token an earlier version persisted. Leaving it
    // behind would keep exactly the credential this phase removed sitting
    // in storage, for as long as the browser kept it.
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // storage blocked: nothing was ever written there either
    }
    // A restored session must schedule its own renewal, or the token simply
    // expires while the app is open and every caller discovers it the hard way.
    this.scheduleWakeupForToken()
    if (typeof document !== 'undefined') {
      // timers in a background tab are throttled to minutes, so a tab left
      // open all afternoon comes back with a stale schedule
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.scheduleWakeupForToken()
      })
    }
  }

  /**
   * The Google token lives in MEMORY and nowhere else (17.2, #85).
   *
   * It used to be persisted under TOKEN_KEY, which meant a Drive-scoped
   * OAuth credential sat in `localStorage` for any script on the page to
   * read — the limitation #85 exists to close. Keeping it in a field means
   * a reload drops it, and a reload is now allowed to drop it: identity
   * survives in the session cookie, realtime authenticates with that, and
   * the only thing still needing this token is Google Drive, which asks
   * for it through `getAccessToken()` and silently renews exactly as it
   * already did whenever the hourly expiry passed.
   */
  private token: StoredToken | null = null

  private loadToken(): StoredToken | null {
    const t = this.token
    return t && t.accessToken && t.expiresAt ? t : null
  }

  private saveToken(token: StoredToken | null) {
    this.token = token
  }

  private async client(): Promise<TokenClient> {
    if (this.tokenClient) return this.tokenClient
    const google = await loadGis()
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: env.googleClientId,
      scope: SCOPES,
      callback: () => {}, // replaced per-request
      error_callback: (err) => {
        const reject = this.pendingReject
        this.pendingReject = null
        reject?.(new Error(describeAuthError(err.type, err.message)))
      },
    })
    return this.tokenClient
  }

  /**
   * One token round-trip through GIS, serialised against any other.
   * prompt '' = silent when possible; concurrent silent callers share one
   * request instead of racing for the client's single callback slot.
   */
  private requestToken(prompt: '' | 'consent'): Promise<StoredToken> {
    if (prompt === '' && this.silentFlight) return this.silentFlight
    const run = this.chain.then(() => this.roundTrip(prompt))
    // the chain must never reject, or every later request would skip its turn
    this.chain = run.then(
      () => {},
      () => {},
    )
    if (prompt === '') {
      this.silentFlight = run
      const clear = () => {
        if (this.silentFlight === run) this.silentFlight = null
      }
      void run.then(clear, clear)
    }
    return run
  }

  private roundTrip(prompt: '' | 'consent'): Promise<StoredToken> {
    return new Promise((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const finish = (emit: () => void) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        this.pendingReject = null
        emit()
      }
      // a silent request the user never sees can hang; don't block the queue
      if (prompt === '') {
        timer = setTimeout(
          () =>
            finish(() =>
              reject(
                new AuthRequestError(
                  'timeout',
                  'Google did not answer the silent token refresh.',
                ),
              ),
            ),
          SILENT_TIMEOUT_MS,
        )
      }
      this.pendingReject = (err) => finish(() => reject(err))
      void this.client()
        .then((client) => {
          client.callback = (resp) => {
            if (resp.error || !resp.access_token) {
              finish(() =>
                reject(
                  resp.error
                    ? new AuthRequestError(
                        resp.error,
                        describeAuthError(resp.error, resp.error_description),
                      )
                    : new AuthRequestError(
                        'cancelled',
                        'Google sign-in was cancelled',
                      ),
                ),
              )
              return
            }
            const token: StoredToken = {
              accessToken: resp.access_token,
              // refresh 60s before the real expiry
              expiresAt: Date.now() + ((resp.expires_in ?? 3600) - 60) * 1000,
              scope: resp.scope,
            }
            // OUTSIDE finish(): a round-trip that already timed out can still
            // deliver a perfectly good token. Dropping it there is what left
            // the app announcing an expired session while holding a live one.
            this.acceptToken(token)
            finish(() => resolve(token))
          }
          // the hint is what keeps `prompt: ''` from degrading into a visible
          // account chooser on a browser with several Google sessions
          const hint = loadAccount()?.email || undefined
          client.requestAccessToken(hint ? { prompt, hint } : { prompt })
        })
        .catch((err: unknown) => {
          finish(() => reject(err instanceof Error ? err : new Error(String(err))))
        })
    })
  }

  /**
   * Everything that happens the moment a fresh token lands, in one place and
   * exactly once: persist it, clear the failure state that was pushing the
   * UI towards "reconnect", schedule the next renewal, wake the listeners.
   */
  private acceptToken(token: StoredToken): void {
    this.saveToken(token)
    // consent is proven by a token having arrived, and the proof outlives
    // the token itself
    setDriveConsent(true)
    this.silentFailures = 0
    this.nextSilentAt = 0
    this.reauthNeeded = false
    this.disarmGestureRetry()
    this.scheduleWakeup(token.expiresAt - RENEW_AHEAD_MS - Date.now())
    this.notify()
  }

  /**
   * Record a failed silent refresh and decide when — and whether — to try
   * again. Transient failures back off and retry on their own; only a real
   * loss of consent (or a run of failures long enough to mean something is
   * genuinely broken) escalates to "the user must reconnect".
   */
  private noteSilentFailure(err: unknown): void {
    this.silentFailures += 1
    const fatal = err instanceof AuthRequestError && err.needsUserAction
    const step = Math.min(this.silentFailures - 1, SILENT_BACKOFF_MS.length - 1)
    const wait = fatal ? SILENT_BACKOFF_MS[SILENT_BACKOFF_MS.length - 1] : SILENT_BACKOFF_MS[step]
    this.nextSilentAt = Date.now() + wait
    this.disarmGestureRetry()
    this.scheduleWakeup(wait)
    if (fatal || this.silentFailures >= MAX_SILENT_FAILURES) this.setReauthNeeded(true)
  }

  /** Re-enter the refresh path once, `ms` from now (replaces any pending one). */
  private scheduleWakeup(ms: number): void {
    if (typeof window === 'undefined') return
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.wakeTimer = setTimeout(
      () => {
        this.wakeTimer = null
        void this.refreshSilently()
      },
      Math.max(0, ms),
    )
  }

  /** Put the renewal timer back in step with whatever token is on disk. */
  private scheduleWakeupForToken(): void {
    const token = this.loadToken()
    if (!token) return
    const due = token.expiresAt - RENEW_AHEAD_MS - Date.now()
    this.scheduleWakeup(Math.max(due, this.nextSilentAt - Date.now()))
  }

  /**
   * Silent refresh, popup-safe. Without transient user activation the
   * browser blocks the GIS window, so we skip the call entirely — no
   * blocked-popup noise, no bogus "signed out" — and retry on the next
   * gesture instead. Callers get null and stay honest in the meantime.
   */
  private async refreshSilently(): Promise<StoredToken | null> {
    // consent was never granted in this browser → only "Connect Drive" can
    // help, and it must come from a real click. Note this asks about
    // CONSENT, not about a stored token: since 17.2 the token is in memory,
    // so its absence after a reload says nothing about the grant.
    if (!hasDriveConsent()) {
      this.setReauthNeeded(true)
      return null
    }
    // still cooling down from the last failure: staying quiet here is what
    // stops one broken refresh from popping a Google window on every click
    if (Date.now() < this.nextSilentAt) return null
    if (!hasUserActivation()) {
      this.armGestureRetry()
      return null
    }
    try {
      // acceptToken() already recorded the success and woke the listeners
      return await this.requestToken('')
    } catch (err) {
      this.noteSilentFailure(err)
      return null
    }
  }

  /** Refresh as soon as the user next interacts — the popup is allowed then. */
  private armGestureRetry(): void {
    if (this.gestureRetry || typeof window === 'undefined') return
    void this.client() // pre-warm GIS so the gesture isn't spent loading it
    const handler = () => {
      this.disarmGestureRetry()
      void this.refreshSilently()
    }
    this.gestureRetry = handler
    for (const type of GESTURE_EVENTS) {
      window.addEventListener(type, handler, { capture: true, passive: true })
    }
  }

  private disarmGestureRetry(): void {
    const handler = this.gestureRetry
    if (!handler) return
    this.gestureRetry = null
    for (const type of GESTURE_EVENTS) {
      window.removeEventListener(type, handler, { capture: true })
    }
  }

  private setReauthNeeded(needed: boolean): void {
    if (this.reauthNeeded === needed) return
    this.reauthNeeded = needed
    this.notify()
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // a broken listener must never break authentication
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  needsReauth(): boolean {
    return this.reauthNeeded
  }

  async signIn(): Promise<Account> {
    const token = await this.requestToken('consent')
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    })
    if (!res.ok) throw new Error(`Could not load Google profile (${res.status})`)
    const info = (await res.json()) as {
      sub: string
      name?: string
      email?: string
      picture?: string
    }
    const existing = loadAccount()
    const now = Date.now()
    const provider = { name: info.name ?? 'Google user', avatarUrl: info.picture ?? '' }
    const email = (info.email ?? '').toLowerCase()
    /**
     * 16.1 — the id no longer comes from the Google subject. The identity
     * store answers "who is this", linking this Google identity to an
     * existing user when it can (same subject, or an address someone has
     * already verified) and minting one only when it cannot.
     *
     * Google's userinfo only ever returns an address it vouches for, which
     * is what makes this claim a verified one — and therefore what lets a
     * later e-mail OTP sign-in converge onto this same account.
     */
    const { user } = identityStore.resolve({
      provider: 'google',
      providerSubject: info.sub,
      email,
      emailVerified: !!email,
      displayName: provider.name,
      avatarUrl: provider.avatarUrl,
    })
    // the provider is authoritative about the Google account, not about the
    // name the user chose for themselves — mergeProviderProfile keeps both.
    // Only the SAME user's overrides carry over: signing in as someone else
    // on a shared browser must not inherit the previous person's name.
    const account = mergeProviderProfile(
      existing?.id === user.id ? existing : null,
      {
        id: user.id,
        name: provider.name,
        email,
        avatarUrl: provider.avatarUrl,
        providers: providerIdsOf(identityStore.identitiesOf(user.id)),
        createdAt: user.createdAt,
        updatedAt: now,
      },
      provider,
    )
    saveAccount(account)
    mirrorProfileToUser(account)
    /**
     * 17.2 — trade the Google token for a Lattice session, once. From here
     * the browser proves who it is with an HttpOnly cookie it cannot read,
     * and the Google token is a Drive credential and nothing more.
     *
     * A failure here is not a failed sign-in: a deployment with no database
     * answers 501, and the app falls back to the token path exactly as
     * before. Sign-in must not depend on a backend that is allowed to be
     * absent.
     */
    await sessionClient.establish(token.accessToken)
    this.setReauthNeeded(false)
    this.notify()
    return account
  }

  async signOut(): Promise<void> {
    // revoke the server session first: a sign-out that only cleared local
    // state would leave a live session behind on every other device
    await sessionClient.logout()
    await this.disconnectDrive()
    saveAccount(null)
  }

  restore(): Account | null {
    return restoreAccount()
  }

  async getAccessToken(): Promise<string | null> {
    const cached = this.loadToken()
    if (cached && cached.expiresAt > Date.now()) {
      // renew ahead of the cliff while the user is around, so long-lived
      // background work (realtime, sync) never trips over an expiry
      if (cached.expiresAt - Date.now() < RENEW_AHEAD_MS && hasUserActivation()) {
        void this.refreshSilently()
      }
      return cached.accessToken
    }
    if (!loadAccount()) return null
    const token = await this.refreshSilently()
    return token?.accessToken ?? null
  }

  peekToken(): StoredToken | null {
    const t = this.loadToken()
    return t && t.expiresAt > Date.now() ? t : null
  }

  async connectDrive(): Promise<void> {
    // an explicit click earns a clean slate: drop any backoff left over from
    // the failures that made the user come here in the first place
    this.disarmGestureRetry()
    this.silentFailures = 0
    this.nextSilentAt = 0
    await this.requestToken('consent') // acceptToken() does the bookkeeping
  }

  async disconnectDrive(): Promise<void> {
    this.disarmGestureRetry()
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.wakeTimer = null
    this.silentFailures = 0
    this.nextSilentAt = 0
    const token = this.loadToken()
    if (token) {
      try {
        const google = await loadGis()
        google.accounts.oauth2.revoke(token.accessToken)
      } catch {
        // revocation is best-effort; local disconnect proceeds regardless
      }
    }
    this.saveToken(null)
    setDriveConsent(false)
    this.setReauthNeeded(false)
    this.notify()
  }
}

/* ---------------- mock (no credentials configured) ---------------- */

/** Exact steps shown in the UI when Google credentials are not configured. */
export const GOOGLE_SETUP_INSTRUCTIONS = [
  'Create an OAuth "Web application" client in Google Cloud Console → APIs & Services → Credentials.',
  `Add ${typeof window !== 'undefined' ? window.location.origin : 'your deploy URL'} to "Authorized JavaScript origins".`,
  'Enable the Google Drive API under APIs & Services → Library.',
  'On Vercel: Project → Settings → Environment Variables → set VITE_GOOGLE_CLIENT_ID (Production) to the client id.',
  'Redeploy — VITE_* variables are baked in at build time, so an existing build will not pick them up.',
] as const

class MockAuthService implements AuthService {
  readonly kind = 'mock' as const

  async signIn(): Promise<Account> {
    /**
     * Resolved through the same store as a real sign-in, so the local
     * account is a user like any other — but its claim is UNVERIFIED, and
     * that is load-bearing: a local account claiming an address must never
     * converge onto the real account that owns it.
     */
    const { user } = identityStore.resolve({
      provider: 'mock',
      providerSubject: MOCK_SUBJECT,
      email: 'local@lattice.dev',
      emailVerified: false,
      displayName: 'Local User',
      avatarUrl: '',
    })
    const existing = loadAccount()
    if (existing) return existing
    const now = Date.now()
    const account: Account = {
      id: user.id,
      name: 'Local User',
      email: 'local@lattice.dev',
      avatarUrl: '',
      providers: providerIdsOf(identityStore.identitiesOf(user.id)),
      // there is no provider profile behind a local account, so an edited
      // name has nothing to be reset to — the panel says so rather than
      // offering a reset that would do nothing
      createdAt: now,
      updatedAt: now,
    }
    saveAccount(account)
    return account
  }

  async signOut(): Promise<void> {
    saveAccount(null)
  }

  restore(): Account | null {
    return restoreAccount()
  }

  async getAccessToken(): Promise<string | null> {
    return null // mock accounts never unlock cloud APIs — no fake sync
  }

  peekToken(): StoredToken | null {
    return null
  }

  needsReauth(): boolean {
    return false // there is no cloud session to restore
  }

  subscribe(): () => void {
    return () => {} // token state never changes
  }

  async connectDrive(): Promise<void> {
    throw new Error(
      'Google Drive is unavailable: VITE_GOOGLE_CLIENT_ID is not configured in this build.',
    )
  }

  async disconnectDrive(): Promise<void> {
    // nothing to disconnect — mock accounts never hold a Drive token
  }
}

/** The active auth implementation, chosen by configuration at build time. */
export const authService: AuthService = hasGoogleAuth
  ? new GoogleAuthService()
  : new MockAuthService()

import { env, hasGoogleAuth } from '@/lib/env'
import { nid } from '@/lib/id'
import type { Account } from '@/types/model'

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
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPES = `openid email profile ${DRIVE_SCOPE}`
/** Renew this long before expiry, so background work never hits the cliff. */
const RENEW_AHEAD_MS = 5 * 60_000
/** A silent round-trip that never answers must not block the next one. */
const SILENT_TIMEOUT_MS = 30_000

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
  requestAccessToken(opts?: { prompt?: string }): void
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
  private listeners = new Set<() => void>()

  private loadToken(): StoredToken | null {
    try {
      const raw = localStorage.getItem(TOKEN_KEY)
      if (!raw) return null
      const t = JSON.parse(raw) as StoredToken
      return t.accessToken && t.expiresAt ? t : null
    } catch {
      return null
    }
  }

  private saveToken(token: StoredToken | null) {
    if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
    else localStorage.removeItem(TOKEN_KEY)
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
              reject(new Error('Google did not answer the silent token refresh.')),
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
                  new Error(
                    resp.error
                      ? describeAuthError(resp.error, resp.error_description)
                      : 'Google sign-in was cancelled',
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
            this.saveToken(token)
            finish(() => resolve(token))
          }
          client.requestAccessToken({ prompt })
        })
        .catch((err: unknown) => {
          finish(() => reject(err instanceof Error ? err : new Error(String(err))))
        })
    })
  }

  /**
   * Silent refresh, popup-safe. Without transient user activation the
   * browser blocks the GIS window, so we skip the call entirely — no
   * blocked-popup noise, no bogus "signed out" — and retry on the next
   * gesture instead. Callers get null and stay honest in the meantime.
   */
  private async refreshSilently(): Promise<StoredToken | null> {
    // no token ever stored → consent was never granted: only "Connect Drive"
    // can help, and it must come from a real click.
    if (!this.loadToken()) {
      this.setReauthNeeded(true)
      return null
    }
    if (!hasUserActivation()) {
      this.armGestureRetry()
      return null
    }
    try {
      const token = await this.requestToken('')
      this.setReauthNeeded(false)
      this.notify()
      return token
    } catch {
      this.setReauthNeeded(true)
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
    const account: Account = {
      id: existing?.id ?? `acc_${info.sub}`,
      name: info.name ?? 'Google user',
      email: info.email ?? '',
      avatarUrl: info.picture ?? '',
      providers: [...new Set([...(existing?.providers ?? []), 'google' as const])],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    saveAccount(account)
    this.setReauthNeeded(false)
    this.notify()
    return account
  }

  async signOut(): Promise<void> {
    await this.disconnectDrive()
    saveAccount(null)
  }

  restore(): Account | null {
    return loadAccount()
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
    this.disarmGestureRetry()
    await this.requestToken('consent')
    this.setReauthNeeded(false)
    this.notify()
  }

  async disconnectDrive(): Promise<void> {
    this.disarmGestureRetry()
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
    const existing = loadAccount()
    if (existing) return existing
    const now = Date.now()
    const account: Account = {
      id: nid('acc'),
      name: 'Local User',
      email: 'local@lattice.dev',
      avatarUrl: '',
      providers: ['mock'],
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
    return loadAccount()
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

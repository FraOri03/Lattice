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
}

const ACCOUNT_KEY = 'lattice-account'
const TOKEN_KEY = 'lattice-google-token'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPES =
  'openid email profile https://www.googleapis.com/auth/drive.file'

interface StoredToken {
  accessToken: string
  /** epoch ms after which the token is considered dead */
  expiresAt: number
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
  error?: string
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

class GoogleAuthService implements AuthService {
  readonly kind = 'google' as const
  private tokenClient: TokenClient | null = null

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
    })
    return this.tokenClient
  }

  /** One token round-trip through GIS. prompt '' = silent when possible. */
  private requestToken(prompt: '' | 'consent'): Promise<StoredToken> {
    return new Promise((resolve, reject) => {
      void this.client()
        .then((client) => {
          client.callback = (resp) => {
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error || 'Google sign-in was cancelled'))
              return
            }
            const token: StoredToken = {
              accessToken: resp.access_token,
              // refresh 60s before the real expiry
              expiresAt: Date.now() + ((resp.expires_in ?? 3600) - 60) * 1000,
            }
            this.saveToken(token)
            resolve(token)
          }
          client.requestAccessToken({ prompt })
        })
        .catch(reject)
    })
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
    return account
  }

  async signOut(): Promise<void> {
    const token = this.loadToken()
    if (token) {
      try {
        const google = await loadGis()
        google.accounts.oauth2.revoke(token.accessToken)
      } catch {
        // revocation is best-effort; local sign-out proceeds regardless
      }
    }
    this.saveToken(null)
    saveAccount(null)
  }

  restore(): Account | null {
    return loadAccount()
  }

  async getAccessToken(): Promise<string | null> {
    const cached = this.loadToken()
    if (cached && cached.expiresAt > Date.now()) return cached.accessToken
    if (!loadAccount()) return null
    try {
      const token = await this.requestToken('')
      return token.accessToken
    } catch {
      return null // silent refresh needs interaction — caller shows "reconnect"
    }
  }
}

/* ---------------- mock (no credentials configured) ---------------- */

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
}

/** The active auth implementation, chosen by configuration at build time. */
export const authService: AuthService = hasGoogleAuth
  ? new GoogleAuthService()
  : new MockAuthService()

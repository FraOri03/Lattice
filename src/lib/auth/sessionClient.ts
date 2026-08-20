import type { SessionInfo } from '@/types/session'
import { CSRF_HEADER } from '@/types/session'

/**
 * The browser half of the Lattice session (Phase 17.2, #85).
 *
 * The app used to authenticate every API call by putting its Google OAuth
 * access token in the request body. That made a Google credential the
 * application's credential: it sat in `localStorage` where any script could
 * read it, it travelled on every realtime call, and no one could end a
 * session because nothing had ever issued one.
 *
 * Now the server issues a session and puts it in an HttpOnly cookie. This
 * module never sees that cookie — it cannot, which is the point. What it
 * holds is the CSRF token, in memory only, for the life of the tab.
 *
 * ## Session first, Google token second
 *
 * {@link SessionClient.post} tries the session and falls back to the old
 * body-token path. That fallback is not decoration: a deployment with no
 * database configured, or a browser that has not exchanged its token yet,
 * has to keep working. 17.3 is where the fallback goes away.
 */

const SESSION_URL = '/api/session'

/** Thrown when neither a session nor a Google token can authenticate a call. */
export class NotAuthenticatedError extends Error {}

class SessionClient {
  private info: SessionInfo | null = null
  /** The in-flight "who am I", so a burst of calls makes one request. */
  private probe: Promise<SessionInfo | null> | null = null
  /**
   * False once the server has said it has no database. Sticky on purpose:
   * re-asking on every call would put a doomed round-trip in front of every
   * realtime message.
   */
  private supported = true
  /**
   * True once a probe came back 401. A browser with no session stays
   * without one until something establishes it, and every path that could
   * (`establish`, `signInWithEmailCode`, `reset`) clears this.
   */
  private probed = false
  private listeners = new Set<() => void>()

  current(): SessionInfo | null {
    return this.info
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // a broken listener must never break authentication
      }
    }
  }

  /** True when a live server session backs this browser. */
  async ready(): Promise<boolean> {
    return (await this.ensure()) !== null
  }

  /** What we know, asking the server once if we do not know yet. */
  private async ensure(): Promise<SessionInfo | null> {
    if (this.info) return this.info
    if (!this.supported || this.probed) return null
    if (this.probe) return this.probe
    this.probe = this.whoAmI().finally(() => {
      this.probe = null
    })
    return this.probe
  }

  private async whoAmI(): Promise<SessionInfo | null> {
    try {
      const res = await fetch(SESSION_URL, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (res.status === 501) {
        // no database on this deployment: stop asking
        this.supported = false
        return null
      }
      /**
       * 401 is "this browser has no session", which does not change on its
       * own — so remembering it is the difference between one probe and one
       * per call. Anything that WOULD change it (`establish`, an OTP
       * sign-in, `reset`) clears the flag, so a real sign-in still works
       * immediately.
       *
       * Without this, a browser signed in with the local demo account
       * re-asked on every request that went through `post`, which 18.x made
       * frequent enough to fill a console.
       */
      if (res.status === 401) {
        this.probed = true
        return null
      }
      if (!res.ok) return null
      const info = (await res.json()) as SessionInfo
      this.info = info
      this.notify()
      return info
    } catch {
      // offline, or the endpoint does not exist yet: the caller falls back
      return null
    }
  }

  /**
   * Exchange a verified Google token for a session. Called once, right
   * after sign-in — from then on the Google token is a Drive credential
   * and nothing else.
   *
   * Returns null when the deployment has no database, which is a valid
   * configuration and not an error.
   */
  async establish(googleToken: string): Promise<SessionInfo | null> {
    try {
      const res = await fetch(SESSION_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', googleToken }),
      })
      if (res.status === 501) {
        this.supported = false
        return null
      }
      if (!res.ok) return null
      const info = (await res.json()) as SessionInfo
      this.info = info
      this.supported = true
      this.probed = false
      this.notify()
      return info
    } catch {
      return null
    }
  }

  /* ---------------- e-mail one-time codes (17.3, #86) ---------------- */

  /**
   * Ask for a sign-in code.
   *
   * `'sent'` does NOT mean an account exists, or even that delivery
   * succeeded — the server answers identically either way, on purpose, so
   * that this call cannot be used to discover who has an account. The only
   * distinguishable outcome is `'unavailable'`, which is about the SERVER
   * having no mail transport and says nothing about the address.
   */
  async requestEmailCode(
    email: string,
    locale?: string,
  ): Promise<'sent' | 'unavailable' | 'error'> {
    try {
      const res = await fetch(SESSION_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        // the language the message is written in, and nothing else: it is
        // never used to decide anything, so a wrong one costs a translation
        body: JSON.stringify({ action: 'otp-request', email, locale }),
      })
      if (res.status === 501) return 'unavailable'
      return res.ok ? 'sent' : 'error'
    } catch {
      return 'error'
    }
  }

  /**
   * Exchange an address and its code for a session.
   *
   * Null on every failure, because the server distinguishes none of them:
   * no code, expired, wrong digits and out of attempts all answer the same.
   */
  async signInWithEmailCode(email: string, code: string): Promise<SessionInfo | null> {
    try {
      const res = await fetch(SESSION_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'otp-verify', email, code }),
      })
      if (!res.ok) return null
      const info = (await res.json()) as SessionInfo
      this.info = info
      this.supported = true
      this.probed = false
      this.notify()
      return info
    } catch {
      return null
    }
  }

  /** Sign out this device. */
  async logout(): Promise<void> {
    await this.revoke('logout')
  }

  /**
   * End a session no one in this browser is signed in to (#257).
   *
   * The cookie is HttpOnly, so the only local evidence of a session is the
   * stored account — and the two can come apart. {@link revoke} swallows
   * every network failure, so a sign-out performed offline clears the account
   * and leaves the session alive; clearing site data by hand does the same.
   * What is left is a browser that shows the login screen while `/api/shared`
   * and `/api/invitations` still answer for the departed user: their shared
   * projects, the addresses their invitations were sent to, and the ability
   * to accept those invitations on their behalf.
   *
   * Nothing in Lattice restores an account FROM the cookie, so a session with
   * no account is unusable as well as unsafe. It is ended, not adopted.
   */
  async discardOrphanSession(): Promise<void> {
    await this.revoke('logout')
  }

  /**
   * Sign out everywhere. Returns how many sessions ended, so the UI can
   * report what happened instead of guessing.
   */
  async logoutEverywhere(): Promise<number> {
    return this.revoke('logout-all')
  }

  private async revoke(action: 'logout' | 'logout-all'): Promise<number> {
    const info = await this.ensure()
    // forget locally first: a failed round-trip must not leave a UI that
    // believes it is still signed in
    this.info = null
    this.notify()
    if (!info) return 0
    try {
      const res = await fetch(SESSION_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          [CSRF_HEADER]: info.csrfToken,
        },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) return 0
      const body = (await res.json()) as { revoked?: number }
      return body.revoked ?? 0
    } catch {
      return 0
    }
  }

  /**
   * POST to an API endpoint, authenticated.
   *
   * The session is tried first and the body carries no credential at all.
   * When there is no session, `fallbackToken` supplies the Google token the
   * endpoint still accepts — each caller passes its own, because each has
   * its own way of explaining a missing one.
   */
  async post(
    url: string,
    body: Record<string, unknown>,
    fallbackToken: () => Promise<string | null>,
  ): Promise<Response> {
    const info = await this.ensure()
    if (info) {
      const res = await this.postWithSession(url, body, info)
      // 401/403 means the session died under us (revoked elsewhere, expired,
      // or a rotated CSRF token). Re-probe once before giving up on it.
      if (res.status !== 401 && res.status !== 403) return res
      this.info = null
      const fresh = await this.ensure()
      if (fresh) return this.postWithSession(url, body, fresh)
    }

    const googleToken = await fallbackToken()
    if (!googleToken) {
      throw new NotAuthenticatedError('Not signed in.')
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, googleToken }),
    })
  }

  private postWithSession(
    url: string,
    body: Record<string, unknown>,
    info: SessionInfo,
  ): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER]: info.csrfToken,
      },
      body: JSON.stringify(body),
    })
  }

  /** Drop everything we believe — tests, and sign-out. */
  reset(): void {
    this.info = null
    this.probe = null
    this.supported = true
    this.probed = false
    this.notify()
  }
}

export const sessionClient = new SessionClient()

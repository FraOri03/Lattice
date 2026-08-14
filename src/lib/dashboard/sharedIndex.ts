import { useEffect, useState } from 'react'
import { authService } from '@/lib/auth/AuthService'
import { NotAuthenticatedError, sessionClient } from '@/lib/auth/sessionClient'
import { EMPTY_SHARED_INDEX, type SharedIndex } from '@/types/shared'

/**
 * The shared-projects index, client side (Phase 18.4, #91).
 *
 * The dashboard asked two questions it could not answer — "what has anyone
 * shared with me" and "what is waiting for my address" — and said so rather
 * than showing an empty page. `/api/shared` answers both; this fetches it
 * once per session and hands the same answer to every surface that asks.
 *
 * `unavailable` is a first-class state, not an error. A deployment with no
 * database, or a browser with no session, genuinely cannot be told — and the
 * pages that read this keep their honest copy for exactly that case instead
 * of rendering "nothing shared with you", which would be a different and
 * false claim.
 */

const SHARED_URL = '/api/shared'
const INVITATIONS_URL = '/api/invitations'

export interface IndexState {
  index: SharedIndex
  loading: boolean
  /** True when the server cannot answer at all — not when it answered "none". */
  unavailable: boolean
  /**
   * Whether an answer has arrived at all.
   *
   * Separate from `loading` because the honest reading of "not yet asked" is
   * the same as "cannot be asked": until the server has replied, a page must
   * not say "nothing is waiting for you". Not knowing and knowing there is
   * nothing are different claims, and only one of them is safe to make early.
   */
  loaded: boolean
}

export interface InviteAction {
  ok: boolean
  error?: string
}

class SharedIndexService {
  private state: IndexState = {
    index: EMPTY_SHARED_INDEX,
    loading: false,
    unavailable: false,
    loaded: false,
  }
  private inflight: Promise<void> | null = null
  private listeners = new Set<() => void>()

  current(): IndexState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<IndexState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // a broken subscriber must not break the others
      }
    }
  }

  /** Ask once per session unless something changed it. */
  async load(force = false): Promise<void> {
    if (this.inflight) return this.inflight
    if (this.state.loaded && !force) return
    this.set({ loading: true })
    this.inflight = this.fetch().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async fetch(): Promise<void> {
    try {
      const res = await sessionClient.post(SHARED_URL, { action: 'index' }, () =>
        authService.getAccessToken(),
      )
      if (!res.ok) {
        // 501 (no database) and 401 (no session) are the same fact to a
        // reader: this deployment cannot answer for you
        this.set({
          loading: false,
          loaded: true,
          unavailable: true,
          index: EMPTY_SHARED_INDEX,
        })
        return
      }
      this.set({
        loading: false,
        loaded: true,
        unavailable: false,
        index: (await res.json()) as SharedIndex,
      })
    } catch (err) {
      if (!(err instanceof NotAuthenticatedError)) {
        console.warn('[dashboard/shared] index failed:', err)
      }
      this.set({
        loading: false,
        loaded: true,
        unavailable: true,
        index: EMPTY_SHARED_INDEX,
      })
    }
  }

  /**
   * Accept a listed invitation.
   *
   * By id, with no link: the address check 18.3 performs is the gate, and it
   * is satisfied by the same verified identities that produced this listing.
   * The token proves a mailbox received something — which this caller has
   * already proved by other means.
   */
  accept(inviteId: string): Promise<InviteAction> {
    return this.act({ action: 'accept', inviteId })
  }

  /** Say no to one, which is the recipient's answer and not a revocation. */
  decline(inviteId: string): Promise<InviteAction> {
    return this.act({ action: 'decline', inviteId })
  }

  private async act(body: Record<string, unknown>): Promise<InviteAction> {
    try {
      const res = await sessionClient.post(INVITATIONS_URL, body, () =>
        authService.getAccessToken(),
      )
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        return { ok: false, error: payload?.error ?? `Request failed (${res.status})` }
      }
      // the list just changed, so the next reader gets the new one
      await this.load(true)
      return { ok: true }
    } catch (err) {
      if (err instanceof NotAuthenticatedError) {
        return { ok: false, error: 'Sign in to answer this invitation.' }
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Forget everything — sign-out, and tests. */
  reset(): void {
    this.state = {
      index: EMPTY_SHARED_INDEX,
      loading: false,
      unavailable: false,
      loaded: false,
    }
  }
}

export const sharedIndex = new SharedIndexService()

/** Subscribe a component to the index, loading it on first use. */
export function useSharedIndex(): IndexState {
  const [state, setState] = useState(sharedIndex.current())
  useEffect(() => {
    const unsubscribe = sharedIndex.subscribe(() => setState(sharedIndex.current()))
    void sharedIndex.load()
    return unsubscribe
  }, [])
  return state
}

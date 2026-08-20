import { useEffect, useSyncExternalStore } from 'react'
import { authService, loadStoredAccount } from '@/lib/auth/AuthService'
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

/** The state a service that has never asked anybody anything is in. */
const BLANK: IndexState = {
  index: EMPTY_SHARED_INDEX,
  loading: false,
  unavailable: false,
  loaded: false,
}

class SharedIndexService {
  private state: IndexState = BLANK
  private inflight: Promise<void> | null = null
  /**
   * Bumped by {@link reset}. A fetch started for the previous account can
   * still be in the air when someone signs out, and its reply must not be
   * written over the blank state that sign-out just installed.
   */
  private generation = 0
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
    this.notify()
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

  /** The state of a question this browser has no standing to ask. */
  private static readonly UNANSWERABLE: Partial<IndexState> = {
    loading: false,
    loaded: true,
    unavailable: true,
    index: EMPTY_SHARED_INDEX,
  }

  private async fetch(): Promise<void> {
    const started = this.generation
    /** Drop an answer that belongs to whoever was signed in when it was asked. */
    const settle = (patch: Partial<IndexState>) => {
      if (this.generation !== started) return
      this.set(patch)
    }
    /**
     * No account here, no question to ask (#257).
     *
     * This used to load on mount with no gate at all, and the credential it
     * travels on is an HttpOnly cookie the client cannot see. A browser whose
     * sign-out never reached the network is locally signed out and still
     * server-authenticated, so "Shared with me" and "Invites" answered for the
     * person who left — their projects, the addresses their invitations went
     * to, and a button that accepts one. `AccountProvider` revokes such a
     * session on boot; this refuses to read it in the meantime.
     */
    if (!loadStoredAccount()) {
      settle(SharedIndexService.UNANSWERABLE)
      return
    }
    try {
      const res = await sessionClient.post(SHARED_URL, { action: 'index' }, () =>
        authService.getAccessToken(),
      )
      if (!res.ok) {
        // 501 (no database) and 401 (no session) are the same fact to a
        // reader: this deployment cannot answer for you
        settle(SharedIndexService.UNANSWERABLE)
        return
      }
      const index = (await res.json()) as SharedIndex
      settle({ loading: false, loaded: true, unavailable: false, index })
    } catch (err) {
      if (!(err instanceof NotAuthenticatedError)) {
        console.warn('[dashboard/shared] index failed:', err)
      }
      settle(SharedIndexService.UNANSWERABLE)
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
    // an invitation is answered by its recipient, and this browser cannot
    // name one — see `fetch` for the session that would otherwise answer
    if (!loadStoredAccount()) {
      return { ok: false, error: 'Sign in to answer this invitation.' }
    }
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

  /**
   * Forget everything — a sign-in, a sign-out, and tests.
   *
   * This index is about ONE person: the projects shared with them and the
   * invitations waiting for their addresses. Nothing about it survives a
   * change of account, and the service is a module singleton that outlives
   * one — the app never reloads on sign-out, so without this the next person
   * to sign in on this browser reads the last one's list.
   *
   * Three things have to go, and forgetting any one of them leaves the leak
   * open: the state, the mounted readers' copy of it (hence `notify`, which
   * this used not to do), and any reply still in the air (hence the
   * generation, which `fetch` checks before writing).
   */
  reset(): void {
    this.generation += 1
    this.inflight = null
    this.state = BLANK
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // a broken subscriber must not break the others
      }
    }
  }
}

export const sharedIndex = new SharedIndexService()

/**
 * Subscribe a component to the index, loading it on first use.
 *
 * `useSyncExternalStore` rather than `useState` + `subscribe`: the service is
 * a singleton that several pages read, so a change landing between a
 * component's render and its effect would otherwise be missed entirely — and
 * the state it would be stuck on is `loaded: false`, which renders the "this
 * cannot be answered" block over an answer that has already arrived.
 */
export function useSharedIndex(): IndexState {
  const state = useSyncExternalStore(
    (listener) => sharedIndex.subscribe(listener),
    () => sharedIndex.current(),
    () => sharedIndex.current(),
  )
  useEffect(() => {
    void sharedIndex.load()
  }, [])
  return state
}

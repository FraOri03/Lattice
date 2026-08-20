import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { SharedIndex } from '@/types/shared'

/**
 * The shared index belongs to ONE account, and the app never reloads.
 *
 * `sharedIndex` is a module singleton: sign-out replaces the account but not
 * the service, so everything it holds — the projects shared with the previous
 * person and the invitations sent to their addresses — is still there for
 * whoever signs in next on the same browser. These tests pin the three things
 * that have to go, because forgetting any one of them leaves the leak open.
 */

class FakeNotAuthenticated extends Error {}

type PostFn = (...args: unknown[]) => Promise<Response>

/** Resolved by the test to control when a reply lands. */
let answer: (index: SharedIndex) => void = () => {}
let post: Mock<PostFn>

vi.mock('@/lib/auth/sessionClient', () => ({
  NotAuthenticatedError: FakeNotAuthenticated,
  sessionClient: {
    post: (...args: unknown[]) => post(...args),
  },
}))

/** Whether this browser has an account of its own, per test. */
let storedAccount: { id: string } | null = { id: 'usr_ada' }

vi.mock('@/lib/auth/AuthService', () => ({
  authService: { getAccessToken: async () => 'tok' },
  loadStoredAccount: () => storedAccount,
}))

const { sharedIndex } = await import('./sharedIndex')

const index = (over: Partial<SharedIndex> = {}): SharedIndex => ({
  projects: [{ projectId: 'p1', role: 'editor', ownerEmail: 'ada@example.com', claimed: true }],
  invitations: [],
  addresses: ['ada@example.com'],
  ...over,
})

const replyWith = (payload: SharedIndex): Response =>
  ({ ok: true, json: async () => payload }) as unknown as Response

/** A reply the test hands over on demand, so a load can be left in flight. */
function deferredPost(): void {
  post = vi.fn<PostFn>(
    () =>
      new Promise<Response>((resolve) => {
        answer = (payload) => resolve(replyWith(payload))
      }),
  )
}

describe('sharedIndex', () => {
  beforeEach(() => {
    storedAccount = { id: 'usr_ada' }
    post = vi.fn<PostFn>(async () => replyWith(index()))
    sharedIndex.reset()
  })

  it('answers with what the server said', async () => {
    await sharedIndex.load()
    expect(sharedIndex.current()).toMatchObject({ loaded: true, unavailable: false })
    expect(sharedIndex.current().index.addresses).toEqual(['ada@example.com'])
  })

  it('forgets the previous account on reset', async () => {
    await sharedIndex.load()
    sharedIndex.reset()

    const state = sharedIndex.current()
    expect(state.index.projects).toEqual([])
    expect(state.index.addresses).toEqual([])
    // `loaded: false` matters as much as the empty index: a page that reads
    // `loaded` renders "nothing is shared with you" on an empty one, which is
    // a claim nobody has checked for the account that just arrived
    expect(state.loaded).toBe(false)
  })

  it('tells its readers that it forgot', async () => {
    await sharedIndex.load()
    const seen: boolean[] = []
    sharedIndex.subscribe(() => seen.push(sharedIndex.current().loaded))

    sharedIndex.reset()

    // without this the mounted dashboard keeps rendering the state it last
    // heard about, which is the departing account's list
    expect(seen).toEqual([false])
  })

  it('drops a reply that belongs to the account that just left', async () => {
    deferredPost()
    const inflight = sharedIndex.load()

    sharedIndex.reset()
    answer(index({ addresses: ['ada@example.com'] }))
    await inflight

    expect(sharedIndex.current().index.addresses).toEqual([])
    expect(sharedIndex.current().loaded).toBe(false)
  })

  it('asks again after a reset, for the account that arrived', async () => {
    await sharedIndex.load()
    expect(post).toHaveBeenCalledTimes(1)

    // load() is a once-per-session cache; the reset is what re-opens it, or
    // the new account reads the old answer forever
    await sharedIndex.load()
    expect(post).toHaveBeenCalledTimes(1)

    sharedIndex.reset()
    await sharedIndex.load()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('reports a server that cannot answer as unavailable, not as empty', async () => {
    post = vi.fn<PostFn>(async () => ({ ok: false, status: 501 }) as unknown as Response)
    await sharedIndex.load()
    expect(sharedIndex.current()).toMatchObject({ loaded: true, unavailable: true })
  })

  it('treats a caller with no credentials the same way, and does not shout', async () => {
    post = vi.fn<PostFn>(async () => {
      throw new FakeNotAuthenticated('Not signed in.')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await sharedIndex.load()
    expect(sharedIndex.current().unavailable).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  /**
   * #257 — the credential this travels on is an HttpOnly cookie, so a browser
   * whose sign-out never reached the network is locally signed out and still
   * server-authenticated. Asking at all was the leak: the reply would have
   * been the departed user's projects and the addresses their invitations
   * were sent to, rendered under a login screen.
   */
  describe('with no account in this browser', () => {
    it('does not ask the server who it is', async () => {
      storedAccount = null
      await sharedIndex.load()
      expect(post).not.toHaveBeenCalled()
      expect(sharedIndex.current()).toMatchObject({ loaded: true, unavailable: true })
      expect(sharedIndex.current().index.projects).toEqual([])
    })

    it('refuses to answer an invitation', async () => {
      storedAccount = null
      const outcome = await sharedIndex.accept('inv_1')
      expect(outcome.ok).toBe(false)
      expect(post).not.toHaveBeenCalled()
    })

    it('asks again once somebody signs in', async () => {
      storedAccount = null
      await sharedIndex.load()
      expect(post).not.toHaveBeenCalled()

      storedAccount = { id: 'usr_ada' }
      sharedIndex.reset()
      await sharedIndex.load()
      expect(post).toHaveBeenCalledTimes(1)
      expect(sharedIndex.current().index.addresses).toEqual(['ada@example.com'])
    })
  })
})

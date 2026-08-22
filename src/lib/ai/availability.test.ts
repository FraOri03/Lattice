import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the surface renders before anything is pressed.
 *
 * The failure this file exists to prevent is a single "AI is unavailable"
 * covering four different problems with four different remedies. So the
 * assertions are about which sentence the user gets, and every one of them
 * is reachable from a configuration a real deployment is actually in.
 */

vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  hasHostedAiBackend: false,
}))

const { aiAvailability, aiAvailabilityAll, aiSurfaceState } = await import('./availability')
const { setByokKey, clearAllByokKeys } = await import('./byok')
const { grantConsent, clearConsentHistory } = await import('./consent')

/** A machine with a network and somebody signed in — the uninteresting case. */
const ONLINE = { online: true, signedIn: true }

beforeEach(() => {
  localStorage.clear()
  clearAllByokKeys()
  clearConsentHistory()
})

describe('a deployment with no AI at all', () => {
  it('says the deployment runs nothing, for the actions no key could unlock', () => {
    const upscale = aiAvailability('upscale', ONLINE)
    expect(upscale.runnable).toBe(false)
    expect(upscale.blocked).toBe('not-configured')
    // and it does not offer a remedy that does not exist
    expect(upscale.byok).toEqual([])
  })

  /**
   * A different sentence, because it is a different problem: nobody here runs
   * it, but a vendor would, on a key the user can add in the next control
   * down. Collapsing the two is how a feature becomes a dead button.
   */
  it('points at the key that would help, for the action a vendor sells', () => {
    // design-set falls through to the on-device templates, so ask about the
    // state the surface is in when the templates are the answer
    const design = aiAvailability('design-set', ONLINE)
    expect(design.runnable).toBe(true)
    expect(design.disclosure.destination).toBe('device')
    expect(design.disclosure.cost).toBe('free')
  })

  it('is on-device rather than unavailable, because something still works', () => {
    expect(aiSurfaceState(ONLINE)).toBe('on-device')
  })
})

describe('with a key of the user’s own', () => {
  beforeEach(() => setByokKey('gemini', 'a-key'))

  it('runs the action on the vendor, and says whose bill it is', () => {
    const design = aiAvailability('design-set', ONLINE)
    expect(design.runnable).toBe(true)
    expect(design.disclosure).toMatchObject({ destination: 'third-party', cost: 'your-key' })
    expect(design.consent).toEqual({ destination: 'third-party', vendor: 'google-gemini' })
  })

  it('asks for consent first, and stops asking once it has it', () => {
    expect(aiAvailability('design-set', ONLINE).needsConsent).toBe(true)
    grantConsent({ destination: 'third-party', vendor: 'google-gemini' })
    expect(aiAvailability('design-set', ONLINE).needsConsent).toBe(false)
  })

  /** A missing grant is a question, not a block: the surface asks it. */
  it('does not call a missing grant a blocked action', () => {
    const design = aiAvailability('design-set', ONLINE)
    expect(design.needsConsent).toBe(true)
    expect(design.blocked).toBeNull()
    expect(design.runnable).toBe(true)
  })

  it('reports the surface as running on the user’s account', () => {
    expect(aiSurfaceState(ONLINE)).toBe('your-key')
  })

  it('still knows a provider that sends nothing could answer instead', () => {
    expect(aiAvailability('design-set', ONLINE).localFallback).toBe(true)
  })
})

describe('offline', () => {
  beforeEach(() => setByokKey('gemini', 'a-key'))

  /**
   * The decision this phase owed: refused with a sentence, never queued. A
   * job carries a wall-clock deadline and an expiring ticket, so an outbox
   * would hold work guaranteed to time out when released — while holding
   * someone's photograph in the meantime.
   */
  it('refuses the action that needs the network, and names why', () => {
    const design = aiAvailability('design-set', { online: false, signedIn: true })
    expect(design.blocked).toBe('offline')
    expect(design.runnable).toBe(false)
  })

  it('leaves the on-device answer reachable', () => {
    expect(aiAvailability('design-set', { online: false, signedIn: true }).localFallback).toBe(true)
  })
})

describe('a hosted backend nobody is signed in to', () => {
  it('is blocked on the sign-in rather than reported as working', async () => {
    vi.resetModules()
    vi.doMock('@/lib/env', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/env')>()),
      hasHostedAiBackend: true,
    }))
    const hosted = await import('./availability')

    const signedOut = hosted.aiAvailability('upscale', { online: true, signedIn: false })
    expect(signedOut.blocked).toBe('sign-in')

    const signedIn = hosted.aiAvailability('upscale', { online: true, signedIn: true })
    expect(signedIn.blocked).toBeNull()
    expect(signedIn.disclosure).toMatchObject({ destination: 'deployment', cost: 'deployment' })
    expect(hosted.aiSurfaceState({ online: true, signedIn: true })).toBe('ready')

    vi.doUnmock('@/lib/env')
    vi.resetModules()
  })
})

describe('the whole catalogue', () => {
  it('answers for every action, so no row of the surface is left undecided', () => {
    const all = aiAvailabilityAll(ONLINE)
    expect(all).toHaveLength(6)
    for (const entry of all) {
      expect(entry.runnable === (entry.blocked === null)).toBe(true)
      expect(entry.carries).toBeTruthy()
    }
  })

  it('carries the estimate for the GPU actions and nothing for the others', () => {
    const all = aiAvailabilityAll(ONLINE)
    expect(all.find((a) => a.actionId === 'upscale')!.cost).not.toBeNull()
    expect(all.find((a) => a.actionId === 'design-set')!.cost).toBeNull()
  })
})

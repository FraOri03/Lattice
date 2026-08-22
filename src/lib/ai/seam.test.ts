import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The contract, checked against the thing that proves it is a contract: an
 * implementation written from nothing but the interface, with no network
 * behind it.
 *
 * A seam nobody has implemented twice is a description of one backend. The
 * fixture below is the second implementation, and it exists in this file
 * rather than in `src/` because 21.9 owns the fake provider the rest of the
 * suite will share — this one only has to prove the interface is
 * implementable.
 */

// Only the one flag: replacing the whole module would take `hasGoogleAuth`
// with it, and half the app is constructed from that at import time.
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  hasHostedAiBackend: false,
}))

const { AI_ACTIONS, AI_ACTION_IDS, dataCarriedBy } = await import('./actions')
const { AI_SETUP_NOTE, AiJobError, DisabledAiProvider } = await import('./AiBackendProvider')
const { immediateJob } = await import('./immediateJob')
const { resolveAiProvider, OfflineSetDesignProvider, GeminiSetDesignProvider } = await import(
  './index'
)
const { setSetDesignKey } = await import('./providers/GeminiSetDesignProvider')
import type { AiBackendProvider } from './AiBackendProvider'

beforeEach(() => {
  setSetDesignKey('')
})

/* ---------------- the honest default ---------------- */

describe('DisabledAiProvider', () => {
  it('refuses every action in the catalogue', () => {
    for (const id of AI_ACTION_IDS) expect(DisabledAiProvider.canRun(id)).toBe(false)
  })

  it('throws a message that names what would have to be configured', async () => {
    const thrown = await DisabledAiProvider.submit({
      actionId: 'text-to-image',
      projectId: 'p1',
      params: {},
    }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(thrown).toBeInstanceOf(AiJobError)
    const err = thrown as InstanceType<typeof AiJobError>
    expect(err.failure.reason).toBe('not-configured')
    expect(err.message).toBe(AI_SETUP_NOTE)
    expect(err.message).toMatch(/RUNPOD_API_KEY/)
    expect(err.message).toMatch(/ComfyUI/)
  })

  it('reports itself unconfigured rather than empty', async () => {
    expect(await DisabledAiProvider.capabilities()).toMatchObject({
      configured: false,
      reason: 'not-configured',
    })
  })

  it('sends nothing anywhere', () => {
    expect(DisabledAiProvider.requiresUpload).toBe(false)
    expect(DisabledAiProvider.disclosure).toEqual({ destination: 'device', cost: 'free' })
  })
})

/* ---------------- a second implementation ---------------- */

/**
 * Written against the interface and nothing else: no fetch, no endpoint, no
 * vendor. If this compiles and runs, the seam is a contract rather than a
 * description of RunPod.
 */
function fixtureProvider(answer: string): AiBackendProvider {
  return {
    id: 'local',
    label: 'Fixture',
    requiresUpload: false,
    disclosure: { destination: 'device', cost: 'free' },
    canRun: () => true,
    capabilities: async () => ({ configured: true, actions: AI_ACTION_IDS }),
    submit: async (req, opts = {}) =>
      immediateJob({
        jobId: 'fixture-1',
        actionId: req.actionId,
        deadlineMs: AI_ACTIONS[req.actionId].deadlineMs,
        opts,
        run: async () => ({
          jobId: 'fixture-1',
          actionId: req.actionId,
          outputs: [{ kind: 'text', value: answer }],
          durationMs: 0,
        }),
      }),
  }
}

describe('a provider implemented from the interface alone', () => {
  it('runs an action to a result with no network anywhere', async () => {
    const provider = fixtureProvider('done')
    const job = await provider.submit({
      actionId: 'text-to-image',
      projectId: 'p1',
      params: { steps: 10 },
    })
    const result = await job.result()
    expect(result.outputs[0]).toEqual({ kind: 'text', value: 'done' })
  })

  it('reports the states a caller subscribes to', async () => {
    const seen: string[] = []
    const job = await fixtureProvider('x').submit(
      { actionId: 'text-to-image', projectId: 'p1', params: {} },
      { onSnapshot: (s) => seen.push(s.state) },
    )
    await job.result()
    expect(seen).toEqual(['running', 'succeeded'])
  })
})

/* ---------------- capability negotiation ---------------- */

describe('canRun agrees with the catalogue', () => {
  it('offers the set designer offline, and nothing else', () => {
    for (const id of AI_ACTION_IDS) {
      expect(OfflineSetDesignProvider.canRun(id)).toBe(id === 'design-set')
    }
  })

  it('offers the third-party model only once a key is stored', () => {
    expect(GeminiSetDesignProvider.canRun('design-set')).toBe(false)
    setSetDesignKey('a-key')
    expect(GeminiSetDesignProvider.canRun('design-set')).toBe(true)
    setSetDesignKey('')
    expect(GeminiSetDesignProvider.canRun('design-set')).toBe(false)
  })

  it('says so at runtime too, not only through canRun', async () => {
    expect(await GeminiSetDesignProvider.capabilities()).toMatchObject({ configured: false })
    setSetDesignKey('a-key')
    expect(await GeminiSetDesignProvider.capabilities()).toMatchObject({
      configured: true,
      actions: ['design-set'],
    })
  })
})

/* ---------------- resolution ---------------- */

describe('which provider runs an action', () => {
  it('falls through to the templates when no key is stored', () => {
    expect(resolveAiProvider('design-set')).toBe(OfflineSetDesignProvider)
  })

  it('prefers the model the user supplied a key for', () => {
    setSetDesignKey('a-key')
    expect(resolveAiProvider('design-set')).toBe(GeminiSetDesignProvider)
  })

  /** What "use the offline layout instead" means, as a constraint. */
  it('skips anything that sends bytes when the caller asked for local only', () => {
    setSetDesignKey('a-key')
    expect(resolveAiProvider('design-set', { localOnly: true })).toBe(OfflineSetDesignProvider)
  })

  it('is honest about a GPU action on a build with no hosted backend', () => {
    expect(resolveAiProvider('upscale')).toBe(DisabledAiProvider)
    expect(resolveAiProvider('text-to-image')).toBe(DisabledAiProvider)
  })

  /**
   * The set designer is answered by a language model, so a GPU class on it
   * would be a field that lies — and the hosted provider reads exactly that
   * field to decide what it can take.
   */
  it('never routes a non-GPU action to a GPU backend', () => {
    expect(AI_ACTIONS['design-set'].gpuClass).toBeUndefined()
    expect(resolveAiProvider('design-set').id).not.toBe('hosted')
  })
})

/* ---------------- disclosure ---------------- */

describe('what the surface can tell the user before anything runs', () => {
  it('separates what a job carries from where it goes and who pays', () => {
    expect(dataCarriedBy('design-set')).toBe('prompt')

    expect(OfflineSetDesignProvider.disclosure).toEqual({
      destination: 'device',
      cost: 'free',
    })
    // The pair `id` alone could never express: bytes leave, and the bill is
    // the user's own rather than the deployment's.
    expect(GeminiSetDesignProvider.id).toBe('hosted')
    expect(GeminiSetDesignProvider.disclosure).toEqual({
      destination: 'third-party',
      cost: 'your-key',
      // the stable id a consent record is filed against, so the grant
      // detaches the moment the recipient changes rather than surviving it
      vendor: 'google-gemini',
    })
  })

  it('marks a provider that sends bytes as one that sends bytes', () => {
    expect(GeminiSetDesignProvider.requiresUpload).toBe(true)
    expect(OfflineSetDesignProvider.requiresUpload).toBe(false)
  })
})

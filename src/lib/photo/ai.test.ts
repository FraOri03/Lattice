import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Photo mode's set designer, after the migration onto the provider seam.
 *
 * The point of the suite is that the feature did not change. `PhotoAI.tsx`
 * asks the same question and gets the same answer; what moved is where the
 * vendor call, the key and the fallback live. So these tests are written
 * against the behaviour a user can see — which template, which engine, what
 * a failure says — rather than against the seam it now runs on.
 */

vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  hasHostedAiBackend: false,
}))

const { generateSetLayout, getPhotoAiKey, setPhotoAiKey } = await import('./ai')
const { AiJobError } = await import('@/lib/ai/AiBackendProvider')

function geminiReplies(elements: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ elements }) }] } }],
      }),
    })),
  )
}

function geminiRefuses(status: number, message = 'nope'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status,
      json: async () => ({ error: { message } }),
    })),
  )
}

beforeEach(() => {
  setPhotoAiKey('')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* ---------------- the key ---------------- */

describe('the key', () => {
  it('round-trips through the vault', () => {
    setPhotoAiKey('abc')
    expect(getPhotoAiKey()).toBe('abc')
    setPhotoAiKey('')
    expect(getPhotoAiKey()).toBe('')
  })
})

/* ---------------- offline ---------------- */

describe('with no key', () => {
  it('produces a usable set from templates and never touches the network', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)

    const result = await generateSetLayout('a cinematic interview')

    expect(result.source).toBe('offline')
    expect(result.elements.length).toBeGreaterThan(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it.each([
    ['a beauty photoshoot', 'Grey backdrop'],
    ['un ritratto in studio', 'Grey backdrop'],
    ['skiing on a snowy slope', 'Ski slope'],
    ['una scena sulla neve', 'Ski slope'],
  ])('matches %s to its template', async (prompt, marker) => {
    const result = await generateSetLayout(prompt)
    expect(result.elements.some((e) => e.name === marker)).toBe(true)
  })

  it('always places something, however unfamiliar the prompt', async () => {
    const result = await generateSetLayout('a llama reading the news')
    expect(result.elements.some((e) => e.type === 'camera')).toBe(true)
    expect(result.elements.some((e) => e.type === 'light')).toBe(true)
  })
})

/* ---------------- gemini ---------------- */

describe('with a key', () => {
  it('asks the model and reports which engine answered', async () => {
    setPhotoAiKey('a-key')
    geminiReplies([{ type: 'camera', name: 'Camera A', x: 0, y: 0, rotation: 0 }])

    const result = await generateSetLayout('a night exterior')

    expect(result.source).toBe('gemini')
    expect(result.elements).toHaveLength(1)
  })

  it('sends the key to Google and to nowhere else', async () => {
    setPhotoAiKey('a-key')
    geminiReplies([{ type: 'camera', name: 'Camera A', x: 0, y: 0, rotation: 0 }])

    await generateSetLayout('anything')

    const calls = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toContain('generativelanguage.googleapis.com')
    expect(JSON.stringify(calls[0][1].headers)).toContain('a-key')
  })

  /** The panel's "use the offline layout instead" retry. */
  it('still uses the templates when the caller forces offline', async () => {
    setPhotoAiKey('a-key')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)

    const result = await generateSetLayout('a beauty photoshoot', { forceOffline: true })

    expect(result.source).toBe('offline')
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses an empty prompt before anything leaves', async () => {
    setPhotoAiKey('a-key')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)

    await expect(generateSetLayout('   ')).rejects.toMatchObject({
      failure: { reason: 'invalid-parameters' },
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

/* ---------------- failures ---------------- */

describe('when the model refuses', () => {
  beforeEach(() => setPhotoAiKey('a-key'))

  it.each([
    [400, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'model-missing'],
    [500, 'upstream-error'],
  ] as const)('maps HTTP %i onto the taxonomy as %s', async (status, reason) => {
    geminiRefuses(status)
    await expect(generateSetLayout('a set')).rejects.toMatchObject({ failure: { reason } })
  })

  /**
   * A rate-limited vendor and a serverless endpoint with no free worker are
   * the same fact to a user, which is why the reason is named for the
   * shortage rather than for a GPU worker.
   */
  it('calls a rate limit a capacity problem, worth retrying later', async () => {
    geminiRefuses(429)
    const thrown = await generateSetLayout('a set').then(
      () => null,
      (e: unknown) => e as InstanceType<typeof AiJobError>,
    )
    expect(thrown).toBeInstanceOf(AiJobError)
    expect(thrown?.failure.reason).toBe('no-capacity')
    expect(thrown?.retry).toBe('later')
  })

  it('says so when the answer contains no elements', async () => {
    geminiReplies([])
    await expect(generateSetLayout('a set')).rejects.toMatchObject({
      failure: { reason: 'upstream-error' },
    })
  })

  it('says so when the answer is not JSON at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'sorry!' }] } }] }),
      })),
    )
    await expect(generateSetLayout('a set')).rejects.toMatchObject({
      failure: { reason: 'upstream-error' },
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The hosted provider, end to end, against a fake `/api/ai/*`.
 *
 * Nothing here touches RunPod, and nothing here can: the endpoints are the
 * only thing the provider knows how to talk to, and they are mocked. That
 * is the point of the seam, and it is also the rule from the issue — no
 * test may require a live RunPod account or spend credit.
 *
 * The poll delay is stubbed to a millisecond so a job that would take a
 * minute in production takes a few ticks here. The schedule itself is
 * covered in `backoff.test.ts`, where it can be asserted on directly.
 */

vi.mock('@/lib/env', () => ({ hasHostedAiBackend: true }))
vi.mock('./backoff.js', () => ({ pollDelayMs: () => 1 }))

const post = vi.fn()

vi.mock('@/lib/auth/sessionClient', () => ({
  sessionClient: { post: (...args: unknown[]) => post(...args) },
  NotAuthenticatedError: class NotAuthenticatedError extends Error {},
}))
vi.mock('@/lib/auth/AuthService', () => ({
  authService: { getAccessToken: async () => 'google-token' },
}))

const { AiJobError } = await import('./AiBackendProvider')
const { RunPodAiProvider, reattachRunPodJob } = await import('./RunPodAiProvider')
const { restoreAiJobs } = await import('./index')
const { clearAiJobs, loadAiJobs, rememberAiJob } = await import('./jobStore')
const { AI_CANCEL_URL, AI_SUBMIT_URL } = await import('./protocol')
import type { AiJobSnapshot } from './jobModel'
import type { AiStatusResponse } from './protocol'

const NOW = () => Date.now()

function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

interface Wiring {
  /** Consumed in order; the last one repeats once the queue runs dry. */
  statuses: AiStatusResponse[]
  submit?: () => Response
  cancel?: () => Response
  onStatus?: () => void
}

function wire({ statuses, submit, cancel, onStatus }: Wiring): void {
  const queue = [...statuses]
  let last: AiStatusResponse = statuses[statuses.length - 1] ?? { state: 'running' }
  post.mockImplementation(async (url: string) => {
    if (url === AI_SUBMIT_URL) {
      return (
        submit?.() ??
        reply(200, {
          jobId: 'job-1',
          ticket: 'ticket-1',
          state: 'queued',
          submittedAt: NOW(),
          deadlineAt: NOW() + 180_000,
        })
      )
    }
    if (url === AI_CANCEL_URL) return cancel?.() ?? reply(200, { state: 'cancelled' })
    onStatus?.()
    last = queue.shift() ?? last
    return reply(200, last)
  })
}

const IMAGE = () => new Blob([new Uint8Array(16)], { type: 'image/png' })

beforeEach(() => {
  post.mockReset()
  clearAiJobs()
})

/* ---------------- the happy path ---------------- */

describe('a full submit, progress and result cycle', () => {
  it('returns the outputs and reports every state on the way', async () => {
    wire({
      statuses: [
        { state: 'running', progress: 0.4 },
        {
          state: 'succeeded',
          outputs: [{ url: 'https://assets.invalid/out.png', kind: 'image' }],
          executionMs: 4_200,
          seed: 7,
        },
      ],
    })
    const seen: AiJobSnapshot[] = []

    const job = await RunPodAiProvider.submit(
      { actionId: 'text-to-image', projectId: 'proj_1', params: { steps: 20 } },
      { onSnapshot: (s) => seen.push(s) },
    )
    const result = await job.result()

    expect(result.outputs).toEqual([{ url: 'https://assets.invalid/out.png', kind: 'image' }])
    expect(result.executionMs).toBe(4_200)
    expect(result.seed).toBe(7)
    expect(seen.map((s) => s.state)).toEqual(['running', 'succeeded'])
    expect(seen[0].progress).toBe(0.4)
  })

  it('remembers the job while it runs and forgets it once it is done', async () => {
    let duringJob: number | null = null
    wire({
      statuses: [{ state: 'running' }, { state: 'succeeded', outputs: [] }],
      onStatus: () => {
        duringJob ??= loadAiJobs().length
      },
    })

    const job = await RunPodAiProvider.submit({
      actionId: 'text-to-image',
      projectId: 'proj_1',
      params: {},
    })
    await job.result()

    expect(duringJob).toBe(1)
    expect(loadAiJobs()).toEqual([])
  })
})

/* ---------------- ending it early ---------------- */

describe('cancellation', () => {
  it('reaches the backend and settles the job as cancelled', async () => {
    wire({ statuses: [{ state: 'running' }] })

    const job = await RunPodAiProvider.submit({
      actionId: 'text-to-image',
      projectId: 'proj_1',
      params: {},
    })
    await job.cancel()

    await expect(job.result()).rejects.toMatchObject({
      failure: { reason: 'cancelled' },
    })
    expect(post.mock.calls.some(([url]) => url === AI_CANCEL_URL)).toBe(true)
  })

  it('says the job may still be running when the cancel did not land', async () => {
    wire({
      statuses: [{ state: 'running' }],
      cancel: () => reply(502, { error: 'upstream is down', reason: 'upstream-error' }),
    })

    const job = await RunPodAiProvider.submit({
      actionId: 'text-to-image',
      projectId: 'proj_1',
      params: {},
    })
    await job.cancel()

    const err = await job.result().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiJobError)
    expect((err as InstanceType<typeof AiJobError>).message).toContain('may still be running')
  })

  it('is what an aborted caller gets, and it still reaches the backend', async () => {
    wire({ statuses: [{ state: 'queued' }] })
    const controller = new AbortController()

    const job = await RunPodAiProvider.submit(
      { actionId: 'text-to-image', projectId: 'proj_1', params: {} },
      { signal: controller.signal },
    )
    controller.abort()

    await expect(job.result()).rejects.toMatchObject({ failure: { reason: 'cancelled' } })
    expect(post.mock.calls.some(([url]) => url === AI_CANCEL_URL)).toBe(true)
  })
})

describe('the deadline', () => {
  /**
   * Reattaching to a job whose deadline has already passed is the same code
   * path an abandoned tab takes, and it must stop the meter rather than
   * poll a job nobody is waiting for any more.
   */
  it('fails the job as timed out and cancels it upstream', async () => {
    wire({ statuses: [{ state: 'running' }] })

    const job = reattachRunPodJob({
      jobId: 'job-old',
      ticket: 'ticket-old',
      actionId: 'text-to-image',
      state: 'running',
      submittedAt: Date.now() - 200_000,
      deadlineAt: Date.now() - 1_000,
    })

    await expect(job.result()).rejects.toMatchObject({ failure: { reason: 'timed-out' } })
    expect(post.mock.calls.some(([url]) => url === AI_CANCEL_URL)).toBe(true)
  })
})

/* ---------------- reattachment ---------------- */

describe('a reload in the middle of a generation', () => {
  it('reconnects to the job instead of orphaning it', async () => {
    wire({
      statuses: [
        { state: 'running', progress: 0.8 },
        { state: 'succeeded', outputs: [{ url: 'https://assets.invalid/a.png', kind: 'image' }] },
      ],
    })
    rememberAiJob({
      jobId: 'job-1',
      ticket: 'ticket-1',
      actionId: 'text-to-image',
      state: 'running',
      submittedAt: Date.now() - 5_000,
      deadlineAt: Date.now() + 120_000,
    })

    const [resumed] = restoreAiJobs()
    expect(resumed).toBeDefined()
    expect(resumed.jobId).toBe('job-1')

    const result = await resumed.result()
    expect(result.outputs).toHaveLength(1)
    // Never re-submitted: the job was already paid for.
    expect(post.mock.calls.some(([url]) => url === AI_SUBMIT_URL)).toBe(false)
  })

  it('does not resume a job whose deadline passed while the tab was shut', () => {
    rememberAiJob({
      jobId: 'job-stale',
      ticket: 'ticket',
      actionId: 'text-to-image',
      state: 'running',
      submittedAt: Date.now() - 600_000,
      deadlineAt: Date.now() - 400_000,
    })
    expect(restoreAiJobs()).toEqual([])
  })
})

/* ---------------- cold start ---------------- */

describe('cold start', () => {
  it('is a state of its own once the queue wait stops being ordinary', async () => {
    wire({ statuses: [{ state: 'queued' }] })
    const seen: AiJobSnapshot[] = []

    const job = reattachRunPodJob(
      {
        jobId: 'job-cold',
        ticket: 'ticket',
        actionId: 'text-to-image',
        state: 'queued',
        submittedAt: Date.now() - 30_000,
        deadlineAt: Date.now() + 120_000,
      },
      { onSnapshot: (s) => seen.push(s) },
    )

    await vi.waitFor(() => expect(seen.some((s) => s.state === 'cold-start')).toBe(true))
    await job.cancel().catch(() => {})
  })

  it('is not claimed for a job that has only just been queued', async () => {
    wire({ statuses: [{ state: 'queued' }] })
    const seen: AiJobSnapshot[] = []

    const job = reattachRunPodJob(
      {
        jobId: 'job-warm',
        ticket: 'ticket',
        actionId: 'text-to-image',
        state: 'queued',
        submittedAt: Date.now(),
        deadlineAt: Date.now() + 120_000,
      },
      { onSnapshot: (s) => seen.push(s) },
    )

    await new Promise((r) => setTimeout(r, 20))
    expect(seen.some((s) => s.state === 'cold-start')).toBe(false)
    await job.cancel().catch(() => {})
  })
})

/* ---------------- refusals, before anything leaves ---------------- */

describe('what the provider refuses without calling the server', () => {
  it('refuses an upload nobody consented to', async () => {
    wire({ statuses: [] })
    await expect(
      RunPodAiProvider.submit({
        actionId: 'upscale',
        projectId: 'proj_1',
        params: { scale: '2' },
        inputs: [{ kind: 'image', blob: IMAGE() }],
      }),
    ).rejects.toMatchObject({ failure: { reason: 'consent-required' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses an input over the transport cap', async () => {
    wire({ statuses: [] })
    const huge = new Blob([new Uint8Array(4 * 1024 * 1024)], { type: 'image/png' })
    await expect(
      RunPodAiProvider.submit(
        {
          actionId: 'upscale',
          projectId: 'proj_1',
          params: { scale: '2' },
          inputs: [{ kind: 'image', blob: huge }],
        },
        { uploadConsent: true },
      ),
    ).rejects.toMatchObject({ failure: { reason: 'input-too-large' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses parameters outside the catalogue ranges', async () => {
    wire({ statuses: [] })
    await expect(
      RunPodAiProvider.submit({
        actionId: 'text-to-image',
        projectId: 'proj_1',
        params: { steps: 5_000 },
      }),
    ).rejects.toMatchObject({ failure: { reason: 'invalid-parameters' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses an action whose inputs were not supplied', async () => {
    wire({ statuses: [] })
    await expect(
      RunPodAiProvider.submit(
        { actionId: 'upscale', projectId: 'proj_1', params: { scale: '2' } },
        { uploadConsent: true },
      ),
    ).rejects.toMatchObject({ failure: { reason: 'invalid-parameters' } })
  })
})

/* ---------------- the taxonomy, on the wire ---------------- */

describe('failures the server reports', () => {
  it.each([
    ['no-credit', 402, 'no'],
    ['no-worker', 503, 'later'],
    ['model-missing', 500, 'no'],
    ['not-configured', 501, 'no'],
  ] as const)('maps %s and states whether retrying helps', async (reason, status, retry) => {
    wire({ statuses: [], submit: () => reply(status, { error: 'nope', reason }) })

    const thrown = await RunPodAiProvider.submit({
      actionId: 'text-to-image',
      projectId: 'proj_1',
      params: {},
    }).then(
      () => null,
      (e: unknown) => e,
    )

    expect(thrown).toBeInstanceOf(AiJobError)
    const err = thrown as InstanceType<typeof AiJobError>
    expect(err.failure.reason).toBe(reason)
    expect(err.retry).toBe(retry)
  })

  it('surfaces a mid-job failure with the reason the endpoint gave', async () => {
    wire({
      statuses: [
        { state: 'running' },
        { state: 'failed', failure: { reason: 'model-missing', detail: 'no such checkpoint' } },
      ],
    })

    const job = await RunPodAiProvider.submit({
      actionId: 'text-to-image',
      projectId: 'proj_1',
      params: {},
    })
    await expect(job.result()).rejects.toMatchObject({
      failure: { reason: 'model-missing' },
    })
  })

  it('gives up as network-lost rather than polling forever', async () => {
    let calls = 0
    post.mockImplementation(async (url: string) => {
      if (url === AI_SUBMIT_URL) {
        return reply(200, {
          jobId: 'job-1',
          ticket: 't',
          state: 'queued',
          submittedAt: NOW(),
          deadlineAt: NOW() + 120_000,
        })
      }
      if (url === AI_CANCEL_URL) return reply(200, { state: 'cancelled' })
      calls += 1
      throw new TypeError('Failed to fetch')
    })

    const job = await RunPodAiProvider.submit({
      actionId: 'text-to-image',
      projectId: 'proj_1',
      params: {},
    })
    await expect(job.result()).rejects.toMatchObject({ failure: { reason: 'network-lost' } })
    // Bounded: it stops asking rather than hammering a server that is gone.
    expect(calls).toBeLessThanOrEqual(6)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AiBackendProvider,
  AiJobHandle,
  AiSubmitOptions,
  AiSubmitRequest,
} from './AiBackendProvider'
import type { AiJobResult, AiJobSnapshot } from './jobModel'

/**
 * The store the AI panel is a view onto — submit, progress, cancel, failure.
 *
 * Driven by a fake provider rather than by RunPod, which is the arrangement
 * 21.9 will make shared and reusable. Everything asserted here is behaviour
 * a user can see: a job that stays visible after the panel closes, a cancel
 * that reaches the backend, a cost that only appears when it is a fact, and
 * a completion that raises a notification through the centre that already
 * honours the user's preferences.
 */

/* ---------------- the fake provider ---------------- */

class FakeJob implements AiJobHandle {
  readonly jobId: string
  cancelled = false
  private current: AiJobSnapshot
  private settle!: (result: AiJobResult) => void
  private fail!: (err: unknown) => void
  private readonly promise: Promise<AiJobResult>

  constructor(
    jobId: string,
    private readonly opts: AiSubmitOptions,
  ) {
    this.jobId = jobId
    this.current = {
      jobId,
      actionId: 'upscale',
      state: 'queued',
      progress: 0,
      submittedAt: Date.now(),
      deadlineAt: Date.now() + 60_000,
    }
    this.promise = new Promise((resolve, reject) => {
      this.settle = resolve
      this.fail = reject
    })
  }

  snapshot(): AiJobSnapshot {
    return this.current
  }

  result(): Promise<AiJobResult> {
    return this.promise
  }

  async cancel(): Promise<void> {
    this.cancelled = true
  }

  /* the levers a test pulls */
  advance(patch: Partial<AiJobSnapshot>): void {
    this.current = { ...this.current, ...patch }
    this.opts.onSnapshot?.(this.current)
  }

  finish(executionMs: number): void {
    this.advance({ state: 'succeeded', progress: 1 })
    this.settle({
      jobId: this.jobId,
      actionId: 'upscale',
      outputs: [{ kind: 'image', url: 'blob:result' }],
      durationMs: 20_000,
      executionMs,
    })
  }

  break(err: unknown): void {
    this.fail(err)
  }
}

let lastJob: FakeJob | null = null
let lastOptions: AiSubmitOptions | null = null

const fakeProvider: AiBackendProvider = {
  id: 'hosted',
  label: 'fake',
  requiresUpload: true,
  disclosure: { destination: 'deployment', cost: 'deployment', vendor: 'lattice-hosted-gpu' },
  canRun: () => true,
  capabilities: async () => ({ configured: true, actions: ['upscale'] }),
  submit: async (_req: AiSubmitRequest, opts: AiSubmitOptions = {}) => {
    lastOptions = opts
    lastJob = new FakeJob(`job-${Date.now().toString(36)}`, opts)
    return lastJob
  },
}

vi.mock('./registry.js', () => ({
  resolveAiProvider: () => fakeProvider,
  restoreAiJobs: () => [],
  aiBackend: fakeProvider,
}))

const { useAiJobs, activeEntries, spentThisSession } = await import('./jobsStore')
const { useAiActivity } = await import('./activity')
const { AiJobError } = await import('./AiBackendProvider')
const { grantConsent, clearConsentHistory } = await import('./consent')
const { AI_GPU_RATES } = await import('./cost')
const { notificationService } = await import('@/lib/collab/NotificationService')
const { useAnnouncer } = await import('@/lib/a11y/announcer')

const HOSTED = { destination: 'deployment', vendor: 'lattice-hosted-gpu' } as const

const run = () =>
  useAiJobs.getState().submit({ actionId: 'upscale', projectId: 'prj_1', params: { scale: '2' } })

beforeEach(() => {
  localStorage.clear()
  clearConsentHistory()
  useAiJobs.getState().clear()
  lastJob = null
  lastOptions = null
})

describe('nothing leaves before it has been agreed to', () => {
  it('refuses a submission with neither a grant nor an assertion', async () => {
    await expect(run()).rejects.toMatchObject({ failure: { reason: 'consent-required' } })
    expect(lastJob).toBeNull()
  })

  /**
   * What "remembered" buys: the second generation of an afternoon runs
   * without a dialog, and the provider still gets the per-request assertion
   * it refuses to upload without.
   */
  it('passes the remembered grant through as the upload consent', async () => {
    grantConsent(HOSTED)
    const promise = run()
    await Promise.resolve()
    expect(lastOptions?.uploadConsent).toBe(true)
    lastJob!.finish(1000)
    await promise
  })
})

describe('a job outlives the panel that started it', () => {
  beforeEach(() => grantConsent(HOSTED))

  it('appears in the store with the estimate it was quoted', async () => {
    const promise = run()
    await Promise.resolve()
    const entry = useAiJobs.getState().entries[0]
    expect(entry.projectId).toBe('prj_1')
    expect(entry.estimate?.kind).toBe('estimate')
    // no actual cost yet: nothing has reported worker time, and a zero here
    // would read as free
    expect(entry.cost).toBeNull()
    lastJob!.finish(1000)
    await promise
  })

  it('follows the job through cold start and progress', async () => {
    const promise = run()
    await Promise.resolve()
    lastJob!.advance({ state: 'cold-start' })
    expect(useAiJobs.getState().entries[0].snapshot.state).toBe('cold-start')
    lastJob!.advance({ state: 'running', progress: 0.4, queuePosition: 2 })
    expect(useAiJobs.getState().entries[0].snapshot).toMatchObject({
      state: 'running',
      progress: 0.4,
      queuePosition: 2,
    })
    lastJob!.finish(1000)
    await promise
  })

  it('publishes the running count for the toolbar, without the panel mounted', async () => {
    const promise = run()
    await Promise.resolve()
    expect(useAiActivity.getState().running).toBe(1)
    lastJob!.finish(1000)
    await promise
    expect(useAiActivity.getState().running).toBe(0)
    expect(activeEntries(useAiJobs.getState().entries)).toEqual([])
  })
})

describe('the end of a job', () => {
  beforeEach(() => grantConsent(HOSTED))

  it('records what it actually cost, from the worker time reported', async () => {
    const promise = run()
    await Promise.resolve()
    lastJob!.finish(8000)
    await promise

    const entry = useAiJobs.getState().entries[0]
    expect(entry.cost).toMatchObject({ kind: 'actual', gpuSeconds: 8 })
    expect(spentThisSession(useAiJobs.getState().entries)).toBeCloseTo(8 * AI_GPU_RATES.light, 10)
  })

  /**
   * A generation that finishes while the user is in another project is the
   * same case as a finished conversion, so it takes the same road — the one
   * place notification preferences are honoured.
   */
  it('raises a notification through the centre, exactly once', async () => {
    const notify = vi.spyOn(notificationService, 'notify')
    const promise = run()
    await Promise.resolve()
    lastJob!.finish(8000)
    await promise

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toBe('prj_1')
    expect(notify.mock.calls[0][1]).toBe('ai-job')
    notify.mockRestore()
  })

  it('announces the ending for a screen reader', async () => {
    const before = useAnnouncer.getState().nonce
    const promise = run()
    await Promise.resolve()
    lastJob!.finish(1000)
    await promise
    expect(useAnnouncer.getState().nonce).toBeGreaterThan(before)
    expect(useAnnouncer.getState().message).toContain('Upscale')
  })

  it('keeps a failure with its reason, so the row can say what to do next', async () => {
    const notify = vi.spyOn(notificationService, 'notify')
    const promise = run()
    await Promise.resolve()
    lastJob!.break(new AiJobError('no-capacity', 'no worker'))
    await expect(promise).rejects.toBeInstanceOf(AiJobError)

    const entry = useAiJobs.getState().entries[0]
    expect(entry.snapshot.state).toBe('failed')
    expect(entry.failure?.reason).toBe('no-capacity')
    // a failure has no cost: nothing reported worker time
    expect(entry.cost).toBeNull()
    expect(notify).toHaveBeenCalledTimes(1)
    notify.mockRestore()
  })

  it('files a cancellation as cancelled rather than as a failure', async () => {
    const promise = run()
    await Promise.resolve()
    await useAiJobs.getState().cancel(useAiJobs.getState().entries[0].snapshot.jobId)
    // the cancel reaches the backend, not only the UI: a job cancelled in the
    // browser that keeps burning GPU minutes is a billing bug
    expect(lastJob!.cancelled).toBe(true)

    lastJob!.break(new AiJobError('cancelled', 'user'))
    await expect(promise).rejects.toBeInstanceOf(AiJobError)
    expect(useAiJobs.getState().entries[0].snapshot.state).toBe('cancelled')
  })

  it('lets a finished row be dismissed without touching the others', async () => {
    const promise = run()
    await Promise.resolve()
    const jobId = useAiJobs.getState().entries[0].snapshot.jobId
    lastJob!.finish(1000)
    await promise
    useAiJobs.getState().dismiss(jobId)
    expect(useAiJobs.getState().entries).toEqual([])
  })
})

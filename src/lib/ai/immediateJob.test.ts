import { describe, expect, it } from 'vitest'
import { AiJobError } from './AiBackendProvider'
import { immediateJob } from './immediateJob'
import type { AiJobResult, AiJobState } from './jobModel'

/**
 * The adaptation that let a backend which simply *answers* live on a seam
 * designed around a backend that queues.
 *
 * What has to hold for that to be true rather than convenient: the same
 * abort, the same deadline, the same taxonomy — and `cancelled` and
 * `timed-out` still telling the user apart from each other, which is the
 * whole reason they are separate states.
 */

const result = (jobId = 'job-1'): AiJobResult => ({
  jobId,
  actionId: 'design-set',
  outputs: [{ kind: 'scene', value: [] }],
  durationMs: 0,
})

function run(
  work: (signal: AbortSignal) => Promise<AiJobResult>,
  opts: Parameters<typeof immediateJob>[0]['opts'] = {},
  deadlineMs = 5_000,
) {
  const seen: AiJobState[] = []
  const job = immediateJob({
    jobId: 'job-1',
    actionId: 'design-set',
    deadlineMs,
    opts: { ...opts, onSnapshot: (s) => seen.push(s.state) },
    run: work,
  })
  return { job, seen }
}

describe('a job that answers in one round trip', () => {
  it('reports running, then succeeded', async () => {
    const { job, seen } = run(async () => result())
    await expect(job.result()).resolves.toMatchObject({ jobId: 'job-1' })
    expect(seen).toEqual(['running', 'succeeded'])
  })

  /** There is no worker to wait for, so claiming one would be a lie. */
  it('never claims a cold start', async () => {
    const { job, seen } = run(async () => result())
    await job.result()
    expect(seen).not.toContain('cold-start')
    expect(seen).not.toContain('queued')
  })

  it('exposes the latest snapshot synchronously', async () => {
    const { job } = run(async () => result())
    expect(job.snapshot().state).toBe('running')
    await job.result()
    expect(job.snapshot().state).toBe('succeeded')
  })
})

describe('when it goes wrong', () => {
  it('passes a taxonomy failure through untouched', async () => {
    const { job } = run(async () => {
      throw new AiJobError('no-credit', 'out of credit')
    })
    await expect(job.result()).rejects.toMatchObject({ failure: { reason: 'no-credit' } })
  })

  it('calls anything else an upstream error rather than guessing', async () => {
    const { job } = run(async () => {
      throw new TypeError('undefined is not a function')
    })
    await expect(job.result()).rejects.toMatchObject({
      failure: { reason: 'upstream-error' },
    })
  })

  it('settles as cancelled when the caller aborts, and tells the work', async () => {
    const controller = new AbortController()
    let sawAbort = false
    const { job, seen } = run(
      (signal) =>
        new Promise<AiJobResult>((_, reject) => {
          signal.addEventListener('abort', () => {
            sawAbort = true
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
      { signal: controller.signal },
    )
    controller.abort()

    await expect(job.result()).rejects.toMatchObject({ failure: { reason: 'cancelled' } })
    expect(sawAbort).toBe(true)
    expect(seen.at(-1)).toBe('cancelled')
  })

  it('settles as cancelled when the handle is cancelled', async () => {
    const { job } = run(
      (signal) =>
        new Promise<AiJobResult>((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    await job.cancel()
    await expect(job.result()).rejects.toMatchObject({ failure: { reason: 'cancelled' } })
  })

  /**
   * A timer abort and a user abort are the same `AbortError`, and telling
   * them apart is the difference between "you cancelled this" and "this
   * took too long".
   */
  it('settles as timed out, not cancelled, when the deadline is what fired', async () => {
    const { job } = run(
      (signal) =>
        new Promise<AiJobResult>((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
      {},
      1,
    )
    await expect(job.result()).rejects.toMatchObject({ failure: { reason: 'timed-out' } })
  })
})

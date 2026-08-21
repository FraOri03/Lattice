// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  availableActions,
  callbackTokenHash,
  endpointFor,
  mapJobError,
  mapStatus,
  mintCallbackToken,
  mintTicket,
  upstreamFailure,
  verifyCallbackToken,
  verifyTicket,
  viewOf,
} from './ai.js'

/**
 * The server half of 21.1, without a RunPod account anywhere near it.
 *
 * Two things are worth guarding here above all: the ticket, because it is
 * the only thing standing between a guessed job id and somebody else's
 * generation, and the callback token, because it is the only thing standing
 * between a stray POST and a closed ledger line.
 */

const ORIGINAL = { ...process.env }

beforeEach(() => {
  process.env.RUNPOD_API_KEY = 'rp-test-key'
  process.env.RUNPOD_ENDPOINT_STANDARD = 'ep-standard'
  delete process.env.RUNPOD_ENDPOINT_LIGHT
  delete process.env.RUNPOD_ENDPOINT_HEAVY
  delete process.env.AI_JOB_SECRET
})

afterEach(() => {
  process.env = { ...ORIGINAL }
})

/* ---------------- configuration ---------------- */

describe('what a deployment says it can run', () => {
  it('offers nothing without a key, whatever endpoints are set', () => {
    delete process.env.RUNPOD_API_KEY
    expect(availableActions()).toEqual([])
  })

  it('falls back to the standard endpoint for a class with none of its own', () => {
    expect(endpointFor('light')).toBe('ep-standard')
    expect(endpointFor('heavy')).toBe('ep-standard')
  })

  it('prefers the endpoint provisioned for the class', () => {
    process.env.RUNPOD_ENDPOINT_LIGHT = 'ep-light'
    expect(endpointFor('light')).toBe('ep-light')
    expect(endpointFor('standard')).toBe('ep-standard')
  })

  it('lists every action once a standard endpoint exists', () => {
    expect(availableActions()).toContain('text-to-image')
    expect(availableActions()).toContain('upscale')
  })
})

/* ---------------- tickets ---------------- */

describe('the job ticket', () => {
  const claims = { jobId: 'job-1', subject: 'sub-1', gpuClass: 'standard' } as const

  it('verifies for the job and the account it was minted for', () => {
    const ticket = mintTicket(claims)
    expect(verifyTicket(ticket, 'job-1', 'sub-1')).toBe('standard')
  })

  it('does not verify for another job', () => {
    expect(verifyTicket(mintTicket(claims), 'job-2', 'sub-1')).toBeNull()
  })

  /** The one that stops a guessed id from becoming somebody else's image. */
  it('does not verify for another account', () => {
    expect(verifyTicket(mintTicket(claims), 'job-1', 'sub-2')).toBeNull()
  })

  it('does not verify once it has expired', () => {
    const ticket = mintTicket(claims, Date.now() - 7 * 60 * 60_000)
    expect(verifyTicket(ticket, 'job-1', 'sub-1')).toBeNull()
  })

  it('does not verify when the GPU class is edited to a different one', () => {
    const ticket = mintTicket(claims)
    const tampered = ticket.replace('.standard.', '.heavy.')
    expect(verifyTicket(tampered, 'job-1', 'sub-1')).toBeNull()
  })

  it('does not verify when the signature is edited', () => {
    const ticket = mintTicket(claims)
    expect(verifyTicket(`${ticket.slice(0, -1)}x`, 'job-1', 'sub-1')).toBeNull()
  })

  it.each([undefined, null, '', 'nonsense', 'v1.standard.123', 42])(
    'refuses malformed input (%s)',
    (value) => {
      expect(verifyTicket(value, 'job-1', 'sub-1')).toBeNull()
    },
  )

  it('stops verifying when the RunPod key is rotated', () => {
    const ticket = mintTicket(claims)
    process.env.RUNPOD_API_KEY = 'rp-rotated'
    expect(verifyTicket(ticket, 'job-1', 'sub-1')).toBeNull()
  })
})

/* ---------------- callback tokens ---------------- */

describe('the callback token', () => {
  it('round-trips through the URL value it is carried in', () => {
    const minted = mintCallbackToken()
    expect(verifyCallbackToken(minted.value)).toBe(minted.token)
  })

  it('mints a different token every time', () => {
    expect(mintCallbackToken().token).not.toBe(mintCallbackToken().token)
  })

  it.each([undefined, '', 'no-dot', 'token.forged', 42])(
    'rejects an unsigned or forged value (%s)',
    (value) => {
      expect(verifyCallbackToken(value)).toBeNull()
    },
  )

  it('stores a hash, not the token', () => {
    const minted = mintCallbackToken()
    const hash = callbackTokenHash(minted.token)
    expect(hash).not.toContain(minted.token)
    expect(callbackTokenHash(minted.token)).toBe(hash)
    expect(callbackTokenHash('another')).not.toBe(hash)
  })
})

/* ---------------- reading RunPod ---------------- */

describe('RunPod job statuses', () => {
  it.each([
    ['IN_QUEUE', 'queued'],
    ['RETRIED', 'queued'],
    ['IN_PROGRESS', 'running'],
    ['COMPLETED', 'succeeded'],
    ['FAILED', 'failed'],
    ['CANCELLED', 'cancelled'],
    ['TIMED_OUT', 'timed-out'],
  ] as const)('maps %s to %s', (upstream, expected) => {
    expect(mapStatus(upstream)).toBe(expected)
  })

  /**
   * An unknown status must not be optimistically read as finished: doing so
   * would hand the caller an empty result for a job still running.
   */
  it('keeps waiting on a status it does not recognise', () => {
    expect(mapStatus('SOMETHING_NEW')).toBe('queued')
    expect(mapStatus(undefined)).toBe('queued')
  })
})

describe('HTTP failures from RunPod', () => {
  it.each([
    [401, 'not-configured'],
    [403, 'not-configured'],
    [404, 'not-configured'],
    [402, 'no-credit'],
    [429, 'no-capacity'],
    [503, 'no-capacity'],
    [500, 'upstream-error'],
  ] as const)('maps %i to %s', (status, reason) => {
    expect(upstreamFailure(status, '').reason).toBe(reason)
  })

  it('reads a credit problem out of the body when the status does not say', () => {
    expect(upstreamFailure(400, 'Insufficient balance on this account').reason).toBe('no-credit')
  })

  it('truncates the upstream body rather than passing it through whole', () => {
    const failure = upstreamFailure(500, 'x'.repeat(5_000))
    expect(failure.message.length).toBeLessThan(400)
  })
})

describe('a job payload', () => {
  it('reads a completed job with its images, seed and worker time', () => {
    const view = viewOf({
      status: 'COMPLETED',
      executionTime: 4_200,
      output: { images: ['https://assets.invalid/a.png'], seed: 11 },
    })
    expect(view.state).toBe('succeeded')
    expect(view.outputs).toEqual([{ url: 'https://assets.invalid/a.png', kind: 'image' }])
    expect(view.seed).toBe(11)
    expect(view.executionMs).toBe(4_200)
  })

  it('reads progress and a preview from a job still sampling', () => {
    const view = viewOf({ status: 'IN_PROGRESS', output: { progress: 0.55, preview: 'data:,x' } })
    expect(view.state).toBe('running')
    expect(view.progress).toBeCloseTo(0.55)
    expect(view.previewUrl).toBe('data:,x')
  })

  it('merges a generator stream into the latest view of the job', () => {
    const view = viewOf({
      status: 'IN_PROGRESS',
      stream: [{ output: { progress: 0.2 } }, { output: { progress: 0.9, preview: 'data:,y' } }],
    })
    expect(view.progress).toBeCloseTo(0.9)
    expect(view.previewUrl).toBe('data:,y')
  })

  it('clamps a progress value the container got wrong', () => {
    expect(viewOf({ status: 'IN_PROGRESS', output: { progress: 4 } }).progress).toBe(1)
    expect(viewOf({ status: 'IN_PROGRESS', output: { progress: -1 } }).progress).toBe(0)
  })

  it('names a missing model rather than reporting a bare failure', () => {
    const view = viewOf({ status: 'FAILED', error: 'checkpoint sd_xl.safetensors not found' })
    expect(view.failure?.reason).toBe('model-missing')
  })

  it('falls back to upstream-error for anything it cannot recognise', () => {
    expect(mapJobError('CUDA out of memory').reason).toBe('upstream-error')
  })

  it('gives a timed-out and a cancelled job their own reasons', () => {
    expect(viewOf({ status: 'TIMED_OUT' }).failure?.reason).toBe('timed-out')
    expect(viewOf({ status: 'CANCELLED' }).failure?.reason).toBe('cancelled')
  })

  it('survives a payload with no output at all', () => {
    expect(viewOf({ status: 'COMPLETED' })).toMatchObject({ state: 'succeeded' })
    expect(viewOf(null).state).toBe('queued')
  })
})

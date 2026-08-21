import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepositories } from '../_lib/db/memory.js'
import { callbackTokenHash, mintCallbackToken, mintTicket } from '../_lib/ai.js'
import type { AiJobRecord } from '../../src/types/aiJob.js'

/**
 * `/api/ai/*` — where the RunPod key is used and the browser is not.
 *
 * RunPod itself is a stubbed `fetch`, so the suite runs offline and no
 * credit is ever spent. What is under test is the part that would otherwise
 * only be discovered in production: that an unsigned callback closes
 * nothing, that a cancel reaches the upstream rather than only the UI, that
 * a ticket for one job cannot be used on another, and that a deployment
 * with no key says so instead of failing obscurely.
 */

const db = new MemoryRepositories()
let databasePresent = true

vi.mock('../_lib/db/index.js', () => ({
  repositories: () => (databasePresent ? db : null),
  NO_DATABASE: 'no database is configured',
}))

let identity: { sub: string; email: string; name: string; picture: string } | null = {
  sub: 'sub-1',
  email: 'ada@example.com',
  name: 'Ada',
  picture: '',
}
let liveblocks: unknown = null
let acl: unknown = null

vi.mock('../_lib/realtime.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/realtime.js')>()
  return {
    ...actual,
    liveblocksClient: () => liveblocks,
    loadAcl: async () => acl,
    requireIdentity: async (
      _req: unknown,
      res: { status(code: number): { json(body: unknown): void } },
    ) => {
      if (identity) return identity
      res.status(401).json({ error: 'Not signed in.' })
      return null
    },
  }
})

const submit = (await import('./submit.js')).default
const status = (await import('./status.js')).default
const cancel = (await import('./cancel.js')).default
const callback = (await import('./callback.js')).default
const capabilities = (await import('./capabilities.js')).default

/* ---------------- harness ---------------- */

function makeRes() {
  const sent: { code: number; body: unknown; headers: Record<string, string> } = {
    code: 0,
    body: null,
    headers: {},
  }
  const res = {
    status(code: number) {
      sent.code = code
      return res
    },
    setHeader(name: string, value: string) {
      sent.headers[name] = value
      return res
    },
    json(body: unknown) {
      sent.body = body
    },
  }
  return { res, sent }
}

/** RunPod's answers, keyed by the path fragment that identifies the call. */
let upstream: (url: string) => { ok: boolean; status: number; body: unknown }

function stubRunPod(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const answer = upstream(url)
      return {
        ok: answer.ok,
        status: answer.status,
        text: async () => JSON.stringify(answer.body),
      }
    }),
  )
}

const fetchCalls = () =>
  (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map(
    ([url]) => url,
  )

const ORIGINAL = { ...process.env }

beforeEach(() => {
  db.clear()
  databasePresent = true
  identity = { sub: 'sub-1', email: 'ada@example.com', name: 'Ada', picture: '' }
  liveblocks = null
  acl = null
  process.env.RUNPOD_API_KEY = 'rp-test-key'
  process.env.RUNPOD_ENDPOINT_STANDARD = 'ep-standard'
  process.env.AI_PUBLIC_ORIGIN = 'https://lattice.example'
  delete process.env.AI_JOB_SECRET
  upstream = (url) => {
    if (url.includes('/run')) return { ok: true, status: 200, body: { id: 'job-1', status: 'IN_QUEUE' } }
    if (url.includes('/status/')) return { ok: true, status: 200, body: { status: 'IN_PROGRESS' } }
    return { ok: true, status: 200, body: { id: 'job-1', status: 'CANCELLED' } }
  }
  stubRunPod()
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.unstubAllGlobals()
})

const submitBody = (over: Record<string, unknown> = {}) => ({
  actionId: 'text-to-image',
  projectId: 'proj_1',
  params: { steps: 20 },
  deadlineMs: 120_000,
  ...over,
})

/* ---------------- capabilities ---------------- */

describe('GET /api/ai/capabilities', () => {
  it('lists what the deployment can run', async () => {
    const { res, sent } = makeRes()
    await capabilities({ method: 'GET' }, res)
    expect(sent.code).toBe(200)
    expect(sent.body).toMatchObject({ configured: true })
    expect((sent.body as { actions: string[] }).actions).toContain('text-to-image')
  })

  it('says so honestly when nothing is configured', async () => {
    delete process.env.RUNPOD_API_KEY
    const { res, sent } = makeRes()
    await capabilities({ method: 'GET' }, res)
    expect(sent.body).toMatchObject({ configured: false, reason: 'not-configured', actions: [] })
  })

  /** No endpoint id, no hostname, no hint of which classes exist. */
  it('reveals nothing about RunPod', async () => {
    const { res, sent } = makeRes()
    await capabilities({ method: 'GET' }, res)
    expect(JSON.stringify(sent.body)).not.toMatch(/runpod|ep-standard/i)
  })
})

/* ---------------- submit ---------------- */

describe('POST /api/ai/submit', () => {
  it('accepts a job and hands back a ticket, never an endpoint', async () => {
    const { res, sent } = makeRes()
    await submit({ method: 'POST', body: submitBody() }, res)

    expect(sent.code).toBe(200)
    const body = sent.body as { jobId: string; ticket: string; deadlineAt: number }
    expect(body.jobId).toBe('job-1')
    expect(body.ticket).toMatch(/^v1\./)
    expect(JSON.stringify(sent.body)).not.toMatch(/rp-test-key|ep-standard|runpod/i)
  })

  it('passes the deadline to RunPod as its execution timeout', async () => {
    const calls: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body?: string }) => {
        calls.push(JSON.parse(init.body ?? '{}'))
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'job-1', status: 'IN_QUEUE' }) }
      }),
    )
    const { res } = makeRes()
    await submit({ method: 'POST', body: submitBody({ deadlineMs: 60_000 }) }, res)

    expect(calls[0]).toMatchObject({ policy: { executionTimeout: 60_000 } })
  })

  /** A browser must not be able to buy itself more GPU time than the action allows. */
  it('clamps a deadline the caller asked to extend', async () => {
    const calls: { policy?: { executionTimeout?: number } }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body?: string }) => {
        calls.push(JSON.parse(init.body ?? '{}'))
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'job-1', status: 'IN_QUEUE' }) }
      }),
    )
    const { res } = makeRes()
    await submit({ method: 'POST', body: submitBody({ deadlineMs: 99_999_999 }) }, res)

    expect(calls[0].policy?.executionTimeout).toBe(180_000)
  })

  it('gives RunPod a signed webhook URL', async () => {
    const bodies: { webhook?: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body?: string }) => {
        bodies.push(JSON.parse(init.body ?? '{}'))
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'job-1', status: 'IN_QUEUE' }) }
      }),
    )
    const { res } = makeRes()
    await submit({ method: 'POST', body: submitBody() }, res)

    expect(bodies[0].webhook).toContain('https://lattice.example/api/ai/callback?cb=')
  })

  it('records the job so a webhook has something to close', async () => {
    const { res } = makeRes()
    await submit({ method: 'POST', body: submitBody() }, res)

    const record = await db.aiJobs.get('job-1')
    expect(record).toMatchObject({
      subject: 'sub-1',
      actionId: 'text-to-image',
      gpuClass: 'standard',
      closedAt: null,
    })
  })

  it('still answers with a ticket when there is no database to record in', async () => {
    databasePresent = false
    const { res, sent } = makeRes()
    await submit({ method: 'POST', body: submitBody() }, res)
    expect(sent.code).toBe(200)
  })

  it('refuses when no hosted backend is configured', async () => {
    delete process.env.RUNPOD_API_KEY
    const { res, sent } = makeRes()
    await submit({ method: 'POST', body: submitBody() }, res)
    expect(sent.code).toBe(501)
    expect(sent.body).toMatchObject({ reason: 'not-configured' })
  })

  it('refuses an unknown action', async () => {
    const { res, sent } = makeRes()
    await submit({ method: 'POST', body: submitBody({ actionId: 'summon-a-pony' }) }, res)
    expect(sent.body).toMatchObject({ reason: 'invalid-parameters' })
  })

  /** The same pure check the browser ran. One definition of a range. */
  it('re-checks the parameter ranges the client already checked', async () => {
    const { res, sent } = makeRes()
    await submit({ method: 'POST', body: submitBody({ params: { steps: 5_000 } }) }, res)
    expect(sent.code).toBe(400)
    expect(sent.body).toMatchObject({ reason: 'invalid-parameters' })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('re-checks the input size the client already checked', async () => {
    const { res, sent } = makeRes()
    await submit(
      {
        method: 'POST',
        body: submitBody({
          actionId: 'upscale',
          params: { scale: '2' },
          inputs: [{ kind: 'image', contentType: 'image/png', base64: 'A'.repeat(8_000_000) }],
        }),
      },
      res,
    )
    expect(sent.code).toBe(413)
    expect(sent.body).toMatchObject({ reason: 'input-too-large' })
  })

  it('refuses a caller with no identity', async () => {
    identity = null
    const { res, sent } = makeRes()
    await submit({ method: 'POST', body: submitBody() }, res)
    expect(sent.code).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('refuses a member whose role cannot write content', async () => {
    liveblocks = {}
    acl = {
      ownerEmail: 'someone@example.com',
      admins: [],
      editors: [],
      commenters: [],
      viewers: ['ada@example.com'],
      bindings: [],
    }
    const { res, sent } = makeRes()
    await submit({ method: 'POST', body: submitBody() }, res)
    expect(sent.code).toBe(403)
    expect(sent.body).toMatchObject({ reason: 'unauthorized' })
  })

  it('allows a project that has no server-side ACL at all', async () => {
    liveblocks = {}
    acl = null
    const { res, sent } = makeRes()
    await submit({ method: 'POST', body: submitBody() }, res)
    expect(sent.code).toBe(200)
  })

  it('translates an out-of-credit upstream into the reason that says so', async () => {
    upstream = () => ({ ok: false, status: 402, body: { error: 'insufficient funds' } })
    stubRunPod()
    const { res, sent } = makeRes()
    await submit({ method: 'POST', body: submitBody() }, res)
    expect(sent.code).toBe(402)
    expect(sent.body).toMatchObject({ reason: 'no-credit' })
  })
})

/* ---------------- status ---------------- */

describe('POST /api/ai/status', () => {
  const ticket = () => mintTicket({ jobId: 'job-1', subject: 'sub-1', gpuClass: 'standard' })

  it('answers for a job the ticket authorises', async () => {
    const { res, sent } = makeRes()
    await status({ method: 'POST', body: { jobId: 'job-1', ticket: ticket() } }, res)
    expect(sent.code).toBe(200)
    expect(sent.body).toMatchObject({ state: 'running' })
  })

  it('refuses a ticket minted for a different job', async () => {
    const { res, sent } = makeRes()
    await status({ method: 'POST', body: { jobId: 'job-2', ticket: ticket() } }, res)
    expect(sent.code).toBe(403)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('refuses a ticket minted for a different account', async () => {
    identity = { sub: 'sub-2', email: 'bob@example.com', name: 'Bob', picture: '' }
    const { res, sent } = makeRes()
    await status({ method: 'POST', body: { jobId: 'job-1', ticket: ticket() } }, res)
    expect(sent.code).toBe(403)
  })

  it('closes the ledger line when a poll sees the job finish', async () => {
    await db.aiJobs.record(openJob())
    upstream = () => ({
      ok: true,
      status: 200,
      body: { status: 'COMPLETED', executionTime: 3_000, output: { images: ['x'] } },
    })
    stubRunPod()

    const { res, sent } = makeRes()
    await status({ method: 'POST', body: { jobId: 'job-1', ticket: ticket() } }, res)

    expect(sent.body).toMatchObject({ state: 'succeeded' })
    const record = await db.aiJobs.get('job-1')
    expect(record?.state).toBe('succeeded')
    expect(record?.closedAt).not.toBeNull()
  })

  it('works on a deployment with no database at all', async () => {
    databasePresent = false
    const { res, sent } = makeRes()
    await status({ method: 'POST', body: { jobId: 'job-1', ticket: ticket() } }, res)
    expect(sent.code).toBe(200)
  })
})

/* ---------------- cancel ---------------- */

describe('POST /api/ai/cancel', () => {
  const ticket = () => mintTicket({ jobId: 'job-1', subject: 'sub-1', gpuClass: 'standard' })

  it('reaches RunPod rather than only the UI', async () => {
    const { res, sent } = makeRes()
    await cancel({ method: 'POST', body: { jobId: 'job-1', ticket: ticket() } }, res)

    expect(sent.code).toBe(200)
    expect(fetchCalls().some((url) => url.includes('/cancel/job-1'))).toBe(true)
  })

  it('closes the ledger line as cancelled', async () => {
    await db.aiJobs.record(openJob())
    const { res } = makeRes()
    await cancel({ method: 'POST', body: { jobId: 'job-1', ticket: ticket() } }, res)

    const record = await db.aiJobs.get('job-1')
    expect(record).toMatchObject({ state: 'cancelled', failureReason: 'cancelled' })
  })

  /** Reporting a cancellation that did not happen is the bug this prevents. */
  it('reports the failure when RunPod refused the cancellation', async () => {
    upstream = () => ({ ok: false, status: 500, body: { error: 'boom' } })
    stubRunPod()
    const { res, sent } = makeRes()
    await cancel({ method: 'POST', body: { jobId: 'job-1', ticket: ticket() } }, res)

    expect(sent.code).not.toBe(200)
    expect(sent.body).toMatchObject({ reason: 'upstream-error' })
  })

  it('refuses a ticket that does not authorise this job', async () => {
    const { res, sent } = makeRes()
    await cancel({ method: 'POST', body: { jobId: 'job-1', ticket: 'forged' } }, res)
    expect(sent.code).toBe(403)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

/* ---------------- callback ---------------- */

describe('POST /api/ai/callback', () => {
  it('closes a job whose browser never came back', async () => {
    const minted = mintCallbackToken()
    await db.aiJobs.record(openJob({ callbackTokenHash: callbackTokenHash(minted.token) }))

    const { res, sent } = makeRes()
    await callback(
      {
        method: 'POST',
        url: `/api/ai/callback?cb=${encodeURIComponent(minted.value)}`,
        body: { id: 'job-1', status: 'COMPLETED', executionTime: 5_000, output: { images: ['x'] } },
      },
      res,
    )

    expect(sent.code).toBe(200)
    const record = await db.aiJobs.get('job-1')
    expect(record).toMatchObject({ state: 'succeeded', executionMs: 5_000 })
    expect(record?.closedAt).not.toBeNull()
  })

  /** The acceptance criterion, stated as a test. */
  it('closes nothing when the callback is unsigned', async () => {
    const minted = mintCallbackToken()
    await db.aiJobs.record(openJob({ callbackTokenHash: callbackTokenHash(minted.token) }))

    const { res, sent } = makeRes()
    await callback(
      {
        method: 'POST',
        url: `/api/ai/callback?cb=${encodeURIComponent(minted.token)}`,
        body: { id: 'job-1', status: 'COMPLETED' },
      },
      res,
    )

    expect(sent.code).toBe(401)
    expect((await db.aiJobs.get('job-1'))?.closedAt).toBeNull()
  })

  it('closes nothing when there is no token at all', async () => {
    const { res, sent } = makeRes()
    await callback({ method: 'POST', url: '/api/ai/callback', body: { id: 'job-1' } }, res)
    expect(sent.code).toBe(401)
  })

  /** A single leaked callback URL must not be able to close every job. */
  it('refuses a validly signed token that belongs to another job', async () => {
    await db.aiJobs.record(openJob({ callbackTokenHash: callbackTokenHash('the-real-one') }))
    const other = mintCallbackToken()

    const { res, sent } = makeRes()
    await callback(
      {
        method: 'POST',
        url: `/api/ai/callback?cb=${encodeURIComponent(other.value)}`,
        body: { id: 'job-1', status: 'COMPLETED' },
      },
      res,
    )

    expect(sent.code).toBe(403)
    expect((await db.aiJobs.get('job-1'))?.closedAt).toBeNull()
  })

  it('does not reopen or overwrite a job that a poll already closed', async () => {
    const minted = mintCallbackToken()
    await db.aiJobs.record(openJob({ callbackTokenHash: callbackTokenHash(minted.token) }))
    await db.aiJobs.close('job-1', { state: 'cancelled', closedAt: 1_000, failureReason: 'cancelled' })

    const { res } = makeRes()
    await callback(
      {
        method: 'POST',
        url: `/api/ai/callback?cb=${encodeURIComponent(minted.value)}`,
        body: { id: 'job-1', status: 'COMPLETED' },
      },
      res,
    )

    expect(await db.aiJobs.get('job-1')).toMatchObject({ state: 'cancelled', closedAt: 1_000 })
  })

  it('will not write a non-terminal state over an open job', async () => {
    const minted = mintCallbackToken()
    await db.aiJobs.record(openJob({ callbackTokenHash: callbackTokenHash(minted.token) }))

    const { res, sent } = makeRes()
    await callback(
      {
        method: 'POST',
        url: `/api/ai/callback?cb=${encodeURIComponent(minted.value)}`,
        body: { id: 'job-1', status: 'IN_PROGRESS' },
      },
      res,
    )

    expect(sent.body).toMatchObject({ recorded: false })
    expect((await db.aiJobs.get('job-1'))?.closedAt).toBeNull()
  })

  it('acknowledges rather than retries when there is nothing to record in', async () => {
    databasePresent = false
    const minted = mintCallbackToken()
    const { res, sent } = makeRes()
    await callback(
      {
        method: 'POST',
        url: `/api/ai/callback?cb=${encodeURIComponent(minted.value)}`,
        body: { id: 'job-1', status: 'COMPLETED' },
      },
      res,
    )
    expect(sent.code).toBe(200)
    expect(sent.body).toMatchObject({ recorded: false })
  })
})

function openJob(over: Partial<AiJobRecord> = {}): AiJobRecord {
  return {
    jobId: 'job-1',
    subject: 'sub-1',
    actionId: 'text-to-image',
    gpuClass: 'standard',
    projectId: 'proj_1',
    state: 'queued',
    callbackTokenHash: 'hash',
    submittedAt: Date.now(),
    deadlineAt: Date.now() + 120_000,
    closedAt: null,
    failureReason: null,
    executionMs: null,
    ...over,
  }
}

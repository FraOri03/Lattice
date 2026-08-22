import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { AI_ACTIONS, type AiActionId, type GpuClass } from '../../src/lib/ai/actions.js'
import { AI_FAILURES } from '../../src/lib/ai/jobModel.js'
import type { AiFailureReason, AiJobOutput, AiJobState } from '../../src/lib/ai/jobModel.js'
import { httpStatusFor } from '../../src/lib/ai/protocol.js'
import type { ApiRes } from './realtime.js'

/**
 * Everything `/api/ai/*` needs to talk to RunPod — and the reason the
 * browser cannot.
 *
 * `RUNPOD_API_KEY` is a server secret. It lives in the Vercel environment,
 * is read only here, and never carries a `VITE_` prefix, because anything
 * that does is compiled into the public bundle
 * (`docs/deploy-and-secrets.md`). `api/realtime/media-token.ts` is the
 * pattern this follows: the client asks our endpoint, the endpoint verifies
 * identity and authorisation, and only then uses the secret.
 *
 * The endpoint *ids* are secrets by the same logic — not because knowing
 * one grants access, but because a RunPod endpoint id plus a leaked key is
 * a bill, and there is no reason for the browser to hold either half.
 *
 * ## Stateless authorisation: the ticket
 *
 * Asking "how is job X doing" has to be authorised, and looking it up in a
 * table would make AI depend on a database that this deployment treats as
 * optional everywhere else. So the answer travels with the job: at
 * submission the endpoint mints a {@link mintTicket signed ticket} binding
 * the job id to the account that paid for it and to the GPU class that ran
 * it. A ticket cannot be forged without the server secret, cannot be moved
 * to another job, and expires. The database, when there is one, is for the
 * ledger and the webhook — not for authorising a poll.
 */

/* ---------------- configuration ---------------- */

/** One RunPod endpoint per GPU class; a class with no endpoint is not offered. */
const ENDPOINT_VARS: Readonly<Record<GpuClass, string>> = {
  light: 'RUNPOD_ENDPOINT_LIGHT',
  standard: 'RUNPOD_ENDPOINT_STANDARD',
  heavy: 'RUNPOD_ENDPOINT_HEAVY',
}

export function runpodKey(): string {
  return process.env.RUNPOD_API_KEY ?? ''
}

/**
 * The endpoint that runs this class, or an empty string.
 *
 * Falling back to `RUNPOD_ENDPOINT_STANDARD` is deliberate: a deployment
 * that has provisioned only one endpoint should still work, and the
 * alternative — refusing every light action because no cheap endpoint
 * exists — would be a worse default than running it on hardware that is
 * merely oversized.
 */
export function endpointFor(gpuClass: GpuClass): string {
  return (
    process.env[ENDPOINT_VARS[gpuClass]] ??
    process.env.RUNPOD_ENDPOINT_STANDARD ??
    ''
  )
}

/**
 * Actions this deployment can actually run right now.
 *
 * An action with no GPU class is not a RunPod action at all — the catalogue
 * holds more than GPU work, and Photo mode's set designer is answered by a
 * language model in the browser. Filtering on the class rather than
 * defaulting it keeps this endpoint from claiming work it cannot do.
 */
export function availableActions(): AiActionId[] {
  if (!runpodKey()) return []
  return (Object.keys(AI_ACTIONS) as AiActionId[]).filter((id) => {
    const gpuClass = AI_ACTIONS[id].gpuClass
    return gpuClass !== undefined && endpointFor(gpuClass).length > 0
  })
}

export function aiConfigured(): boolean {
  return availableActions().length > 0
}

/**
 * The origin RunPod should call back on.
 *
 * Empty when the deployment cannot name itself, and that is a real state
 * rather than a misconfiguration to crash on: without it the job simply has
 * no webhook and polling remains the only channel, which still works.
 */
export function publicOrigin(): string {
  const explicit = process.env.AI_PUBLIC_ORIGIN
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? ''
  return vercel ? `https://${vercel}` : ''
}

/**
 * The key the tickets and the callback tokens are signed with.
 *
 * `AI_JOB_SECRET` when set; otherwise derived from the RunPod key with a
 * domain separator, so a deployment does not have to invent and rotate a
 * second secret to get signed tickets. Deriving is safe here because the
 * derived value is never sent anywhere — only signatures are — and it
 * changes when the RunPod key is rotated, which invalidates outstanding
 * tickets for jobs that key can no longer be used to poll anyway.
 */
function signingKey(purpose: 'ticket' | 'callback'): Buffer {
  const base = process.env.AI_JOB_SECRET || runpodKey()
  return createHmac('sha256', base).update(`lattice-ai-${purpose}`).digest()
}

function sign(purpose: 'ticket' | 'callback', payload: string): string {
  return createHmac('sha256', signingKey(purpose)).update(payload).digest('base64url')
}

function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/* ---------------- tickets ---------------- */

/** A ticket outlives the longest action by a wide margin, and no more. */
const TICKET_TTL_MS = 60 * 60_000

export interface TicketClaims {
  readonly jobId: string
  readonly subject: string
  readonly gpuClass: GpuClass
}

/**
 * `v1.<gpuClass>.<expiry>.<signature>`.
 *
 * The GPU class rides along in the clear because status and cancel are
 * per-endpoint calls and the server would otherwise need a lookup to know
 * which endpoint a job belongs to. It is a tier name, not an address: it
 * tells the browser nothing it could use, and nothing about which RunPod
 * endpoint ran the job.
 */
export function mintTicket(claims: TicketClaims, now = Date.now()): string {
  const exp = now + TICKET_TTL_MS
  const signature = sign(
    'ticket',
    `${claims.jobId}|${claims.subject}|${claims.gpuClass}|${exp}`,
  )
  return `v1.${claims.gpuClass}.${exp}.${signature}`
}

/**
 * Check a ticket against the job and the caller it claims to be for.
 *
 * Returns the GPU class on success and null on any failure, deliberately
 * without saying which: "wrong signature" and "expired" are the same answer
 * to anyone who should not have had a ticket in the first place.
 */
export function verifyTicket(
  ticket: unknown,
  jobId: string,
  subject: string,
  now = Date.now(),
): GpuClass | null {
  if (typeof ticket !== 'string') return null
  const parts = ticket.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return null
  const [, gpuClass, expRaw, signature] = parts
  if (!isGpuClass(gpuClass)) return null
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < now) return null
  const expected = sign('ticket', `${jobId}|${subject}|${gpuClass}|${exp}`)
  return sameSignature(signature, expected) ? gpuClass : null
}

function isGpuClass(value: string): value is GpuClass {
  return value === 'light' || value === 'standard' || value === 'heavy'
}

/* ---------------- callback tokens ---------------- */

export interface CallbackToken {
  /** Goes in the webhook URL RunPod is given. */
  readonly value: string
  /** Stored with the job row; what a callback is matched against. */
  readonly token: string
}

/**
 * A one-shot secret in the webhook URL, and the whole of the callback's
 * authentication.
 *
 * RunPod does not sign its webhooks, so the URL has to be the credential:
 * a random token plus a signature over it. An unsigned or mis-signed
 * callback is rejected before anything is read from its body, which is what
 * "an unsigned callback closes nothing" means in practice.
 */
export function mintCallbackToken(): CallbackToken {
  const token = randomBytes(24).toString('base64url')
  return { token, value: `${token}.${sign('callback', token)}` }
}

/** The token a callback proved it holds, or null. */
export function verifyCallbackToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const at = value.lastIndexOf('.')
  if (at <= 0) return null
  const token = value.slice(0, at)
  const signature = value.slice(at + 1)
  return sameSignature(signature, sign('callback', token)) ? token : null
}

/** What is stored instead of the token itself, so a leaked table grants nothing. */
export function callbackTokenHash(token: string): string {
  return createHmac('sha256', signingKey('callback')).update(token).digest('base64url')
}

/* ---------------- talking to RunPod ---------------- */

const RUNPOD_BASE = 'https://api.runpod.ai/v2'

export interface RunPodJobView {
  readonly state: AiJobState
  readonly progress?: number
  readonly previewUrl?: string
  readonly outputs?: AiJobOutput[]
  readonly executionMs?: number
  readonly seed?: number
  readonly failure?: { reason: AiFailureReason; detail: string }
}

export class UpstreamError extends Error {
  constructor(
    readonly reason: AiFailureReason,
    detail: string,
  ) {
    super(detail)
    this.name = 'UpstreamError'
  }
}

async function callRunPod(
  gpuClass: GpuClass,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<unknown> {
  const key = runpodKey()
  const endpoint = endpointFor(gpuClass)
  if (!key || !endpoint) {
    throw new UpstreamError(
      'not-configured',
      `No RunPod endpoint is configured for the ${gpuClass} GPU class.`,
    )
  }
  let res: Response
  try {
    res = await fetch(`${RUNPOD_BASE}/${endpoint}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    })
  } catch (err) {
    throw new UpstreamError(
      'network-lost',
      `Could not reach RunPod: ${err instanceof Error ? err.message : 'unknown error'}`,
    )
  }
  const text = await res.text()
  if (!res.ok) throw upstreamFailure(res.status, text)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new UpstreamError('upstream-error', 'RunPod answered with something that is not JSON.')
  }
}

/**
 * An HTTP failure from RunPod, translated into the taxonomy.
 *
 * The distinction that matters most is between "your account has a problem"
 * and "our deployment has a problem": a rejected key or a missing endpoint
 * is ours, and telling the user to try again would be a lie.
 */
export function upstreamFailure(status: number, body: string): UpstreamError {
  const detail = body.slice(0, 300)
  const lower = detail.toLowerCase()
  if (status === 401 || status === 403) {
    return new UpstreamError(
      'not-configured',
      `RunPod rejected this deployment's credential (HTTP ${status}).`,
    )
  }
  if (status === 402 || lower.includes('insufficient') || lower.includes('balance')) {
    return new UpstreamError('no-credit', 'The RunPod account is out of credit.')
  }
  if (status === 404) {
    return new UpstreamError(
      'not-configured',
      'RunPod does not know this endpoint id — check the RUNPOD_ENDPOINT_* variables.',
    )
  }
  if (status === 429 || status === 503) {
    return new UpstreamError('no-capacity', 'RunPod has no worker available right now.')
  }
  return new UpstreamError('upstream-error', `RunPod answered ${status}: ${detail}`)
}

interface RunPodSubmitBody {
  input: Record<string, unknown>
  webhook?: string
  policy?: { executionTimeout?: number; ttl?: number }
}

/** Submit a job. Returns RunPod's id — the only handle that exists. */
export async function submitJob(args: {
  gpuClass: GpuClass
  input: Record<string, unknown>
  deadlineMs: number
  webhook?: string
}): Promise<{ jobId: string; state: AiJobState }> {
  const body: RunPodSubmitBody = {
    input: args.input,
    policy: {
      // The server half of the deadline. Without it an abandoned tab leaves
      // a job running until RunPod's own default expires, which is the
      // difference between a deadline and a hope.
      executionTimeout: args.deadlineMs,
      // How long RunPod keeps the result once it is done. Long enough for a
      // browser to come back after a reload, short enough not to be storage.
      ttl: Math.max(args.deadlineMs, 10 * 60_000),
    },
  }
  if (args.webhook) body.webhook = args.webhook

  const raw = (await callRunPod(args.gpuClass, '/run', { method: 'POST', body })) as {
    id?: unknown
    status?: unknown
  }
  if (typeof raw.id !== 'string' || !raw.id) {
    throw new UpstreamError('upstream-error', 'RunPod accepted the job without returning an id.')
  }
  return { jobId: raw.id, state: mapStatus(raw.status) }
}

export async function jobStatus(gpuClass: GpuClass, jobId: string): Promise<RunPodJobView> {
  const raw = await callRunPod(gpuClass, `/status/${encodeURIComponent(jobId)}`, {
    method: 'GET',
  })
  return viewOf(raw)
}

/**
 * Cancel upstream.
 *
 * The whole point of the endpoint that calls this: a job cancelled in the
 * browser that keeps running is a bill nobody agreed to.
 */
export async function cancelJob(gpuClass: GpuClass, jobId: string): Promise<void> {
  await callRunPod(gpuClass, `/cancel/${encodeURIComponent(jobId)}`, { method: 'POST' })
}

/* ---------------- reading RunPod's answers ---------------- */

/** RunPod's job statuses, mapped onto ours. */
export function mapStatus(status: unknown): AiJobState {
  switch (status) {
    case 'IN_QUEUE':
    case 'RETRIED':
      return 'queued'
    case 'IN_PROGRESS':
      return 'running'
    case 'COMPLETED':
      return 'succeeded'
    case 'CANCELLED':
      return 'cancelled'
    case 'TIMED_OUT':
      return 'timed-out'
    case 'FAILED':
      return 'failed'
    default:
      // An unknown status is not a finished job, and guessing "succeeded"
      // would hand the caller an empty result. Keep waiting instead.
      return 'queued'
  }
}

/**
 * A failed job's `error` string, mapped onto the taxonomy.
 *
 * Our own container names its reason: 21.2's handler answers
 * `"[invalid-parameters] ..."`, because a worker that knows exactly what went
 * wrong should not make this function guess. The prefix is only trusted when
 * it names a reason the taxonomy actually has — an upstream free to write
 * anything into a string must not be free to choose how the UI reacts.
 *
 * Without a prefix, only two shapes are worth recognising: a container that
 * does not have the model the action asked for (a deployment mistake, and
 * retrying will not help), and everything else. Guessing more finely from
 * free text would produce confident wrong answers.
 */
export function mapJobError(error: string): { reason: AiFailureReason; detail: string } {
  const named = /^\s*\[([a-z-]{3,20})\]\s*(.*)$/s.exec(error)
  if (named && Object.hasOwn(AI_FAILURES, named[1])) {
    return { reason: named[1] as AiFailureReason, detail: named[2].slice(0, 300) }
  }

  const lower = error.toLowerCase()
  if (
    lower.includes('checkpoint') ||
    lower.includes('model not found') ||
    lower.includes('no such file')
  ) {
    return {
      reason: 'model-missing',
      detail: `The worker does not have the model this action needs: ${error.slice(0, 300)}`,
    }
  }
  return { reason: 'upstream-error', detail: error.slice(0, 300) }
}

/**
 * Read a `/status` payload.
 *
 * The `output` half is the container's contract with us (21.2 owns the
 * other side): a finished job yields `{ images, seed }`, and one still
 * sampling may yield `{ progress, preview }`. Both are read defensively,
 * because a container that emits neither must still produce a job that
 * completes rather than one that throws on the way out.
 */
export function viewOf(raw: unknown): RunPodJobView {
  const job = (raw ?? {}) as Record<string, unknown>
  const state = mapStatus(job.status)
  const executionMs = typeof job.executionTime === 'number' ? job.executionTime : undefined

  if (state === 'failed') {
    const error = typeof job.error === 'string' ? job.error : 'RunPod reported a failed job.'
    return { state, executionMs, failure: mapJobError(error) }
  }
  if (state === 'timed-out') {
    return {
      state,
      executionMs,
      failure: { reason: 'timed-out', detail: 'RunPod stopped the job at its execution timeout.' },
    }
  }
  if (state === 'cancelled') {
    return {
      state,
      executionMs,
      failure: { reason: 'cancelled', detail: 'The job was cancelled.' },
    }
  }

  const output = normaliseOutput(job.output ?? job.stream)
  return {
    state,
    executionMs,
    progress: typeof output.progress === 'number' ? clamp01(output.progress) : undefined,
    previewUrl: typeof output.preview === 'string' ? output.preview : undefined,
    seed: typeof output.seed === 'number' ? output.seed : undefined,
    outputs: imagesOf(output.images),
  }
}

/**
 * A generator handler streams a list; a plain one returns an object. Both
 * arrive on the same field, so the last item of a list is the current
 * truth and an object is a list of one.
 */
function normaliseOutput(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const merged: Record<string, unknown> = {}
    for (const item of value) {
      if (item && typeof item === 'object') Object.assign(merged, item)
      // RunPod wraps streamed items as { output: ... } on some endpoints.
      const wrapped = (item as Record<string, unknown> | null)?.output
      if (wrapped && typeof wrapped === 'object') Object.assign(merged, wrapped)
    }
    return merged
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function imagesOf(value: unknown): AiJobOutput[] | undefined {
  if (!Array.isArray(value)) return undefined
  const outputs: AiJobOutput[] = []
  for (const item of value) {
    if (typeof item === 'string') outputs.push({ url: item, kind: 'image' })
    else if (item && typeof item === 'object') {
      const url = (item as Record<string, unknown>).url
      if (typeof url === 'string') outputs.push({ url, kind: 'image' })
    }
  }
  return outputs.length > 0 ? outputs : undefined
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/* ---------------- responses ---------------- */

/**
 * The one way an `/api/ai/*` endpoint reports a failure.
 *
 * Always a `reason` alongside the sentence, because the browser has to
 * decide whether retrying is sensible and a status code cannot tell it.
 */
export function sendAiError(res: ApiRes, reason: AiFailureReason, error: string): void {
  res.status(httpStatusFor(reason)).json({ error, reason })
}

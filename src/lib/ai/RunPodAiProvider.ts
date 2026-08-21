import { authService } from '@/lib/auth/AuthService'
import { NotAuthenticatedError, sessionClient } from '@/lib/auth/sessionClient'
import { hasHostedAiBackend } from '@/lib/env'
import {
  AI_ACTIONS,
  AI_ACTION_IDS,
  MAX_AI_INPUT_BYTES,
  invalidParams,
  type AiActionId,
} from './actions.js'
import {
  AiJobError,
  type AiBackendProvider,
  type AiCapabilities,
  type AiJobHandle,
  type AiSubmitOptions,
} from './AiBackendProvider.js'
import { pollDelayMs } from './backoff.js'
import {
  COLD_START_AFTER_MS,
  isTerminal,
  type AiFailureReason,
  type AiJobResult,
  type AiJobSnapshot,
  type AiJobState,
} from './jobModel.js'
import { forgetAiJob, rememberAiJob, updateAiJob, type PersistedAiJob } from './jobStore.js'
import {
  AI_CANCEL_URL,
  AI_CAPABILITIES_URL,
  AI_STATUS_URL,
  AI_SUBMIT_URL,
  aiErrorOf,
  type AiCapabilitiesResponse,
  type AiInlineInput,
  type AiStatusResponse,
  type AiSubmitResponse,
} from './protocol.js'

/**
 * `RunPodAiProvider` — the hosted half of the seam.
 *
 * It talks to `/api/ai/*` and to nothing else. There is no RunPod hostname
 * in this file, no endpoint id, and no key: the browser names an action,
 * the endpoint decides which GPU class and which endpoint that means, and
 * the answer never comes back. That is not a stylistic choice — anything
 * named `VITE_*` is compiled into the public bundle
 * (`docs/deploy-and-secrets.md`), so a hosted credential reachable from
 * here would be a published credential.
 *
 * ## The shape of a job
 *
 * Submit once, then poll. RunPod serverless is asynchronous by nature, and
 * its synchronous variant is a trap for anything slower than a few seconds:
 * it holds a connection open, and a Vercel function has its own execution
 * ceiling that the GPU job will outlive. Async plus polling is the only
 * shape that survives both.
 *
 * ## Three ways a job ends early, and why they are not the same
 *
 * - **Cancel** — the user asked. It reaches RunPod, because a job cancelled
 *   only in the UI keeps burning GPU minutes, and that is a billing bug
 *   rather than a cosmetic one.
 * - **Deadline** — the job outran the action's ceiling. Also cancelled
 *   upstream, for the same reason, and reported as `timed-out` rather than
 *   `cancelled` so the surface can tell the user which of the two happened.
 * - **Abort** — the caller's `AbortSignal`. Composes with both: it cancels
 *   upstream and settles the handle.
 *
 * Notably, an abort during *submission* does not abort the request. A
 * submission that is cut off after RunPod accepted the job but before the
 * id came back is precisely how a paid job is orphaned — so the submission
 * always completes, and an abort that arrived meanwhile cancels the job it
 * produced.
 */

/** Consecutive failed polls before the browser admits it lost the network. */
const MAX_POLL_FAILURES = 5

/** How long a capabilities answer is trusted before asking again. */
const CAPABILITIES_TTL_MS = 5 * 60_000

const requireGoogleToken = () => authService.getAccessToken()

/* ---------------- the handle ---------------- */

interface JobRef {
  readonly jobId: string
  readonly ticket: string
  readonly actionId: AiActionId
  readonly submittedAt: number
  readonly deadlineAt: number
}

class RunPodJob implements AiJobHandle {
  readonly jobId: string

  private ref: JobRef
  private opts: AiSubmitOptions
  private current: AiJobSnapshot
  private settled = false
  private cancelling: Promise<void> | null = null
  private resolve!: (result: AiJobResult) => void
  private reject!: (err: AiJobError) => void
  private readonly promise: Promise<AiJobResult>
  private readonly onAbort = () => {
    void this.stop('cancelled', 'The caller aborted the job.')
  }

  constructor(ref: JobRef, opts: AiSubmitOptions, initial: AiJobState) {
    this.ref = ref
    this.jobId = ref.jobId
    this.opts = opts
    this.current = {
      jobId: ref.jobId,
      actionId: ref.actionId,
      state: initial,
      progress: 0,
      submittedAt: ref.submittedAt,
      deadlineAt: ref.deadlineAt,
    }
    this.promise = new Promise<AiJobResult>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
    // A promise nobody awaits until later must not become an unhandled
    // rejection in the meantime; `result()` hands out the same promise.
    this.promise.catch(() => {})
    opts.signal?.addEventListener('abort', this.onAbort)
    void this.poll()
  }

  snapshot(): AiJobSnapshot {
    return this.current
  }

  result(): Promise<AiJobResult> {
    return this.promise
  }

  /** Cancel upstream. Idempotent, and safe to call on a finished job. */
  cancel(): Promise<void> {
    return this.stop('cancelled', 'Cancelled from the browser.')
  }

  /* ---------------- the loop ---------------- */

  private async poll(): Promise<void> {
    let attempt = 0
    let regime: AiJobState = this.current.state
    let failures = 0

    while (!this.settled) {
      const delay = pollDelayMs(attempt, regime)
      await sleep(Math.min(delay, Math.max(0, this.ref.deadlineAt - Date.now())))
      if (this.settled) return

      if (Date.now() > this.ref.deadlineAt) {
        await this.stop('timed-out', 'The job outran its deadline.')
        return
      }

      let status: AiStatusResponse
      try {
        status = await this.fetchStatus()
        failures = 0
      } catch (err) {
        if (err instanceof AiJobError && err.failure.reason !== 'network-lost') {
          this.settle(err)
          return
        }
        if (++failures >= MAX_POLL_FAILURES) {
          this.settle(
            new AiJobError(
              'network-lost',
              `Lost contact with the server after ${failures} attempts. The job may still be running.`,
            ),
          )
          return
        }
        attempt += 1
        continue
      }

      const next = this.reconcile(status)
      if (next !== regime) {
        // A new regime restarts the backoff: a delay earned while nothing
        // was happening must not be inherited by the phase that has
        // progress to report.
        regime = next
        attempt = 0
      } else {
        attempt += 1
      }
    }
  }

  /** Apply a status payload to the snapshot, and settle if it is terminal. */
  private reconcile(status: AiStatusResponse): AiJobState {
    const observed = this.withColdStart(status.state)

    this.emit({
      ...this.current,
      state: observed,
      progress: status.progress ?? this.current.progress,
      queuePosition: status.queuePosition ?? this.current.queuePosition,
      previewUrl: status.previewUrl ?? this.current.previewUrl,
      failure: status.failure ?? this.current.failure,
    })

    if (!isTerminal(observed)) return observed

    if (observed === 'succeeded') {
      this.settleSuccess({
        jobId: this.ref.jobId,
        actionId: this.ref.actionId,
        outputs: status.outputs ?? [],
        durationMs: Date.now() - this.ref.submittedAt,
        executionMs: status.executionMs,
        seed: status.seed,
      })
    } else {
      const reason: AiFailureReason =
        status.failure?.reason ?? (observed === 'cancelled' ? 'cancelled' : 'timed-out')
      this.settle(
        new AiJobError(reason, status.failure?.detail ?? `The job ended as ${observed}.`),
      )
    }
    return observed
  }

  /**
   * `queued` for long enough is a cold start, and is displayed as one.
   *
   * RunPod reports both waits as `IN_QUEUE`, so the distinction is made
   * here from elapsed time rather than bought with an extra request to the
   * endpoint's health route on every poll.
   */
  private withColdStart(state: AiJobState): AiJobState {
    if (state !== 'queued') return state
    if (this.current.state === 'cold-start') return 'cold-start'
    return Date.now() - this.ref.submittedAt >= COLD_START_AFTER_MS ? 'cold-start' : 'queued'
  }

  private async fetchStatus(): Promise<AiStatusResponse> {
    const res = await postJson(AI_STATUS_URL, {
      jobId: this.ref.jobId,
      ticket: this.ref.ticket,
    })
    if (!res.ok) throw await failureFrom(res)
    return (await res.json()) as AiStatusResponse
  }

  /* ---------------- ending it ---------------- */

  /**
   * Reach RunPod, then settle. One path for cancel, deadline and abort,
   * because all three have the same obligation: the money stops.
   */
  private stop(reason: 'cancelled' | 'timed-out', detail: string): Promise<void> {
    if (this.settled) return Promise.resolve()
    this.cancelling ??= (async () => {
      try {
        const res = await postJson(AI_CANCEL_URL, {
          jobId: this.ref.jobId,
          ticket: this.ref.ticket,
        })
        if (!res.ok && res.status !== 404) {
          // The job may still be running and still costing money. Say so:
          // silently reporting "cancelled" here is the exact lie this
          // endpoint exists to prevent.
          const failure = await failureFrom(res)
          this.settle(
            new AiJobError(
              failure.failure.reason,
              `Cancellation did not reach the backend (${failure.failure.detail}). The job may still be running.`,
            ),
          )
          return
        }
      } catch {
        this.settle(
          new AiJobError(
            'network-lost',
            'Cancellation could not be sent. The job may still be running on the backend.',
          ),
        )
        return
      }
      this.settle(new AiJobError(reason, detail))
    })()
    return this.cancelling
  }

  private settleSuccess(result: AiJobResult): void {
    if (this.settled) return
    this.settled = true
    this.cleanup()
    this.resolve(result)
  }

  private settle(err: AiJobError): void {
    if (this.settled) return
    this.settled = true
    this.emit({ ...this.current, state: err.state, failure: err.failure })
    this.cleanup()
    this.reject(err)
  }

  private cleanup(): void {
    this.opts.signal?.removeEventListener('abort', this.onAbort)
    forgetAiJob(this.ref.jobId)
  }

  private emit(next: AiJobSnapshot): void {
    const changed =
      next.state !== this.current.state ||
      next.progress !== this.current.progress ||
      next.previewUrl !== this.current.previewUrl ||
      next.queuePosition !== this.current.queuePosition ||
      next.failure !== this.current.failure
    this.current = next
    if (!changed) return
    if (!isTerminal(next.state)) updateAiJob(this.ref.jobId, next.state)
    this.opts.onSnapshot?.(next)
  }
}

/* ---------------- the provider ---------------- */

let cachedCapabilities: { at: number; value: AiCapabilities } | null = null

export const RunPodAiProvider: AiBackendProvider = {
  id: 'hosted',
  label: 'Hosted GPU workers',
  requiresUpload: true,
  disclosure: { destination: 'deployment', cost: 'deployment' },

  // An action with no GPU class is one no GPU backend can run — the
  // catalogue holds more than GPU work, and saying "yes" here would mean
  // submitting a set-design prompt to a diffusion endpoint.
  canRun: (action) => hasHostedAiBackend && Boolean(AI_ACTIONS[action]?.gpuClass),

  async capabilities() {
    if (!hasHostedAiBackend) {
      return { configured: false, actions: [], reason: 'not-configured' }
    }
    const fresh = cachedCapabilities && Date.now() - cachedCapabilities.at < CAPABILITIES_TTL_MS
    if (fresh && cachedCapabilities) return cachedCapabilities.value

    let value: AiCapabilities
    try {
      const res = await fetch(AI_CAPABILITIES_URL, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (res.ok) {
        const body = (await res.json()) as AiCapabilitiesResponse
        value = {
          configured: body.configured === true,
          actions: (body.actions ?? []).filter((id) => AI_ACTION_IDS.includes(id)),
          reason: body.reason,
        }
      } else {
        value = { configured: false, actions: [], reason: 'not-configured' }
      }
    } catch {
      // Offline is not "unconfigured", and saying so would hide the feature
      // permanently behind a flaky minute. Report it as the network problem
      // it is and try again on the next ask.
      return { configured: false, actions: [], reason: 'network-lost' }
    }
    cachedCapabilities = { at: Date.now(), value }
    return value
  },

  async submit(req, opts = {}) {
    if (!hasHostedAiBackend) {
      throw new AiJobError(
        'not-configured',
        'This build was not compiled with the hosted AI backend (VITE_AI_BACKEND=hosted).',
      )
    }
    const action = AI_ACTIONS[req.actionId]
    if (!action) {
      throw new AiJobError('invalid-parameters', `Unknown action "${req.actionId}".`)
    }

    const bad = invalidParams(req.actionId, req.params)
    if (bad.length > 0) {
      throw new AiJobError(
        'invalid-parameters',
        `Out of range or unknown for ${req.actionId}: ${bad.join(', ')}.`,
      )
    }

    const inputs = req.inputs ?? []
    if (inputs.length !== action.inputs.length) {
      throw new AiJobError(
        'invalid-parameters',
        `${req.actionId} needs ${action.inputs.length} input(s), got ${inputs.length}.`,
      )
    }
    if (inputs.length > 0) {
      // Same rule as remote conversion: bytes off the user's machine need an
      // explicit yes, every time, and the provider is where that is enforced
      // rather than in whichever surface happened to remember.
      if (!opts.uploadConsent) {
        throw new AiJobError(
          'consent-required',
          'This action uploads an image to a hosted GPU worker, which needs explicit consent.',
        )
      }
      for (const input of inputs) {
        if (input.blob.size > Math.min(action.maxInputBytes, MAX_AI_INPUT_BYTES)) {
          throw new AiJobError(
            'input-too-large',
            `Input exceeds the ${Math.round(MAX_AI_INPUT_BYTES / (1024 * 1024))} MB limit.`,
          )
        }
      }
    }

    const deadlineMs = Math.min(opts.deadlineMs ?? action.deadlineMs, action.deadlineMs)
    const encoded: AiInlineInput[] = []
    for (const input of inputs) {
      encoded.push({
        kind: input.kind,
        contentType: input.blob.type || 'application/octet-stream',
        base64: await blobToBase64(input.blob),
      })
    }

    let res: Response
    try {
      res = await sessionClient.post(
        AI_SUBMIT_URL,
        {
          actionId: req.actionId,
          projectId: req.projectId,
          params: req.params,
          deadlineMs,
          ...(encoded.length > 0 ? { inputs: encoded } : {}),
        },
        requireGoogleToken,
      )
    } catch (err) {
      if (err instanceof NotAuthenticatedError) {
        throw new AiJobError('unauthorized', 'Sign in — AI jobs are run against an account.')
      }
      throw new AiJobError(
        'network-lost',
        err instanceof Error ? err.message : 'The submission never reached the server.',
      )
    }
    if (!res.ok) throw await failureFrom(res)

    const accepted = (await res.json()) as AiSubmitResponse
    const ref: JobRef = {
      jobId: accepted.jobId,
      ticket: accepted.ticket,
      actionId: req.actionId,
      submittedAt: accepted.submittedAt,
      deadlineAt: accepted.deadlineAt,
    }
    rememberAiJob({ ...ref, state: accepted.state })
    return new RunPodJob(ref, opts, accepted.state)
  },
}

/**
 * Pick up a job a previous page load left running.
 *
 * The reason this exists at all: a refresh in the middle of a generation
 * must not orphan a job that is already being paid for. The vault holds the
 * id and the ticket; everything else is asked of the server again.
 */
export function reattachRunPodJob(
  job: PersistedAiJob,
  opts: AiSubmitOptions = {},
): AiJobHandle {
  return new RunPodJob(
    {
      jobId: job.jobId,
      ticket: job.ticket,
      actionId: job.actionId,
      submittedAt: job.submittedAt,
      deadlineAt: job.deadlineAt,
    },
    opts,
    job.state,
  )
}

/** Forget any cached capabilities answer — tests, and sign-out. */
export function resetAiCapabilitiesCache(): void {
  cachedCapabilities = null
}

/* ---------------- helpers ---------------- */

function postJson(url: string, body: Record<string, unknown>): Promise<Response> {
  return sessionClient.post(url, body, requireGoogleToken)
}

/**
 * Turn an endpoint's error body into the taxonomy.
 *
 * The endpoints answer with a `reason` precisely so this never has to guess
 * from a status code; the fallbacks below only cover a response that never
 * reached our handler at all (a platform 502, a gateway timeout).
 */
async function failureFrom(res: Response): Promise<AiJobError> {
  const body: unknown = await res.json().catch(() => null)
  const named = aiErrorOf(body)
  if (named) return new AiJobError(named.reason, named.error)
  if (res.status === 401 || res.status === 403) {
    return new AiJobError('unauthorized', 'The server refused the request.')
  }
  if (res.status === 501) {
    return new AiJobError('not-configured', 'No AI backend is configured on the server.')
  }
  if (res.status === 504) {
    return new AiJobError('timed-out', 'The server did not answer in time.')
  }
  return new AiJobError('upstream-error', `The server answered ${res.status}.`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

/**
 * Base64 without blowing the stack.
 *
 * `btoa(String.fromCharCode(...bytes))` is the one-liner everyone reaches
 * for and it throws on a few hundred kilobytes, because spreading a
 * megabyte-long array into arguments is not a thing JavaScript engines do.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

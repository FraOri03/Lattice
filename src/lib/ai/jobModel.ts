import type { AiActionId, AiAssetKind } from './actions.js'

/**
 * The AI job lifecycle and the failure taxonomy.
 *
 * Shared VERBATIM by the browser and the endpoints, the same
 * dependency-free arrangement `src/lib/collab/acl.ts` uses and for the same
 * reason: the two must not be able to drift. The client can only ever
 * *predict* what the server reports; `/api/ai/status` is the authority.
 *
 * ## Why cold start is a state
 *
 * A serverless GPU worker can take tens of seconds to come up. During that
 * time RunPod says `IN_QUEUE`, which is also what it says when a job is
 * waiting behind other work — and neither is distinguishable from a hung
 * job if all the UI has is a spinner. So the wait is split: {@link
 * COLD_START_AFTER_MS} of queueing with no worker assigned is reported as
 * `cold-start`, which the surface can say out loud ("waiting for a GPU")
 * rather than leaving as silence.
 *
 * ## Why the machine is monotone
 *
 * Every legal transition moves forward. A poll that arrives out of order,
 * or a webhook that lands while a poll is in flight, must not be able to
 * drag a finished job back to `running` — {@link canTransition} is what
 * makes "terminal" mean terminal, and it is the reason the reducer can be
 * applied to whatever arrives first without a sequence number.
 */

export type AiJobState =
  /** Accepted by RunPod, waiting for a worker that already exists. */
  | 'queued'
  /** Waiting for a worker to be started. Distinct, and displayed. */
  | 'cold-start'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed-out'

export const AI_TERMINAL_STATES: readonly AiJobState[] = [
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
]

export function isTerminal(state: AiJobState): boolean {
  return AI_TERMINAL_STATES.includes(state)
}

/** How long a job may sit in `queued` before the wait is called a cold start. */
export const COLD_START_AFTER_MS = 10_000

const LEGAL: Readonly<Record<AiJobState, readonly AiJobState[]>> = {
  queued: ['cold-start', 'running', 'succeeded', 'failed', 'cancelled', 'timed-out'],
  // No way back to `queued`: the wait only ever gets longer, and a
  // transition that undid the cold-start message would make the UI flicker
  // between two descriptions of the same silence.
  'cold-start': ['running', 'succeeded', 'failed', 'cancelled', 'timed-out'],
  running: ['succeeded', 'failed', 'cancelled', 'timed-out'],
  succeeded: [],
  failed: [],
  cancelled: [],
  'timed-out': [],
}

/** Whether the machine allows this move. A no-op (`from === to`) is legal. */
export function canTransition(from: AiJobState, to: AiJobState): boolean {
  return from === to || LEGAL[from].includes(to)
}

/* ---------------- the failure taxonomy ---------------- */

/**
 * Every way a job can end badly, named once.
 *
 * The list is closed because the surface has to have a sentence for each
 * one: a raw upstream error or a bare status code is not a message, and
 * `docs/limitations.md` asks for the opposite of that everywhere else in
 * the app.
 */
export type AiFailureReason =
  /** No hosted backend on this deployment. Nothing the user can fix. */
  | 'not-configured'
  /** The endpoint refused the caller: not signed in, or not a member. */
  | 'unauthorized'
  /** A binary input would have been uploaded and consent was not given. */
  | 'consent-required'
  | 'input-too-large'
  | 'invalid-parameters'
  /** The RunPod account is out of credit. */
  | 'no-credit'
  /**
   * The backend has nothing free to run this on — capacity, not a fault.
   *
   * Named for the shortage rather than for a GPU worker: the same state is
   * a queued serverless endpoint, a rate-limited vendor API, and a local
   * ComfyUI already busy with another job. The first version of this list
   * called it `no-worker`, which was a RunPod word in a file that is
   * supposed to outlive RunPod.
   */
  | 'no-capacity'
  /** The endpoint is running a container without the model this action needs. */
  | 'model-missing'
  /** Anything the upstream reported that is none of the above. */
  | 'upstream-error'
  | 'cancelled'
  | 'timed-out'
  /** The browser lost the network, or the request was aborted locally. */
  | 'network-lost'

/**
 * What the surface should tell the user about trying again.
 *
 * `later` and `after-change` are separate on purpose: "the GPUs are busy"
 * and "your image is too big" both mean *not now*, but only one of them is
 * the user's move.
 */
export type AiRetryStance =
  /** Retrying the same request is reasonable right now. */
  | 'yes'
  /** Retrying will fail the same way until something is changed first. */
  | 'after-change'
  /** Worth trying again, but not immediately. */
  | 'later'
  /** Retrying cannot help; the user needs a different route entirely. */
  | 'no'

export interface AiFailureShape {
  readonly retry: AiRetryStance
  /**
   * Whether GPU time was (or may have been) spent before the failure.
   *
   * The retry policy hangs off this: a bounded automatic retry is fine for
   * a request that never reached a worker, and is never acceptable for one
   * that did. Money makes retrying a user decision.
   */
  readonly billed: boolean
}

export const AI_FAILURES: Readonly<Record<AiFailureReason, AiFailureShape>> = {
  'not-configured': { retry: 'no', billed: false },
  unauthorized: { retry: 'after-change', billed: false },
  'consent-required': { retry: 'after-change', billed: false },
  'input-too-large': { retry: 'after-change', billed: false },
  'invalid-parameters': { retry: 'after-change', billed: false },
  'no-credit': { retry: 'no', billed: false },
  'no-capacity': { retry: 'later', billed: false },
  'model-missing': { retry: 'no', billed: false },
  // The upstream already had the job when it broke, so some of it may have
  // run. Retrying is the user's call, never the client's.
  'upstream-error': { retry: 'later', billed: true },
  cancelled: { retry: 'yes', billed: true },
  'timed-out': { retry: 'later', billed: true },
  // The job may well still be running on RunPod — the browser simply stopped
  // hearing about it. `reattach` is the cure, retrying is the fallback.
  'network-lost': { retry: 'yes', billed: true },
}

export interface AiFailure {
  readonly reason: AiFailureReason
  /**
   * English detail for logs and bug reports — never rendered on its own.
   * The surface shows the localised sentence for `reason`; this is what a
   * developer needs when the sentence is not enough.
   */
  readonly detail: string
}

/** Whether this failure may be retried without asking the user first. */
export function mayRetryAutomatically(reason: AiFailureReason): boolean {
  const shape = AI_FAILURES[reason]
  return !shape.billed && shape.retry === 'yes'
}

/** The terminal state a failure reason lands the job in. */
export function stateForFailure(reason: AiFailureReason): AiJobState {
  if (reason === 'cancelled') return 'cancelled'
  if (reason === 'timed-out') return 'timed-out'
  return 'failed'
}

/* ---------------- what a caller observes ---------------- */

export interface AiJobSnapshot {
  readonly jobId: string
  readonly actionId: AiActionId
  readonly state: AiJobState
  /** 0..1 where the backend reports it; otherwise 0 until the job ends. */
  readonly progress: number
  /** Where the job sits in the queue, when the backend says. */
  readonly queuePosition?: number
  /**
   * A partial image emitted during sampling, as a data or blob URL.
   *
   * On a job of thirty to sixty seconds this moves perceived latency more
   * than any optimisation of the job itself, which is why it is part of the
   * snapshot rather than an extra channel a surface has to opt into.
   */
  readonly previewUrl?: string
  readonly submittedAt: number
  readonly deadlineAt: number
  readonly failure?: AiFailure
}

/**
 * One thing a job produced.
 *
 * Two shapes, because the catalogue holds two kinds of work. A GPU worker
 * writes bytes somewhere and hands back a `url`; a language model answering
 * with a structured layout has no bytes to write, and its answer IS the
 * result — so it comes back in `value`.
 *
 * `value` is `unknown` on purpose, and it is the one deliberately untyped
 * field in the seam. The alternative is the catalogue importing the model
 * types of every consumer that might ever receive an output, which is the
 * coupling this file exists to prevent — pointing the other way. The
 * action's declared `output` kind is what tells a caller how to narrow it,
 * and the adapter that asked for the action is the only code that should.
 */
export interface AiJobOutput {
  readonly kind: AiAssetKind
  /** Where the result can be fetched. 21.5 decides where it then lives. */
  readonly url?: string
  /** The result itself, for an output that is structure rather than bytes. */
  readonly value?: unknown
  readonly bytes?: number
}

export interface AiJobResult {
  readonly jobId: string
  readonly actionId: AiActionId
  readonly outputs: readonly AiJobOutput[]
  /** Wall-clock, submission to terminal state — queue time included. */
  readonly durationMs: number
  /** Worker seconds RunPod reported, when it reported any. 21.4 prices these. */
  readonly executionMs?: number
  /** The seed actually used, for the actions that are reproducible. */
  readonly seed?: number
}

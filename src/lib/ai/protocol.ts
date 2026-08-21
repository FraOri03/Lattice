import type { AiActionId, AiAssetKind } from './actions.js'
import type { AiFailureReason, AiJobOutput, AiJobState } from './jobModel.js'

/**
 * The wire contract between the browser and `/api/ai/*`.
 *
 * Shared VERBATIM by both sides, dependency-free, the same arrangement as
 * `src/lib/collab/acl.ts`. It exists so there is exactly one description of
 * each message: an endpoint and a client that each define their own idea of
 * a status payload will agree right up until one of them changes.
 *
 * Note what is NOT in here: no RunPod hostname, no endpoint id, no notion
 * of a GPU class as an address. The browser names an *action*; which
 * endpoint runs it is decided server-side from the catalogue and never
 * travels back. That is what makes the acceptance criterion "no RunPod
 * hostname, endpoint id or credential in the client bundle" checkable by
 * reading one file.
 */

/** Where the endpoints live. Same-origin, so no configuration is needed. */
export const AI_SUBMIT_URL = '/api/ai/submit'
export const AI_STATUS_URL = '/api/ai/status'
export const AI_CANCEL_URL = '/api/ai/cancel'
export const AI_CAPABILITIES_URL = '/api/ai/capabilities'

/** A binary input, inline. See `MAX_AI_INPUT_BYTES` for why inline. */
export interface AiInlineInput {
  readonly kind: AiAssetKind
  readonly contentType: string
  /** Standard base64, no data-URL prefix. */
  readonly base64: string
}

export interface AiSubmitBody {
  readonly actionId: AiActionId
  readonly projectId: string
  readonly params: Readonly<Record<string, number | string | boolean>>
  /** The caller's deadline. Clamped server-side to the action's own. */
  readonly deadlineMs: number
  readonly inputs?: readonly AiInlineInput[]
  /** Only on a browser with no session — see `requireIdentity`. */
  readonly googleToken?: string
}

export interface AiSubmitResponse {
  readonly jobId: string
  /**
   * The capability that lets this browser ask about, and cancel, this job.
   *
   * Signed server-side and bound to the account it was issued to, which is
   * why `/api/ai/status` needs no job table to authorise a request. It is
   * stored in the vault next to the job id so a reload can reattach.
   */
  readonly ticket: string
  readonly state: AiJobState
  readonly submittedAt: number
  readonly deadlineAt: number
}

export interface AiJobRefBody {
  readonly jobId: string
  readonly ticket: string
  readonly googleToken?: string
}

export interface AiStatusResponse {
  readonly state: AiJobState
  readonly progress?: number
  readonly queuePosition?: number
  /** A partial image the container emitted during sampling, if any. */
  readonly previewUrl?: string
  readonly outputs?: readonly AiJobOutput[]
  readonly executionMs?: number
  readonly seed?: number
  readonly failure?: { readonly reason: AiFailureReason; readonly detail: string }
}

export interface AiCapabilitiesResponse {
  readonly configured: boolean
  readonly actions: readonly AiActionId[]
  readonly reason?: AiFailureReason
}

/**
 * The error body every `/api/ai/*` endpoint answers with.
 *
 * `error` is English detail for a developer; `reason` is what the surface
 * branches on and localises. An endpoint that returned only a status code
 * would leave the client guessing whether retrying is sensible, which is
 * the one thing the taxonomy exists to answer.
 */
export interface AiErrorResponse {
  readonly error: string
  readonly reason: AiFailureReason
}

/** Narrow an unknown response body to {@link AiErrorResponse}. */
export function aiErrorOf(body: unknown): AiErrorResponse | null {
  if (!body || typeof body !== 'object') return null
  const candidate = body as Record<string, unknown>
  if (typeof candidate.error !== 'string' || typeof candidate.reason !== 'string') return null
  return { error: candidate.error, reason: candidate.reason as AiFailureReason }
}

/**
 * The HTTP status an endpoint answers with for a given failure.
 *
 * Kept beside the taxonomy rather than chosen per endpoint, so the same
 * failure never arrives as a 400 from one route and a 500 from another —
 * and so `sessionClient.post` can keep treating 401/403 as "re-probe the
 * session" without a special case for AI.
 */
export function httpStatusFor(reason: AiFailureReason): number {
  switch (reason) {
    case 'not-configured':
      return 501
    case 'unauthorized':
      return 403
    case 'consent-required':
    case 'invalid-parameters':
      return 400
    case 'input-too-large':
      return 413
    case 'no-credit':
      return 402
    case 'no-capacity':
      return 503
    case 'model-missing':
      return 500
    case 'timed-out':
      return 504
    default:
      return 502
  }
}

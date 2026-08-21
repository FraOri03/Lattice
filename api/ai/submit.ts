import {
  aiConfigured,
  availableActions,
  mintCallbackToken,
  mintTicket,
  publicOrigin,
  sendAiError,
  submitJob,
  UpstreamError,
  callbackTokenHash,
} from '../_lib/ai.js'
import { liveblocksClient, loadAcl, principalOf, requireIdentity, type ApiRes } from '../_lib/realtime.js'
import { repositories } from '../_lib/db/index.js'
import { roleOf } from '../../src/lib/collab/acl.js'
import { roleWritesContent } from '../../src/lib/collab/roleAccess.js'
import { isValidProjectId } from '../../src/lib/media/mediaRoomId.js'
import {
  AI_ACTIONS,
  MAX_AI_INPUT_BYTES,
  invalidParams,
  isAiActionId,
} from '../../src/lib/ai/actions.js'
import type { AiInlineInput, AiSubmitBody } from '../../src/lib/ai/protocol.js'
import type { ApiRequest } from '../_lib/session.js'

/**
 * POST /api/ai/submit — turn an action from the catalogue into a GPU job.
 *
 * This is where the RunPod key is used and the only place it is readable.
 * The browser names an action; this endpoint decides which GPU class that
 * means, which RunPod endpoint runs that class, and what the job's
 * execution timeout is. None of those answers travel back — the client gets
 * a job id and a ticket, and nothing it could use to talk to RunPod itself.
 *
 * Same security model as `api/realtime/media-token.ts`:
 *  - **identity** comes from the session cookie, or from a Google token
 *    verified against Google. Never from the request body.
 *  - **authorisation** is the project ACL, when the deployment has one to
 *    consult. 21.7 owns the full policy — who may spend, and whose budget.
 *  - **the ceiling** is 21.4's. This endpoint enforces the catalogue's
 *    limits (parameter ranges, input size, deadline) and no spend limit;
 *    that gap is deliberate and recorded rather than silently assumed away.
 */

/** Base64 is 4 characters per 3 bytes; this is that, without decoding it. */
function base64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.floor((value.length * 3) / 4) - padding
}

function readInputs(value: unknown): AiInlineInput[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const inputs: AiInlineInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const raw = item as Record<string, unknown>
    if (
      typeof raw.base64 !== 'string' ||
      typeof raw.contentType !== 'string' ||
      (raw.kind !== 'image' && raw.kind !== 'mask' && raw.kind !== 'text')
    ) {
      return null
    }
    inputs.push({ kind: raw.kind, contentType: raw.contentType, base64: raw.base64 })
  }
  return inputs
}

export default async function handler(req: ApiRequest, res: ApiRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    sendAiError(res, 'invalid-parameters', 'POST only.')
    return
  }
  if (!aiConfigured()) {
    sendAiError(
      res,
      'not-configured',
      'No hosted AI backend is configured on the server (RUNPOD_API_KEY and RUNPOD_ENDPOINT_* are missing).',
    )
    return
  }

  const body = (req.body ?? {}) as Partial<AiSubmitBody>
  if (!isAiActionId(body.actionId)) {
    sendAiError(res, 'invalid-parameters', 'Unknown or missing actionId.')
    return
  }
  const action = AI_ACTIONS[body.actionId]
  if (!availableActions().includes(action.id)) {
    sendAiError(
      res,
      'not-configured',
      `No RunPod endpoint is configured for the ${action.gpuClass} GPU class this action needs.`,
    )
    return
  }
  if (!isValidProjectId(body.projectId)) {
    sendAiError(res, 'invalid-parameters', 'Invalid projectId.')
    return
  }
  const projectId = body.projectId

  const params = (body.params ?? {}) as Record<string, unknown>
  const bad = invalidParams(action.id, params)
  if (bad.length > 0) {
    // The same pure function the browser ran before submitting. One
    // definition of a range, checked on both sides.
    sendAiError(res, 'invalid-parameters', `Out of range or unknown: ${bad.join(', ')}.`)
    return
  }

  const inputs = readInputs(body.inputs)
  if (!inputs) {
    sendAiError(res, 'invalid-parameters', 'Malformed inputs.')
    return
  }
  if (inputs.length !== action.inputs.length) {
    sendAiError(
      res,
      'invalid-parameters',
      `${action.id} needs ${action.inputs.length} input(s), got ${inputs.length}.`,
    )
    return
  }
  for (const input of inputs) {
    if (base64Bytes(input.base64) > Math.min(action.maxInputBytes, MAX_AI_INPUT_BYTES)) {
      sendAiError(res, 'input-too-large', 'An input exceeds the upload limit.')
      return
    }
  }

  const identity = await requireIdentity(req, res, body.googleToken)
  if (!identity) return

  /*
   * Membership, where there is a membership to check.
   *
   * A project that has never had a realtime room is a local-first project
   * with no server-side ACL, and refusing to run AI on it would be refusing
   * the app's own default shape. Where a room does exist, the role decides:
   * a viewer who could spend the owner's GPU credit would be a hole 21.7
   * would have to close anyway.
   */
  const lb = liveblocksClient()
  if (lb) {
    const acl = await loadAcl(lb, projectId)
    if (acl) {
      const role = roleOf(acl, principalOf(identity))
      if (!role || !roleWritesContent(role)) {
        sendAiError(
          res,
          'unauthorized',
          `${identity.email} may not run AI actions in this project.`,
        )
        return
      }
    }
  }

  const deadlineMs = clampDeadline(body.deadlineMs, action.deadlineMs)
  const callback = mintCallbackToken()
  const origin = publicOrigin()

  try {
    const accepted = await submitJob({
      gpuClass: action.gpuClass,
      deadlineMs,
      // The container's contract, and the only place an action becomes a
      // payload. 21.2 owns the other side of it.
      input: {
        action: action.id,
        params,
        inputs: inputs.map((i) => ({
          kind: i.kind,
          contentType: i.contentType,
          base64: i.base64,
        })),
      },
      // No origin means the deployment cannot name itself, so there is no
      // webhook and polling is the only channel. That still works; silently
      // sending RunPod a URL it cannot reach would not.
      webhook: origin ? `${origin}/api/ai/callback?cb=${encodeURIComponent(callback.value)}` : undefined,
    })

    const submittedAt = Date.now()
    const deadlineAt = submittedAt + deadlineMs
    const ticket = mintTicket(
      { jobId: accepted.jobId, subject: identity.sub, gpuClass: action.gpuClass },
      submittedAt,
    )

    const db = repositories()
    if (db) {
      try {
        await db.aiJobs.record({
          jobId: accepted.jobId,
          subject: identity.sub,
          actionId: action.id,
          gpuClass: action.gpuClass,
          projectId,
          state: accepted.state,
          callbackTokenHash: callbackTokenHash(callback.token),
          submittedAt,
          deadlineAt,
          closedAt: null,
          failureReason: null,
          executionMs: null,
        })
      } catch (err) {
        /*
         * The job is already running and already costing money. Failing the
         * request here would hand the caller an error for a job it cannot
         * then cancel, which is the worst of both — so the ledger line is
         * lost, loudly, and the ticket still goes back.
         */
        console.error('[ai] could not record job', accepted.jobId, err)
      }
    }

    res.status(200).json({
      jobId: accepted.jobId,
      ticket,
      state: accepted.state,
      submittedAt,
      deadlineAt,
    })
  } catch (err) {
    if (err instanceof UpstreamError) {
      sendAiError(res, err.reason, err.message)
      return
    }
    sendAiError(res, 'upstream-error', err instanceof Error ? err.message : 'Submission failed.')
  }
}

/**
 * The caller may ask for less time than the action allows, never more.
 *
 * A deadline is a spend limit wearing a different hat: the number that
 * reaches RunPod as `executionTimeout` is what stops an abandoned job from
 * running forever, so it cannot be something the browser gets to raise.
 */
function clampDeadline(requested: unknown, ceiling: number): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return ceiling
  }
  return Math.min(Math.round(requested), ceiling)
}

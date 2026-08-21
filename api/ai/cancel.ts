import { cancelJob, sendAiError, UpstreamError, verifyTicket } from '../_lib/ai.js'
import { requireIdentity, type ApiRes } from '../_lib/realtime.js'
import { repositories } from '../_lib/db/index.js'
import type { AiJobRefBody } from '../../src/lib/ai/protocol.js'
import type { ApiRequest } from '../_lib/session.js'

/**
 * POST /api/ai/cancel — stop the job, and stop the meter.
 *
 * The endpoint exists because "cancelled" in a browser is not cancellation.
 * A job whose UI has been dismissed keeps occupying a GPU and keeps being
 * billed for it, so the cancel has to reach RunPod, and the caller has to
 * be told whether it did. A 200 here means RunPod accepted the cancellation;
 * anything else means the job may still be running, and the client says so
 * rather than pretending.
 *
 * Authorised by the same signed ticket as `/api/ai/status`, which is what
 * stops one account cancelling another's work by guessing an id.
 */
export default async function handler(req: ApiRequest, res: ApiRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    sendAiError(res, 'invalid-parameters', 'POST only.')
    return
  }

  const body = (req.body ?? {}) as Partial<AiJobRefBody>
  const jobId = typeof body.jobId === 'string' ? body.jobId : ''
  if (!jobId) {
    sendAiError(res, 'invalid-parameters', 'Missing jobId.')
    return
  }

  const identity = await requireIdentity(req, res, body.googleToken)
  if (!identity) return

  const gpuClass = verifyTicket(body.ticket, jobId, identity.sub)
  if (!gpuClass) {
    sendAiError(res, 'unauthorized', 'This ticket does not authorise cancelling that job.')
    return
  }

  try {
    await cancelJob(gpuClass, jobId)
  } catch (err) {
    if (err instanceof UpstreamError) {
      sendAiError(res, err.reason, err.message)
      return
    }
    sendAiError(
      res,
      'upstream-error',
      err instanceof Error ? err.message : 'Cancellation failed.',
    )
    return
  }

  const db = repositories()
  if (db) {
    try {
      await db.aiJobs.close(jobId, {
        state: 'cancelled',
        closedAt: Date.now(),
        failureReason: 'cancelled',
      })
    } catch (err) {
      // RunPod has already stopped the job, which was the point. A missing
      // ledger line is 21.10's problem to reconcile, not a reason to tell
      // the user their cancellation failed.
      console.error('[ai] could not close a cancelled job', jobId, err)
    }
  }

  res.status(200).json({ state: 'cancelled' })
}

import { jobStatus, sendAiError, UpstreamError, verifyTicket } from '../_lib/ai.js'
import { requireIdentity, type ApiRes } from '../_lib/realtime.js'
import { repositories } from '../_lib/db/index.js'
import { isTerminal } from '../../src/lib/ai/jobModel.js'
import type { RunPodJobView } from '../_lib/ai.js'
import type { AiJobRefBody, AiStatusResponse } from '../../src/lib/ai/protocol.js'
import type { ApiRequest } from '../_lib/session.js'

/**
 * POST /api/ai/status — how is this job doing.
 *
 * POST rather than GET because the ticket is a credential and belongs in a
 * body rather than in a URL that ends up in logs and referrers.
 *
 * ## Authorised without a lookup
 *
 * The ticket was signed at submission against the job id and the caller's
 * subject. Verifying it proves both, so this endpoint answers correctly on
 * a deployment with no database at all — which is the shape Lattice
 * promises everywhere else and had no reason to abandon here.
 *
 * The database, where there is one, is written to rather than read from: a
 * poll that observes a terminal state closes the ledger line, so a job does
 * not have to wait for its webhook to be accounted for.
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
    sendAiError(res, 'unauthorized', 'This ticket does not authorise asking about that job.')
    return
  }

  try {
    const view = await jobStatus(gpuClass, jobId)
    if (isTerminal(view.state)) await closeLedger(jobId, view)

    const payload: AiStatusResponse = {
      state: view.state,
      progress: view.progress,
      // Deliberately absent: RunPod reports no per-job queue position, and
      // the endpoint's total queue depth is a different question. The
      // surface shows the wait rather than a number that would be wrong.
      previewUrl: view.previewUrl,
      outputs: view.outputs,
      executionMs: view.executionMs,
      seed: view.seed,
      failure: view.failure,
    }
    res.status(200).json(payload)
  } catch (err) {
    if (err instanceof UpstreamError) {
      sendAiError(res, err.reason, err.message)
      return
    }
    sendAiError(res, 'upstream-error', err instanceof Error ? err.message : 'Status check failed.')
  }
}

async function closeLedger(jobId: string, view: RunPodJobView): Promise<void> {
  const db = repositories()
  if (!db) return
  try {
    await db.aiJobs.close(jobId, {
      state: view.state,
      closedAt: Date.now(),
      failureReason: view.failure?.reason ?? null,
      executionMs: view.executionMs ?? null,
    })
  } catch (err) {
    // The caller asked how their job is doing and that answer is in hand.
    // A ledger write that fails must not turn a successful job into an error.
    console.error('[ai] could not close job from a poll', jobId, err)
  }
}

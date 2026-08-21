import { callbackTokenHash, verifyCallbackToken, viewOf } from '../_lib/ai.js'
import { repositories } from '../_lib/db/index.js'
import type { ApiRes } from '../_lib/realtime.js'
import { isTerminal } from '../../src/lib/ai/jobModel.js'
import type { ApiRequest } from '../_lib/session.js'

/**
 * POST /api/ai/callback — RunPod says a job has ended.
 *
 * The cure for the orphaned paid job. Polling can only close a job whose
 * browser is still there to poll; this closes the one whose tab was shut
 * thirty seconds after it was submitted, which is the case that otherwise
 * leaves a GPU minute billed to nobody and nothing for 21.10 to find.
 *
 * ## What authenticates it
 *
 * RunPod does not sign its webhooks, so the URL is the credential: at
 * submission the endpoint mints a random token, signs it, and hands RunPod
 * `?cb=<token>.<signature>`. This handler verifies the signature before it
 * reads anything else, and then checks that the token is the one stored
 * with *that* job. An unsigned callback, a mis-signed one, or a valid token
 * pointed at a different job all close nothing.
 *
 * ## Why a deployment with no database answers 200
 *
 * There is nothing to close, and saying so with an error would only buy a
 * retry storm from RunPod against a deployment that will never be able to
 * accept the callback. The answer is honest instead of hopeful:
 * `recorded: false`, and polling remains the channel that works.
 */
interface CallbackRequest extends ApiRequest {
  /** Vercel hands the raw request line through; the token lives in its query. */
  url?: string
}

function callbackParam(req: CallbackRequest): string {
  // A relative URL needs a base to parse against; the base is thrown away.
  try {
    return new URL(req.url ?? '', 'https://lattice.invalid').searchParams.get('cb') ?? ''
  } catch {
    return ''
  }
}

export default async function handler(req: CallbackRequest, res: ApiRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only.' })
    return
  }

  const token = verifyCallbackToken(callbackParam(req))
  if (!token) {
    // Deliberately says nothing about why. Anyone who can reach this route
    // without a signature has no business learning how close they were.
    res.status(401).json({ error: 'Unsigned callback.' })
    return
  }

  const payload = (req.body ?? {}) as Record<string, unknown>
  const jobId = typeof payload.id === 'string' ? payload.id : ''
  if (!jobId) {
    res.status(400).json({ error: 'Callback carried no job id.' })
    return
  }

  const db = repositories()
  if (!db) {
    res.status(200).json({ ok: true, recorded: false })
    return
  }

  const record = await db.aiJobs.get(jobId)
  if (!record) {
    res.status(200).json({ ok: true, recorded: false })
    return
  }
  if (record.callbackTokenHash !== callbackTokenHash(token)) {
    // A signature proves the caller holds *a* token we issued; this proves
    // it holds the one issued for this job. Without the second check a
    // single leaked callback URL could close every job on the deployment.
    res.status(403).json({ error: 'That token does not belong to this job.' })
    return
  }

  const view = viewOf(payload)
  if (!isTerminal(view.state)) {
    // RunPod only calls back on completion, but a payload that does not say
    // so must not be allowed to write a non-terminal state over an open job.
    res.status(200).json({ ok: true, recorded: false })
    return
  }

  const closed = await db.aiJobs.close(jobId, {
    state: view.state,
    closedAt: Date.now(),
    failureReason: view.failure?.reason ?? null,
    executionMs: view.executionMs ?? null,
  })

  res.status(200).json({ ok: true, recorded: closed?.closedAt !== null })
}

import { availableActions } from '../_lib/ai.js'
import type { ApiRes } from '../_lib/realtime.js'
import type { AiCapabilitiesResponse } from '../../src/lib/ai/protocol.js'
import type { ApiRequest } from '../_lib/session.js'

/**
 * GET /api/ai/capabilities — what this deployment can actually run.
 *
 * Every other backend predicate in `src/lib/env.ts` is a build-time
 * constant compiled into the bundle, and AI must not be one: a deployment
 * has to be able to withdraw AI — a key revoked, an endpoint deleted, credit
 * exhausted — without a redeploy, and a browser holding a constant would go
 * on offering a button that cannot work.
 *
 * So availability is asked, not assumed. The answer names actions from the
 * shared catalogue and nothing else: no endpoint id, no hostname, no
 * indication of which GPU class is provisioned. Knowing that `upscale` is
 * available tells the browser what it needs and RunPod nothing at all.
 *
 * Unauthenticated on purpose. "Does this deployment offer AI" is the same
 * class of fact as "does it offer realtime", the UI needs it before anyone
 * signs in, and answering it for a stranger reveals nothing a look at the
 * login page would not.
 */
export default async function handler(req: ApiRequest, res: ApiRes): Promise<void> {
  // Short, not zero: it changes when an operator changes an environment
  // variable, which is rare, and a page load should not pay a round-trip
  // for it every time.
  res.setHeader('Cache-Control', 'public, max-age=60')
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only.' })
    return
  }

  const actions = availableActions()
  const payload: AiCapabilitiesResponse = {
    configured: actions.length > 0,
    actions,
    ...(actions.length === 0 ? { reason: 'not-configured' as const } : {}),
  }
  res.status(200).json(payload)
}

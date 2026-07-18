import { AccessToken } from 'livekit-server-sdk'
import {
  liveblocksClient,
  loadAcl,
  requireIdentity,
  roleOf,
  sendError,
  type ApiRes,
} from '../_lib/realtime.js'
import { isValidProjectId, mediaRoomId } from '../../src/lib/media/mediaRoomId.js'
import {
  mediaCapabilitiesFor,
  publishableSources,
} from '../../src/lib/media/mediaPermissions.js'

/**
 * POST /api/realtime/media-token — mint a LiveKit access token for a project
 * call.
 *
 * Body: { projectId: string, googleToken: string }
 *
 * Same security model as /api/realtime/auth, and for the same reason: the
 * browser must never be able to widen its own grant.
 *  - identity: the Google access token is verified against Google
 *    (signature/expiry/audience) and the e-mail comes from Google's answer.
 *  - authorization: the role is read from the project's ACL, which lives in the
 *    Liveblocks room metadata and is only writable through these endpoints.
 *    A `role` in the request body is ignored — it is never even read.
 *  - capabilities: derived from the shared matrix (mediaPermissions.ts) and
 *    baked into the signed token, so LiveKit itself enforces them. A tampered
 *    client cannot publish a screen share it was not granted.
 *
 * LIVEKIT_API_SECRET is only ever used to sign here; it is never returned.
 *
 * NOTE: media calls depend on the Liveblocks ACL for authorization, so a
 * deployment with LiveKit configured but no realtime backend has no
 * server-side membership to check and honestly reports 501.
 */

interface Req {
  method?: string
  body?: unknown
}

/** Long enough for a working session; the client re-requests when it expires. */
const TOKEN_TTL = '2h'

export default async function handler(req: Req, res: ApiRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    sendError(res, 405, 'POST only.')
    return
  }

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const url = process.env.VITE_LIVEKIT_URL ?? ''
  if (!apiKey || !apiSecret) {
    sendError(
      res,
      501,
      'Project calls are not configured on the server (LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing).',
    )
    return
  }

  const body = (req.body ?? {}) as { projectId?: unknown; googleToken?: unknown }
  const projectId = body.projectId
  if (!isValidProjectId(projectId)) {
    sendError(res, 400, 'Invalid projectId.')
    return
  }

  // membership lives in the Liveblocks room metadata — without it there is
  // nothing to authorize against, so refuse rather than guess
  const lb = liveblocksClient()
  if (!lb) {
    sendError(
      res,
      501,
      'Project membership is unavailable on the server (LIVEBLOCKS_SECRET_KEY missing), so call access cannot be verified.',
    )
    return
  }

  const identity = await requireIdentity(res, body.googleToken)
  if (!identity) return

  const acl = await loadAcl(lb, projectId)
  if (!acl) {
    sendError(res, 403, 'This project has no realtime room yet — open it as its owner first.')
    return
  }
  const role = roleOf(acl, identity.email)
  if (!role) {
    sendError(res, 403, `${identity.email} is not a member of this project (server check).`)
    return
  }

  const capabilities = mediaCapabilitiesFor(role)
  if (!capabilities.join) {
    sendError(res, 403, 'Your role cannot join this project call.')
    return
  }

  const room = mediaRoomId(projectId)
  const at = new AccessToken(apiKey, apiSecret, {
    // the LiveKit identity is the Google-verified e-mail, matching how
    // Liveblocks sessions are keyed, so the two systems agree on who is who
    identity: identity.email,
    name: identity.name || identity.email,
    metadata: JSON.stringify({ role, picture: identity.picture }),
    ttl: TOKEN_TTL,
  })
  at.addGrant({
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish: capabilities.audio || capabilities.video || capabilities.screenShare,
    // the real screen-share boundary: a role without it simply cannot publish
    // that source, whatever the client tries
    canPublishSources: publishableSources(role),
    canPublishData: true,
    canUpdateOwnMetadata: true,
    roomAdmin: capabilities.moderate,
  })

  res.status(200).json({
    token: await at.toJwt(),
    url,
    room,
    role,
    capabilities,
  })
}

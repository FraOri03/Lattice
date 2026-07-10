import {
  liveblocksClient,
  loadAcl,
  requireIdentity,
  roleOf,
  sendError,
  type ApiRes,
} from '../_lib/realtime'
import {
  collabRoomId,
  contentRoomId,
  parseRoomId,
  permissionsForRole,
} from '../../src/lib/collab/roleAccess'

/**
 * POST /api/realtime/auth — mint a Liveblocks access token.
 *
 * Body: { room: string, googleToken: string }
 *
 * The token's scopes are derived ONLY from server-side state:
 *  - identity: googleToken verified against Google (audience-checked)
 *  - role: the project ACL stored in the room metadata
 * The browser's claimed role is never read. Liveblocks then enforces the
 * scopes on every websocket operation, so a viewer's tampered client
 * still cannot write a single CRDT byte.
 */

interface Req {
  method?: string
  body?: unknown
}

export default async function handler(req: Req, res: ApiRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    sendError(res, 405, 'POST only.')
    return
  }
  const lb = liveblocksClient()
  if (!lb) {
    sendError(
      res,
      501,
      'Realtime backend is not configured on the server (LIVEBLOCKS_SECRET_KEY missing).',
    )
    return
  }

  const body = (req.body ?? {}) as { room?: unknown; googleToken?: unknown }
  const roomId = typeof body.room === 'string' ? body.room : ''
  const parsed = parseRoomId(roomId)
  if (!parsed) {
    sendError(res, 400, 'Unknown room id.')
    return
  }

  const identity = await requireIdentity(res, body.googleToken)
  if (!identity) return

  const acl = await loadAcl(lb, parsed.projectId)
  if (!acl) {
    sendError(res, 403, 'This project has no realtime room yet — open it as its owner first.')
    return
  }
  const role = roleOf(acl, identity.email)
  if (!role) {
    sendError(res, 403, `${identity.email} is not a member of this project (server check).`)
    return
  }

  const session = lb.prepareSession(identity.email, {
    userInfo: {
      name: identity.name || identity.email,
      picture: identity.picture,
      email: identity.email,
      role,
    },
  })
  // one token covers both of the project's rooms, scoped per role
  session.allow(contentRoomId(parsed.projectId), permissionsForRole(role, 'content'))
  session.allow(collabRoomId(parsed.projectId), permissionsForRole(role, 'collab'))

  const { status, body: authBody } = await session.authorize()
  res.status(status).setHeader('Content-Type', 'application/json')
  // authorize() returns a JSON string: { token } on success
  res.json(JSON.parse(authBody))
}

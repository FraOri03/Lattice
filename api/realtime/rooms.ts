import {
  addEmail,
  aclToMetadata,
  liveblocksClient,
  loadAcl,
  requireIdentity,
  roleOf,
  sendError,
  stripEmail,
  type ApiRes,
  type RoomAcl,
} from '../_lib/realtime'
import {
  collabRoomId,
  contentRoomId,
  roomIdsForProject,
} from '../../src/lib/collab/roleAccess'
import {
  assignableRoles,
  canManageRole,
} from '../../src/lib/collab/permissions'
import type { CollabRole } from '../../src/types/collab'

/**
 * POST /api/realtime/rooms — project room lifecycle + membership ACL.
 *
 * Actions (body.action):
 *  - ensure   {projectId, projectName?}      create rooms / report my role
 *  - members  {projectId}                    list the server-side ACL
 *  - set-role {projectId, email, role|null}  add/change/remove a member
 *  - delete   {projectId}                    owner only — delete the rooms
 *
 * EVERY action verifies the caller's Google token and derives the
 * caller's role from the stored ACL. The shared permission matrix
 * (src/lib/collab/permissions.ts) is evaluated HERE, server-side — the
 * same module the UI uses, so the rules cannot drift, but the browser's
 * answer is never trusted.
 */

interface Req {
  method?: string
  body?: unknown
}

const VALID_ROLES: CollabRole[] = ['owner', 'admin', 'editor', 'commenter', 'viewer']

interface Body {
  action?: unknown
  projectId?: unknown
  projectName?: unknown
  email?: unknown
  role?: unknown
  googleToken?: unknown
}

/** Metadata patch that also clears role lists that became empty. */
function metadataPatch(projectId: string, acl: RoomAcl) {
  const meta = aclToMetadata(projectId, acl)
  return {
    kind: meta.kind,
    projectId: meta.projectId,
    ownerEmail: meta.ownerEmail,
    admins: acl.admins.length ? acl.admins : null,
    editors: acl.editors.length ? acl.editors : null,
    commenters: acl.commenters.length ? acl.commenters : null,
    viewers: acl.viewers.length ? acl.viewers : null,
  }
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

  const body = (req.body ?? {}) as Body
  const action = typeof body.action === 'string' ? body.action : ''
  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  if (!projectId || !/^[\w-]{1,64}$/.test(projectId)) {
    sendError(res, 400, 'Invalid projectId.')
    return
  }

  const identity = await requireIdentity(res, body.googleToken)
  if (!identity) return

  const acl = await loadAcl(lb, projectId)

  switch (action) {
    case 'ensure': {
      if (!acl) {
        // bootstrap: the first person to open the project owns its rooms
        const fresh: RoomAcl = {
          ownerEmail: identity.email,
          admins: [],
          editors: [],
          commenters: [],
          viewers: [],
        }
        const metadata = aclToMetadata(projectId, fresh)
        for (const roomId of roomIdsForProject(projectId)) {
          try {
            await lb.createRoom(roomId, { defaultAccesses: [], metadata })
          } catch {
            // already created by a concurrent request — fine
          }
        }
        const settled = await loadAcl(lb, projectId)
        const role = settled ? roleOf(settled, identity.email) : 'owner'
        if (!role) {
          sendError(res, 403, 'Another user claimed this project first.')
          return
        }
        res.status(200).json({ role })
        return
      }
      const role = roleOf(acl, identity.email)
      if (!role) {
        sendError(
          res,
          403,
          `${identity.email} is not a member of this project (server check).`,
        )
        return
      }
      res.status(200).json({ role })
      return
    }

    case 'members': {
      if (!acl || !roleOf(acl, identity.email)) {
        sendError(res, 403, 'Not a member of this project.')
        return
      }
      res.status(200).json({ acl })
      return
    }

    case 'set-role': {
      if (!acl) {
        sendError(res, 404, 'This project has no realtime rooms yet.')
        return
      }
      const callerRole = roleOf(acl, identity.email)
      if (!callerRole) {
        sendError(res, 403, 'Not a member of this project.')
        return
      }
      const email =
        typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!email || !email.includes('@') || email.length > 254) {
        sendError(res, 400, 'Invalid email.')
        return
      }
      const newRole = body.role === null ? null : (body.role as CollabRole)
      if (newRole !== null && !VALID_ROLES.includes(newRole)) {
        sendError(res, 400, 'Invalid role.')
        return
      }
      if (email === acl.ownerEmail) {
        sendError(res, 403, 'The owner role cannot be changed here.')
        return
      }
      const targetRole = roleOf(acl, email)
      // removing/demoting an existing member: rank rules apply
      if (targetRole && !canManageRole(callerRole, targetRole)) {
        sendError(res, 403, `A ${callerRole} cannot manage a ${targetRole}.`)
        return
      }
      // assigning a role: must be assignable by the caller's rank
      if (newRole && !assignableRoles(callerRole).includes(newRole)) {
        sendError(res, 403, `A ${callerRole} cannot assign the ${newRole} role.`)
        return
      }
      const next = newRole ? addEmail(acl, email, newRole) : stripEmail(acl, email)
      const metadata = metadataPatch(projectId, next)
      await lb.updateRoom(contentRoomId(projectId), { metadata })
      await lb.updateRoom(collabRoomId(projectId), { metadata })
      res.status(200).json({ acl: next })
      return
    }

    case 'delete': {
      if (!acl || roleOf(acl, identity.email) !== 'owner') {
        sendError(res, 403, 'Only the project owner can delete its realtime rooms.')
        return
      }
      for (const roomId of roomIdsForProject(projectId)) {
        try {
          await lb.deleteRoom(roomId)
        } catch {
          // already gone
        }
      }
      res.status(200).json({ ok: true })
      return
    }

    default:
      sendError(res, 400, 'Unknown action.')
  }
}

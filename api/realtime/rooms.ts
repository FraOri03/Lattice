import {
  aclToMetadata,
  liveblocksClient,
  loadAcl,
  principalOf,
  requireIdentity,
  sendError,
  writeAcl,
  type ApiRes,
} from '../_lib/realtime.js'
import {
  addEmail,
  bindUserId,
  matchOf,
  roleOf,
  roleOfSlot,
  stripEmail,
  type RoomAcl,
} from '../../src/lib/collab/acl.js'
import { CANONICAL_USER_ID } from '../../src/lib/auth/identity.js'
import { roomIdsForProject } from '../../src/lib/collab/roleAccess.js'
import {
  assignableRoles,
  canManageRole,
} from '../../src/lib/collab/permissions.js'
import type { CollabRole } from '../../src/types/collab.js'
import type { ApiRequest } from '../_lib/session.js'

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
 *
 * `ensure` is also where 16.2's migration happens: a membership slot
 * opened with an e-mail address is bound to the userId of whoever first
 * proves that address, after which the address no longer grants it. See
 * src/lib/collab/acl.ts.
 */

/**
 * Headers matter now: 17.2 reads the session cookie and the CSRF token off
 * this request, so the local shape is the shared `ApiRequest`.
 */

const VALID_ROLES: CollabRole[] = ['owner', 'admin', 'editor', 'commenter', 'viewer']

interface Body {
  action?: unknown
  projectId?: unknown
  projectName?: unknown
  email?: unknown
  role?: unknown
  googleToken?: unknown
}

export default async function handler(req: ApiRequest, res: ApiRes): Promise<void> {
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

  const identity = await requireIdentity(req, res, body.googleToken)
  if (!identity) return
  const principal = principalOf(identity)
  /** The id a slot this caller claims is bound to, once they claim one. */
  const callerUserId = principal.userIds[CANONICAL_USER_ID] ?? ''

  const acl = await loadAcl(lb, projectId)

  switch (action) {
    case 'ensure': {
      if (!acl) {
        // bootstrap: the first person to open the project owns its rooms,
        // and owns them as a userId from the very first write
        const fresh: RoomAcl = bindUserId(
          {
            ownerEmail: identity.email,
            admins: [],
            editors: [],
            commenters: [],
            viewers: [],
            bindings: {},
          },
          identity.email,
          callerUserId,
        )
        const metadata = aclToMetadata(projectId, fresh)
        for (const roomId of roomIdsForProject(projectId)) {
          try {
            await lb.createRoom(roomId, { defaultAccesses: [], metadata })
          } catch {
            // already created by a concurrent request — fine
          }
        }
        const settled = await loadAcl(lb, projectId)
        const role = settled ? roleOf(settled, principal) : 'owner'
        if (!role) {
          sendError(res, 403, 'Another user claimed this project first.')
          return
        }
        res.status(200).json({ role })
        return
      }
      const match = matchOf(acl, principal)
      if (!match) {
        sendError(
          res,
          403,
          `${identity.email} is not a member of this project (server check).`,
        )
        return
      }
      /**
       * 16.2 — the moment an invitation is accepted, in the only place
       * that can observe it: the invitee opened the project and Google
       * vouched for the address the slot was opened with. From here the
       * slot answers to their userId and the address is no longer what
       * grants it. One write per member per project, never repeated.
       */
      if (callerUserId && !acl.bindings[match.slotEmail]) {
        await writeAcl(lb, projectId, bindUserId(acl, match.slotEmail, callerUserId))
      }
      res.status(200).json({ role: match.role })
      return
    }

    case 'members': {
      if (!acl || !roleOf(acl, principal)) {
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
      const callerRole = roleOf(acl, principal)
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
      /**
       * A slot is still addressed by e-mail here, because that is all an
       * admin has: you grant access to an address, and only the person who
       * proves it turns the slot into a userId. Changing a *bound* slot's
       * role therefore changes the bound person's role — that is the row
       * the UI is showing. Handing the address to somebody else means
       * removing it first, which drops the binding with it.
       */
      const targetRole = roleOfSlot(acl, email)
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
      await writeAcl(lb, projectId, next)
      res.status(200).json({ acl: next })
      return
    }

    case 'delete': {
      if (!acl || roleOf(acl, principal) !== 'owner') {
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

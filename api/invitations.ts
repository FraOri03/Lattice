import {
  liveblocksClient,
  loadAcl,
  principalOf,
  requireIdentity,
  sendError,
  type ApiRes,
  type VerifiedIdentity,
} from './_lib/realtime.js'
import { hashToken, mintToken, type ApiRequest } from './_lib/session.js'
import { NO_DATABASE, repositories, type Repositories } from './_lib/db/index.js'
import { roleOf, roleOfSlot, type RoomAcl } from '../src/lib/collab/acl.js'
import { assignableRoles, can } from '../src/lib/collab/permissions.js'
import {
  INVITE_TTL_MS,
  canResend,
  canRevoke,
  canChangeRole,
  effectiveStatus,
  redact,
} from '../src/lib/collab/invitations.js'
import { nid } from '../src/lib/id.js'
import type { CollabRole, ProjectInvite } from '../src/types/collab.js'

/**
 * POST /api/invitations — the invitation lifecycle (Phase 18.1, #88).
 *
 * Actions (body.action):
 *  - create   {projectId, email, role}      mint one; replies with the link token
 *  - list     {projectId}                   what this project has offered
 *  - resend   {projectId, inviteId}         fresh deadline, fresh token
 *  - revoke   {projectId, inviteId}         the sender withdraws it
 *  - set-role {projectId, inviteId, role}   change the offer, before acceptance
 *  - resolve  {token}                       what a link points at
 *  - decline  {token}                       the recipient says no
 *
 * ## Why this endpoint exists at all
 *
 * `InviteService` minted the token in the browser and looked it up in the
 * local store, which works exactly as long as the invitation never leaves
 * the device that made it. The recipient of a mailed invitation is by
 * definition somewhere else, so that flow could not be extended — it had to
 * be moved. The server now owns the record; the browser asks.
 *
 * ## What is deliberately NOT here
 *
 * Acceptance. 18.3 (#90) owns it, because accepting is where the address has
 * to be *proved*, and today's client-side `accept()` does not prove it. An
 * accept action here would be that same hole reachable from any browser
 * holding a token, which is strictly worse than the local one it would have
 * replaced. `resolve` therefore reports and grants nothing.
 *
 * Delivery is not here either: 18.2 (#89) owns the mail. This endpoint
 * produces the record and the link; nothing yet sends it.
 *
 * ## The token
 *
 * 32 bytes from the CSPRNG, hashed with SHA-256 before storage, and returned
 * exactly once — in the reply to `create` and `resend`, the only moment a
 * link can be built. Everything else goes through `redact()`, so a listing
 * cannot leak a live credential even by accident.
 */

interface Body {
  action?: unknown
  projectId?: unknown
  inviteId?: unknown
  email?: unknown
  role?: unknown
  token?: unknown
  googleToken?: unknown
}

/** An invitation may offer any role except ownership, which is transferred. */
const INVITABLE: CollabRole[] = ['admin', 'editor', 'commenter', 'viewer']

/**
 * The project ACL, from Postgres when 17.1's tables hold it and from the
 * Liveblocks room metadata otherwise.
 *
 * Both are live: `rooms.ts` still writes the metadata, and nothing populates
 * `project_memberships` yet. Reading Postgres first is the direction of
 * travel; falling back is what stops every invitation on a current
 * deployment from being refused for lack of an ACL to check.
 */
async function aclForProject(
  db: Repositories,
  projectId: string,
): Promise<RoomAcl | null> {
  const stored = await db.memberships.aclOf(projectId)
  if (stored) return stored
  const lb = liveblocksClient()
  if (!lb) return null
  return loadAcl(lb, projectId)
}

/**
 * The caller as a row in `users`, or null.
 *
 * `invited_by` is a foreign key, so a userId nobody has a row for would fail
 * the insert rather than record an invitation. Only a VERIFIED address
 * resolves — an unverified claim on an address must not be able to sign an
 * audit entry as the person who owns it. When it resolves to nobody the
 * record keeps the display name and loses only the pointer, which is a
 * weaker audit trail but an honest one.
 */
async function actorId(db: Repositories, identity: VerifiedIdentity): Promise<string> {
  const user = await db.identities.userByVerifiedEmail(identity.email)
  return user?.id ?? ''
}

/**
 * Persist an expiry the clock has already decided.
 *
 * The rule lives in the shared module and needs no storage to be true; this
 * only writes it down the first time anybody looks, which is why 18.1 needs
 * no scheduled sweep.
 */
async function settle(
  db: Repositories,
  invite: ProjectInvite,
  now: number,
): Promise<ProjectInvite> {
  if (invite.status !== 'pending') return invite
  if (effectiveStatus(invite, now) !== 'expired') return invite
  const patched = await db.invitations.patch(invite.id, { status: 'expired' })
  return patched ?? { ...invite, status: 'expired' }
}

/** The one an action names, once it is settled and known to be this project's. */
async function inviteOfProject(
  db: Repositories,
  projectId: string,
  inviteId: string,
  now: number,
): Promise<ProjectInvite | null> {
  const all = await db.invitations.ofProject(projectId)
  const found = all.find((i) => i.id === inviteId)
  if (!found) return null
  return settle(db, found, now)
}

export default async function handler(req: ApiRequest, res: ApiRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    sendError(res, 405, 'POST only.')
    return
  }

  const db = repositories()
  if (!db) {
    sendError(res, 501, NO_DATABASE)
    return
  }

  const body = (req.body ?? {}) as Body
  const action = typeof body.action === 'string' ? body.action : ''
  const now = Date.now()

  /* ---------------- actions the token authenticates ---------------- */

  /**
   * `resolve` and `decline` are reached by whoever holds the link, signed in
   * or not — the token IS the credential, and requiring a session first
   * would mean the recipient has to have an account before they can see what
   * they are being offered. Neither grants anything: one reports, the other
   * closes.
   */
  if (action === 'resolve' || action === 'decline') {
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token || token.length > 512) {
      sendError(res, 400, 'Invalid token.')
      return
    }
    const found = await db.invitations.byTokenHash(hashToken(token))
    if (!found) {
      sendError(res, 404, 'This invitation link is not valid.')
      return
    }
    const invite = await settle(db, found, now)

    if (action === 'resolve') {
      res.status(200).json({ invite: redact(invite, now) })
      return
    }

    if (effectiveStatus(invite, now) !== 'pending') {
      // already settled: say so rather than pretend the decline landed
      sendError(res, 409, `This invitation is ${effectiveStatus(invite, now)}.`)
      return
    }
    const declined = await db.invitations.patch(invite.id, { status: 'declined' })
    res.status(200).json({ invite: redact(declined ?? invite, now) })
    return
  }

  /* ---------------- actions a member performs ---------------- */

  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  if (!projectId || !/^[\w-]{1,64}$/.test(projectId)) {
    sendError(res, 400, 'Invalid projectId.')
    return
  }

  const identity = await requireIdentity(req, res, body.googleToken)
  if (!identity) return

  const acl = await aclForProject(db, projectId)
  if (!acl) {
    sendError(res, 404, 'This project has no membership record on the server yet.')
    return
  }
  const callerRole = roleOf(acl, principalOf(identity))
  if (!callerRole) {
    sendError(res, 403, 'Not a member of this project.')
    return
  }
  /**
   * One bar for every action below, listing included. An invitation names an
   * address belonging to somebody who is not in the project yet, so who has
   * been approached is not a fact every viewer of a project is entitled to.
   */
  if (!can(callerRole, 'members.manage')) {
    sendError(res, 403, `A ${callerRole} cannot manage invitations.`)
    return
  }

  switch (action) {
    case 'create': {
      const email =
        typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!email || !email.includes('@') || email.length > 254) {
        sendError(res, 400, 'Invalid email.')
        return
      }
      const role = body.role as CollabRole
      if (!INVITABLE.includes(role)) {
        sendError(res, 400, 'Invalid role.')
        return
      }
      if (!assignableRoles(callerRole).includes(role)) {
        sendError(res, 403, `A ${callerRole} cannot assign the ${role} role.`)
        return
      }
      if (roleOfSlot(acl, email)) {
        sendError(res, 409, `${email} is already a member of this project.`)
        return
      }

      /**
       * An invitation whose deadline passed still says `pending` in storage,
       * and `create` honours the one-pending-per-address invariant by
       * handing that row back — so without this, a lapsed invitation would
       * block the address from ever being invited again. Settling it first
       * turns the invariant back into what it is for: no two LIVE offers.
       */
      const open = (await db.invitations.ofProject(projectId)).find(
        (i) => i.email === email && i.status === 'pending',
      )
      if (open) await settle(db, open, now)

      const token = mintToken()
      const draft: ProjectInvite = {
        id: nid('inv'),
        projectId,
        email,
        role,
        tokenHash: hashToken(token),
        createdAt: now,
        invitedBy: await actorId(db, identity),
        invitedByName: identity.name || identity.email,
        status: 'pending',
        expiresAt: now + INVITE_TTL_MS,
        updatedAt: now,
      }
      const stored = await db.invitations.create(draft)

      /**
       * `create` answers with the EXISTING invitation when one is already
       * pending for this address — the invariant 17.1 put in the database.
       * Its token is not the one just minted and cannot be recovered from a
       * digest, so the reply carries no link: the honest move is to say an
       * invitation is already open and let the caller resend it, rather than
       * hand back a link that opens nothing.
       */
      const mine = stored.id === draft.id
      res.status(mine ? 201 : 200).json({
        invite: redact(stored, now),
        token: mine ? token : null,
      })
      return
    }

    case 'list': {
      const all = await db.invitations.ofProject(projectId)
      const settled = await Promise.all(all.map((i) => settle(db, i, now)))
      res.status(200).json({ invites: settled.map((i) => redact(i, now)) })
      return
    }

    case 'resend': {
      const inviteId = typeof body.inviteId === 'string' ? body.inviteId : ''
      const invite = await inviteOfProject(db, projectId, inviteId, now)
      if (!invite) {
        sendError(res, 404, 'No such invitation in this project.')
        return
      }
      if (!canResend(invite, now)) {
        sendError(res, 409, `This invitation is ${effectiveStatus(invite, now)}.`)
        return
      }
      /**
       * Resending ROTATES the token, and the previous link stops working.
       *
       * Not a preference: the server holds a digest, so it cannot reproduce
       * the old link to put in a new message — a resend that kept the token
       * would be a resend that could never be sent. Rotation also keeps one
       * live credential per invitation instead of an accumulating set, which
       * is the same rule 17.3 applies to one-time codes.
       */
      const token = mintToken()
      const updated = await db.invitations.patch(invite.id, {
        tokenHash: hashToken(token),
        status: 'pending',
        resentAt: now,
        expiresAt: now + INVITE_TTL_MS,
      })
      if (!updated) {
        sendError(res, 404, 'No such invitation in this project.')
        return
      }
      res.status(200).json({ invite: redact(updated, now), token })
      return
    }

    case 'revoke': {
      const inviteId = typeof body.inviteId === 'string' ? body.inviteId : ''
      const invite = await inviteOfProject(db, projectId, inviteId, now)
      if (!invite) {
        sendError(res, 404, 'No such invitation in this project.')
        return
      }
      if (!canRevoke(invite, now)) {
        sendError(res, 409, `This invitation is ${effectiveStatus(invite, now)}.`)
        return
      }
      const updated = await db.invitations.patch(invite.id, { status: 'revoked' })
      res.status(200).json({ invite: redact(updated ?? invite, now) })
      return
    }

    case 'set-role': {
      const inviteId = typeof body.inviteId === 'string' ? body.inviteId : ''
      const role = body.role as CollabRole
      if (!INVITABLE.includes(role)) {
        sendError(res, 400, 'Invalid role.')
        return
      }
      const invite = await inviteOfProject(db, projectId, inviteId, now)
      if (!invite) {
        sendError(res, 404, 'No such invitation in this project.')
        return
      }
      if (!canChangeRole(invite, now)) {
        sendError(
          res,
          409,
          `An invitation that is ${effectiveStatus(invite, now)} can no longer change role.`,
        )
        return
      }
      const allowed = assignableRoles(callerRole)
      // both ends of the change: an admin may not quietly rewrite an
      // invitation that offers a rank they could not have offered themselves
      if (!allowed.includes(role) || !allowed.includes(invite.role)) {
        sendError(res, 403, `A ${callerRole} cannot assign the ${role} role.`)
        return
      }
      const updated = await db.invitations.patch(invite.id, { role })
      res.status(200).json({ invite: redact(updated ?? invite, now) })
      return
    }

    default:
      sendError(res, 400, 'Unknown action.')
  }
}

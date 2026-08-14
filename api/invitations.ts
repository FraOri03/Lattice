import {
  liveblocksClient,
  loadAcl,
  principalOf,
  requireIdentity,
  sendError,
  writeAcl,
  type ApiRes,
  type VerifiedIdentity,
} from './_lib/realtime.js'
import { hashToken, mintToken, originOf, type ApiRequest } from './_lib/session.js'
import { mailSender, type MailSender } from './_lib/mail.js'
import { invitationMessage, normaliseLocale } from './_lib/mailTemplates.js'
import { limitMessage, mailAllowance, recordSend } from './_lib/mailLimits.js'
import type { MailDelivery } from '../src/types/mail.js'
import { NO_DATABASE, repositories, type Repositories } from './_lib/db/index.js'
import { addEmail, roleOf, roleOfSlot, type RoomAcl } from '../src/lib/collab/acl.js'
import { assignableRoles, can } from '../src/lib/collab/permissions.js'
import {
  INVITE_TTL_MS,
  canResend,
  canRevoke,
  canChangeRole,
  effectiveStatus,
  isLive,
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
  /** For the message only (18.2): what the project is called, and in which language. */
  projectName?: unknown
  locale?: unknown
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

/**
 * Send the invitation, and say what happened (Phase 18.2, #89).
 *
 * Delivery is reported rather than assumed, and it is deliberately NOT an
 * error: the invitation and its link are valid in all three outcomes, so a
 * failed send leaves the sender with something to copy instead of a request
 * that looks like it did nothing. The UI decides what to say; this decides
 * what is true.
 *
 * The project name comes from the caller, which is the only place it exists
 * — Postgres holds memberships, not projects. It is therefore attacker-
 * controlled text in a message a stranger reads, and the templates escape
 * every interpolation for exactly that reason.
 */
async function deliver(
  db: Repositories,
  mail: MailSender | null,
  invite: ProjectInvite,
  token: string,
  identity: VerifiedIdentity,
  req: ApiRequest,
  body: Body,
  now: number,
): Promise<{ delivery: MailDelivery; reason?: string }> {
  if (!mail) return { delivery: 'unavailable' }
  /**
   * Configured, and configured wrongly — a malformed `MAIL_FROM`. Reported
   * as a failure rather than as an absence, because mail IS set up here and
   * "this deployment has no mail backend" would send the one person who can
   * fix it looking for a key that is already there.
   *
   * Before `recordSend`, like the template failure below: no request reaches
   * the provider and no mailbox is touched, so charging the hour's allowance
   * for it would only lock this address out of being invited at all — the
   * ceiling exists to protect a mailbox from messages, and there are none.
   */
  if (mail.problem) return { delivery: 'failed', reason: mail.problem }
  const origin = originOf(req)
  if (!origin) return { delivery: 'unavailable' }

  const projectName =
    typeof body.projectName === 'string' && body.projectName.trim()
      ? body.projectName.trim().slice(0, 120)
      : invite.projectId

  /**
   * The message is built OUTSIDE the try, and that is the point.
   *
   * It used to be built as the argument to `mail.send()`, inside it — so a
   * template that threw (an unformattable deadline is enough) was caught by
   * the handler meant for provider rejections and reported as "the e-mail
   * was not sent". No request was ever made, yet the sender was advised to
   * try resending, which could never have worked. Two unrelated failures
   * wearing one face, in the logs as well as on screen.
   *
   * A template that throws is a bug in Lattice. It says so.
   */
  let message
  try {
    message = invitationMessage({
      to: invite.email,
      projectName,
      role: invite.role,
      inviterName: identity.name || identity.email,
      inviterEmail: identity.email,
      expiresAt: invite.expiresAt,
      link: `${origin}/#invite=${encodeURIComponent(token)}`,
      origin,
      locale: normaliseLocale(body.locale),
    })
  } catch (err) {
    console.error('[invitations] could not build the message:', err)
    return { delivery: 'failed', reason: 'Lattice could not compose the message.' }
  }

  // recorded before the attempt: a send that failed still consumed the
  // sender's allowance, or retrying would be a way around the ceiling
  await recordSend(db.mailSends, 'invitation', invite.email, invite.projectId, now)

  try {
    await mail.send(message)
    return { delivery: 'sent' }
  } catch (err) {
    /**
     * The provider's own words, handed to the sender.
     *
     * They are the difference between "verify your sending domain" and an
     * afternoon of guessing, and the caller is an authenticated member who
     * may manage this project — not the public. Truncated, because a
     * provider error is a sentence, not a payload.
     */
    const detail = err instanceof Error ? err.message : String(err)
    console.warn('[invitations] delivery failed:', detail)
    return { delivery: 'failed', reason: detail.slice(0, 300) }
  }
}

/**
 * Every address a caller has PROVED, and nothing they merely claim.
 *
 * 16.1's rule, applied wherever an action is authorised by who somebody is
 * rather than by a token they hold: an unverified identity carrying an
 * address must never reach what was offered to the person who owns it.
 */
export async function provenAddresses(
  db: Repositories,
  identity: VerifiedIdentity,
): Promise<{ caller: string; addresses: Set<string> }> {
  const user = await db.identities.userByVerifiedEmail(identity.email)
  const held = user ? await db.identities.identitiesOf(user.id) : []
  return {
    caller: user?.id ?? '',
    addresses: new Set(
      held.filter((i) => i.verifiedAt !== null && i.email).map((i) => i.email),
    ),
  }
}

/**
 * An invitation named by ID rather than by link, scoped to the caller.
 *
 * The lookup goes through "what is pending for the addresses this caller has
 * proved" rather than through a by-id read, so an id can only ever reach an
 * invitation that was already theirs. An id is short and appears in
 * listings; it is not a credential and must not behave like one.
 */
async function invitationOfCaller(
  db: Repositories,
  identity: VerifiedIdentity,
  inviteId: string,
): Promise<ProjectInvite | null> {
  const { addresses } = await provenAddresses(db, identity)
  const mine = (
    await Promise.all([...addresses].map((a) => db.invitations.pendingFor(a)))
  ).flat()
  return mine.find((i) => i.id === inviteId) ?? null
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
    const inviteId = typeof body.inviteId === 'string' ? body.inviteId : ''
    let found: ProjectInvite | null = null

    if (token) {
      if (token.length > 512) {
        sendError(res, 400, 'Invalid token.')
        return
      }
      found = await db.invitations.byTokenHash(hashToken(token))
    } else if (action === 'decline' && inviteId) {
      /**
       * Declining from the dashboard (18.4), where the invitation was
       * listed rather than opened and there is no link to present.
       *
       * This path DOES need an identity, and it looks the id up only among
       * invitations addressed to the caller — the same rule acceptance
       * uses, for the same reason: an id appears in listings and is not a
       * credential, so it must never reach an invitation that is not theirs.
       */
      const identity = await requireIdentity(req, res, body.googleToken)
      if (!identity) return
      found = await invitationOfCaller(db, identity, inviteId)
    } else {
      sendError(res, 400, 'Invalid token.')
      return
    }

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

  /* ---------------- acceptance (Phase 18.3, #90) ---------------- */

  /**
   * Accepting proves the address, and refuses everything that does not.
   *
   * The hole this closes was not subtle: `accept()` added whoever was signed
   * in, and its "simulate acceptance" sibling added a member from the
   * invited address with nothing proved at all. An invitation must not be
   * acceptable by an address other than the one it was sent to, and that is
   * checked HERE — on the server, against identities the database says are
   * verified — rather than anywhere a browser could be persuaded otherwise.
   *
   * The token gets the caller as far as the invitation and no further. It
   * says which offer is being answered; it never says who is answering.
   */
  if (action === 'accept') {
    const identity = await requireIdentity(req, res, body.googleToken)
    if (!identity) return

    /**
     * Every address this caller has proved.
     *
     * Only VERIFIED identities resolve, which is the whole check: an
     * unverified claim on an address must never be able to inherit what was
     * offered to the person who actually owns it.
     *
     * The invited address does not have to be the one they signed in with.
     * An account that holds it as a second, verified identity qualifies —
     * that is precisely what 16.1's convergence is for, and refusing it
     * would mean telling somebody they cannot accept an invitation sent to
     * their own mailbox.
     */
    const { caller, addresses } = await provenAddresses(db, identity)

    const token = typeof body.token === 'string' ? body.token : ''
    const inviteId = typeof body.inviteId === 'string' ? body.inviteId : ''
    let found: ProjectInvite | null = null

    if (token) {
      if (token.length > 512) {
        sendError(res, 400, 'Invalid token.')
        return
      }
      found = await db.invitations.byTokenHash(hashToken(token))
    } else if (inviteId) {
      // accepting from the dashboard (18.4): listed rather than opened, so
      // there is no link to present
      found = await invitationOfCaller(db, identity, inviteId)
    } else {
      sendError(res, 400, 'An invitation link or id is required.')
      return
    }

    if (!found) {
      sendError(res, 404, 'This invitation is not valid.')
      return
    }
    const invite = await settle(db, found, now)
    if (!isLive(invite, now)) {
      sendError(res, 409, `This invitation is ${effectiveStatus(invite, now)}.`)
      return
    }

    if (!caller || !addresses.has(invite.email)) {
      sendError(
        res,
        403,
        `This invitation was sent to ${invite.email}. Sign in as that address to accept it.`,
      )
      return
    }

    /**
     * The membership, in both places that hold one.
     *
     * Postgres gets the binding: `project_memberships.user_id` is a foreign
     * key to `users`, so the id that belongs there is the caller's real one.
     *
     * The Liveblocks ACL gets the address and its role, and DELIBERATELY no
     * binding. The ids in room metadata are derived from the credential a
     * request presents (`principalOf`), not from `users` — for an e-mail
     * session that derivation is seeded from the address, so binding here
     * would write an id that the same person arriving with Google would not
     * match, and 16.2's rule is that a bound slot stops answering to the
     * address. That would lock the invitee out of the project they just
     * joined. Binding stays where 16.2 put it: `rooms.ensure`, the first
     * time they actually open the project, using the credential they came
     * with.
     */
    await db.memberships.setRole(invite.projectId, invite.email, invite.role)
    await db.memberships.bind(invite.projectId, invite.email, caller)

    const lb = liveblocksClient()
    if (lb) {
      const roomAcl = await loadAcl(lb, invite.projectId)
      // no rooms yet is not a failure: `rooms.ensure` bootstraps them from
      // the Postgres membership that was just written
      if (roomAcl) {
        await writeAcl(lb, invite.projectId, addEmail(roomAcl, invite.email, invite.role))
      }
    }

    const accepted = await db.invitations.patch(invite.id, {
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: caller,
    })
    res.status(200).json({
      invite: redact(accepted ?? invite, now),
      projectId: invite.projectId,
      role: invite.role,
    })
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
    /**
     * A project with no server-side membership is a LOCAL project, not an
     * error. Most are: nothing writes a membership until somebody shares one,
     * so `proj_default` and every project made offline arrive here.
     *
     * Asking one what it has offered is therefore a fair question with a
     * boring answer — none — and 404 was the wrong way to say it. The share
     * dialog asks on every open, so that mistake cost a failed request and
     * about a second and a half of function time each time anybody looked at
     * the members of a project they had never shared.
     *
     * The refusal still stands for everything that WRITES: you cannot invite
     * to, revoke from or re-role a project the server has no ACL to check you
     * against.
     */
    if (action === 'list') {
      res.status(200).json({ invites: [] })
      return
    }
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

      /**
       * Checked BEFORE the invitation exists. Creating a record and then
       * refusing to deliver it would leave the sender an offer they think
       * they made and the recipient nothing at all — a 429 they can act on
       * is a better answer than a half-sent invitation.
       */
      const mail = mailSender()
      if (mail) {
        const allowance = await mailAllowance(db.mailSends, email, projectId, now)
        if (!allowance.allowed) {
          sendError(res, 429, limitMessage(allowance.reason))
          return
        }
      }

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
      const sending = mine
        ? await deliver(db, mail, stored, token, identity, req, body, now)
        : // nothing was minted, so there is no link to put in a message
          { delivery: 'unavailable' as const }
      res.status(mine ? 201 : 200).json({
        invite: redact(stored, now),
        token: mine ? token : null,
        delivery: sending.delivery,
        deliveryError: sending.reason,
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
      const mail = mailSender()
      if (mail) {
        // a resend is a message, and the ceiling counts messages
        const allowance = await mailAllowance(db.mailSends, invite.email, projectId, now)
        if (!allowance.allowed) {
          sendError(res, 429, limitMessage(allowance.reason))
          return
        }
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
      const sending = await deliver(db, mail, updated, token, identity, req, body, now)
      res.status(200).json({
        invite: redact(updated, now),
        token,
        delivery: sending.delivery,
        deliveryError: sending.reason,
      })
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

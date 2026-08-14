import {
  principalOf,
  requireIdentity,
  sendError,
  type ApiRes,
} from './_lib/realtime.js'
import type { ApiRequest } from './_lib/session.js'
import { NO_DATABASE, repositories } from './_lib/db/index.js'
import { effectiveStatus, redact } from '../src/lib/collab/invitations.js'
import type { SharedIndex, SharedMembership } from '../src/types/shared.js'

/**
 * POST /api/shared — what belongs to me (Phase 18.4, #91).
 *
 * ```
 * { action: 'index' } → { projects, invitations, addresses }
 * ```
 *
 * ## The question no store could answer
 *
 * A browser only ever knows its own memberships, and the realtime backend is
 * an *authority* rather than an index: it can answer "may this address enter
 * this room?" and cannot answer "which projects has anyone shared with me?".
 * So the dashboard's "Shared with me" could only ever list what this device
 * already had, and its "Pending invitations" could list nothing at all —
 * both said so honestly and both were, in fact, unavailable.
 *
 * 17.1 built the two queries this needs and left them unused, waiting for
 * the phase that had a right to expose them. This is that phase.
 *
 * ## What it will not tell you
 *
 * Project NAMES. Postgres holds memberships, not projects — docs, boards and
 * their titles live in Yjs and Drive and deliberately never reach this
 * database. So the index answers with ids, roles and owners, and the client
 * joins whatever it already holds. A project this browser has never seen
 * appears with what is actually known about it, and says that it is not here
 * yet, rather than being dropped or given an invented title.
 *
 * ## Every address the caller has proved
 *
 * Not just the one they signed in with. 16.1 lets an account hold several
 * verified identities, and a project shared with either of them is shared
 * with the same person — an index that ignored that would hide projects from
 * their own member.
 *
 * Unverified identities are never consulted, for the reason 16.1 gives: a
 * claim on an address must not reveal what was shared with whoever owns it.
 */

interface Body {
  action?: unknown
  googleToken?: unknown
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
  if (body.action !== 'index') {
    sendError(res, 400, 'Unknown action.')
    return
  }

  const identity = await requireIdentity(req, res, body.googleToken)
  if (!identity) return

  const now = Date.now()

  /**
   * The addresses this caller has actually proved, and the ids they answer
   * to. The signed-in address is included even when the database has never
   * seen it: a deployment mid-rollout can have a live session for an account
   * whose identities were written by an older build, and hiding their
   * projects would be a regression dressed as caution. It is verified by
   * construction — the session only exists because Google or a one-time code
   * vouched for it.
   */
  const caller = await db.identities.userByVerifiedEmail(identity.email)
  const held = caller ? await db.identities.identitiesOf(caller.id) : []
  const addresses = dedupe([
    identity.email.toLowerCase(),
    ...held.filter((i) => i.verifiedAt !== null && i.email).map((i) => i.email),
  ])
  const userIds = dedupe([
    ...(caller ? [caller.id] : []),
    ...principalOf(identity).userIds,
  ])

  const slots = await db.memberships.slotsOf(userIds, addresses)
  /**
   * Owned projects are not "shared with me" — they are mine. Filtering here
   * rather than in the client keeps the two sections meaning what they say
   * whichever surface reads this.
   */
  const shared = slots.flatMap((slot) =>
    slot.role === 'owner' ? [] : [{ ...slot, role: slot.role }],
  )
  const owners = await db.memberships.ownersOf(shared.map((s) => s.projectId))

  const projects: SharedMembership[] = shared.map((slot) => ({
    projectId: slot.projectId,
    role: slot.role,
    ownerEmail: owners[slot.projectId] ?? '',
    /** Whether the slot is bound to this caller, or still open to the address. */
    claimed: slot.userId !== null,
  }))

  /**
   * Invitations waiting for any address the caller has proved.
   *
   * Redacted, so the digest travels and the token never does — a listing is
   * not a place to hand out credentials, and 18.3 does not need one: the
   * address check is the gate, and it is satisfied by the same identities
   * that produced this list.
   */
  const pending = (
    await Promise.all(addresses.map((address) => db.invitations.pendingFor(address)))
  ).flat()
  const invitations = dedupe(pending, (invite) => invite.id)
    .filter((invite) => effectiveStatus(invite, now) === 'pending')
    .map((invite) => redact(invite, now))

  const index: SharedIndex = { projects, invitations, addresses }
  res.status(200).json(index)
}

function dedupe<T>(items: T[], key: (item: T) => string = String): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const id = key(item)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(item)
  }
  return out
}

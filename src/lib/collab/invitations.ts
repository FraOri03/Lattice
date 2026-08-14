import type { InviteStatus, ProjectInvite } from '../../types/collab.js'

/**
 * The invitation rules (Phase 18.1, #88).
 *
 * Pure, and shared verbatim between the browser and `api/invitations.ts` —
 * the same arrangement `permissions.ts` and `identity.ts` already use. The
 * endpoint is the authority, but the UI has to predict its answers to know
 * which controls to offer, and two copies of "may this role still be
 * changed" would eventually disagree.
 *
 * Nothing here touches storage or the network, so every rule below is
 * testable as arithmetic.
 */

/**
 * How long an invitation stays acceptable.
 *
 * Two weeks is long enough to survive a holiday and short enough that an
 * abandoned mailbox does not carry a permanent grant. The number lives here
 * and only here: the migration's backfill matches it, and nothing else is
 * allowed a second copy.
 */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000

/**
 * The status an invitation actually has right now.
 *
 * A deadline that passed does not write itself. Storage keeps saying
 * `pending` until something looks, so every reader has to apply the clock
 * rather than trust the column — otherwise an expired invitation is
 * indistinguishable from a live one for as long as nobody opens the project.
 *
 * The endpoint persists the transition when it observes it, which makes this
 * a lazy sweep rather than a cron job. That is a write-time optimisation of a
 * fact this function already decides.
 */
export function effectiveStatus(
  invite: Pick<ProjectInvite, 'status' | 'expiresAt'>,
  now: number,
): InviteStatus {
  if (invite.status !== 'pending') return invite.status
  return invite.expiresAt <= now ? 'expired' : 'pending'
}

/** Whether this invitation could still be accepted, clock included. */
export function isLive(
  invite: Pick<ProjectInvite, 'status' | 'expiresAt'>,
  now: number,
): boolean {
  return effectiveStatus(invite, now) === 'pending'
}

/**
 * Whether the offered role may still be changed.
 *
 * Only before acceptance, which is the whole point of the distinction: an
 * accepted invitation is a historical record, and the thing to change is the
 * membership it produced. Editing the invitation instead would leave the two
 * disagreeing about what was granted, with the audit trail on the losing
 * side.
 */
export function canChangeRole(
  invite: Pick<ProjectInvite, 'status' | 'expiresAt'>,
  now: number,
): boolean {
  return isLive(invite, now)
}

/** Whether the sender may still withdraw it. Accepting ends that. */
export function canRevoke(
  invite: Pick<ProjectInvite, 'status' | 'expiresAt'>,
  now: number,
): boolean {
  const status = effectiveStatus(invite, now)
  return status === 'pending' || status === 'expired'
}

/**
 * Whether re-sending makes sense.
 *
 * An expired invitation qualifies: re-sending it is how a sender revives one
 * the recipient never got round to, and the fresh deadline is exactly what
 * they mean by "send it again".
 */
export function canResend(
  invite: Pick<ProjectInvite, 'status' | 'expiresAt'>,
  now: number,
): boolean {
  return canRevoke(invite, now)
}

/**
 * The copy of an invitation that is safe to hand out.
 *
 * The raw token exists for one instant — the reply that carries it back to
 * whoever created it. Everything else (a project's invitation list, a
 * dashboard, a log line) must go through here, so "the token leaked into a
 * response" is a thing that cannot happen by forgetting.
 *
 * The stored status is replaced with the effective one for the same reason
 * the endpoint persists it: a caller must never be told `pending` about an
 * invitation this module considers expired.
 */
export function redact(invite: ProjectInvite, now: number): ProjectInvite {
  const { token: _token, ...rest } = invite
  return { ...rest, status: effectiveStatus(invite, now) }
}

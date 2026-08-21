import type { CollabRole } from '../../types/collab.js'

/**
 * The project ACL and the rule that decides who a membership belongs to
 * (Phase 16.2).
 *
 * Shared VERBATIM by the browser and the endpoints, and dependency-free
 * for the same reason `roleAccess.ts` is: the two must not be able to
 * drift, and the browser must only ever *predict* what the server decides.
 *
 * ## The migration this file is
 *
 * Memberships were keyed by Google e-mail address, which is why invitations
 * had to go to the exact mailbox someone signs in with, and why an address
 * that changes hands carries the membership to its new holder.
 *
 * A slot is still *opened* with an address — you invite people you have not
 * met, and an address is all you have. What changes is what happens once
 * they arrive:
 *
 *   **an address that has been bound to a userId is claimable only by that
 *   userId; an address with no binding is still claimable by whoever
 *   proves that address.**
 *
 * So the e-mail stops being load-bearing the moment its owner signs in,
 * and stays load-bearing exactly where it has to: an invitation that has
 * not been accepted yet.
 *
 * Gradual and reversible, both deliberately. The role lists keep the shape
 * and the wire format they have always had; the bindings are one extra,
 * optional metadata key. A deployment that does not know about them reads
 * the ACL exactly as before and matches by address, so a rollback costs
 * nothing and loses nobody. Dropping the addresses from the lists is a
 * later, separate step, and it needs a server that can resolve *somebody
 * else's* address to a userId — Phase 17.
 */

/** A person, as the ACL is asked about them. */
export interface Principal {
  /** Lowercased, provider-verified address. */
  email: string
  /**
   * Every userId this person could hold — see `googleUserIds`. It is a set
   * rather than one id because a user created before 16.1 carries the
   * legacy id while the same Google account creates the canonical one, and
   * the ACL may have been bound to either.
   */
  userIds: string[]
}

export interface RoomAcl {
  ownerEmail: string
  admins: string[]
  editors: string[]
  commenters: string[]
  viewers: string[]
  /**
   * address → the userId proven to own it. Present only for members who
   * have opened the project since 16.2; an absent entry means "nobody has
   * claimed this address yet", which is what an open invitation is.
   */
  bindings: Record<string, string>
}

/** Role slots, highest rank first — the order membership is resolved in. */
const SLOTS: readonly CollabRole[] = ['owner', 'admin', 'editor', 'commenter', 'viewer']

function slotList(acl: RoomAcl, role: CollabRole): string[] {
  switch (role) {
    case 'owner':
      return acl.ownerEmail ? [acl.ownerEmail] : []
    case 'admin':
      return acl.admins
    case 'editor':
      return acl.editors
    case 'commenter':
      return acl.commenters
    case 'viewer':
      return acl.viewers
  }
}

/**
 * Whether `principal` may claim the slot opened for `slotEmail`.
 *
 * The whole phase is this function. A bound slot answers only to its
 * userId — which is what stops a reassigned address from inheriting a
 * membership, and what lets someone whose address changed keep one.
 */
export function slotBelongsTo(
  acl: RoomAcl,
  slotEmail: string,
  principal: Principal,
): boolean {
  if (!slotEmail) return false
  const bound = acl.bindings[slotEmail]
  if (bound) return principal.userIds.includes(bound)
  return slotEmail === principal.email
}

/** The slot a principal holds, highest rank first; null when they hold none. */
export function matchOf(
  acl: RoomAcl,
  principal: Principal,
): { role: CollabRole; slotEmail: string } | null {
  for (const role of SLOTS) {
    for (const slotEmail of slotList(acl, role)) {
      if (slotBelongsTo(acl, slotEmail, principal)) return { role, slotEmail }
    }
  }
  return null
}

export function roleOf(acl: RoomAcl, principal: Principal): CollabRole | null {
  return matchOf(acl, principal)?.role ?? null
}

/**
 * Every slot the ACL holds, highest rank first — the whole grant, flattened.
 *
 * For readers rather than for checks: an admin looking at "who can actually
 * reach this project" needs the list the server enforces, and the five role
 * arrays are an awkward shape to render. `claimed` is whether the slot has
 * been bound to a userId, which is the difference between a person who has
 * arrived and an address that is merely reserved for one.
 */
export function aclSlots(
  acl: RoomAcl,
): { email: string; role: CollabRole; claimed: boolean }[] {
  const slots: { email: string; role: CollabRole; claimed: boolean }[] = []
  for (const role of SLOTS) {
    for (const email of slotList(acl, role)) {
      slots.push({ email, role, claimed: !!acl.bindings[email] })
    }
  }
  return slots
}

/**
 * The role a slot currently carries, addressed by the e-mail it was opened
 * with and independent of who may claim it.
 *
 * This is the question an admin asks — "what is bob@example.com right
 * now" — and it must NOT go through {@link slotBelongsTo}: a bound slot
 * belongs to a userId nobody else can present, so asking that way would
 * report every bound member as holding no role, and the rank checks that
 * stop an editor from removing an admin would wave them through.
 */
export function roleOfSlot(acl: RoomAcl, email: string): CollabRole | null {
  if (!email) return null
  for (const role of SLOTS) {
    if (slotList(acl, role).includes(email)) return role
  }
  return null
}

/**
 * Bind an address to the userId that just proved it.
 *
 * Idempotent, and it never *re*-binds: a slot already claimed by someone
 * stays theirs until an admin removes it, which is the point. Rebinding on
 * sight would hand the membership to whoever holds the address today —
 * precisely the behaviour this phase removes.
 */
export function bindUserId(acl: RoomAcl, email: string, userId: string): RoomAcl {
  if (!email || !userId || acl.bindings[email]) return acl
  return { ...acl, bindings: { ...acl.bindings, [email]: userId } }
}

/** Remove an address from every role list, and forget what it was bound to. */
export function stripEmail(acl: RoomAcl, email: string): RoomAcl {
  const drop = (list: string[]) => list.filter((e) => e !== email)
  const bindings = { ...acl.bindings }
  delete bindings[email]
  return {
    ownerEmail: acl.ownerEmail,
    admins: drop(acl.admins),
    editors: drop(acl.editors),
    commenters: drop(acl.commenters),
    viewers: drop(acl.viewers),
    bindings,
  }
}

/**
 * Put an address in a role's list, removing it from the others.
 *
 * The binding survives a role change on purpose: it is a fact about who
 * holds the address, not about what they may do with it.
 */
export function addEmail(acl: RoomAcl, email: string, role: CollabRole): RoomAcl {
  const bound = acl.bindings[email]
  const next = stripEmail(acl, email)
  if (bound) next.bindings[email] = bound
  switch (role) {
    case 'owner':
      next.ownerEmail = email
      break
    case 'admin':
      next.admins = [...next.admins, email]
      break
    case 'editor':
      next.editors = [...next.editors, email]
      break
    case 'commenter':
      next.commenters = [...next.commenters, email]
      break
    case 'viewer':
      next.viewers = [...next.viewers, email]
      break
  }
  return next
}

/* ---------------- the bindings, on the wire ---------------- */

/**
 * `"<userId> <address>"`. A space cannot occur in either half of an
 * unquoted address, and keeping the pair in one string keeps the whole
 * migration inside a single optional metadata key.
 */
const SEPARATOR = ' '

export function encodeBindings(bindings: Record<string, string>): string[] {
  return Object.entries(bindings)
    .filter(([email, userId]) => isEncodable(email) && isEncodable(userId))
    .map(([email, userId]) => `${userId}${SEPARATOR}${email}`)
}

export function decodeBindings(rows: string[] | undefined): Record<string, string> {
  const bindings: Record<string, string> = {}
  for (const row of rows ?? []) {
    const at = row.indexOf(SEPARATOR)
    if (at <= 0) continue
    const userId = row.slice(0, at)
    const email = row.slice(at + 1).toLowerCase()
    // last write wins, but a malformed half is dropped rather than stored:
    // a half-read binding would silently unbind a slot
    if (email && userId) bindings[email] = userId
  }
  return bindings
}

const isEncodable = (value: string): boolean =>
  !!value && !value.includes(SEPARATOR) && !value.includes('\n')

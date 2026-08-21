import type { CollabRole, ProjectMember } from '@/types/collab'

/**
 * memberRole — what the local member list says your role is.
 *
 * One pure function, in one place, because two copies of this answer had
 * drifted into being: `MembersService.actualRole` ranks you against the
 * people you are about to demote, `useCollab.useMyRole` decides whether the
 * whole app is editable, and they were separately written `?? 'owner'`.
 *
 * ## The default that was wrong
 *
 * "A project without membership data belongs to the local user" is true of a
 * vault nobody has ever shared, and false of every project that arrived from
 * somewhere else. It made the app grant OWNER to anyone holding a project
 * whose member list names other people — the full editing UI, the sidebar's
 * create and delete, the board tools — while the realtime endpoint refused
 * every write the same person made, because the ACL it enforces had never
 * heard of them. The screen said owner, the server said "not a member of
 * this project", and the edits piled up in an offline queue nobody would
 * ever receive.
 *
 * So the default is kept exactly where it is honest and withdrawn where it
 * is not:
 *
 *  - **you are in the list** — that row is the answer, whatever it says.
 *  - **nobody in the list has an address** — an empty list, or the residue
 *    of a bootstrap that ran before creators were recorded and appointed a
 *    nameless local identity. Nothing there is a grant to anybody, and a
 *    local-only vault must not lock its own owner out: you are the owner.
 *  - **somebody with a real address holds it, and it is not you** — you
 *    hold nothing. `viewer` rather than nothing at all, because the project
 *    is in front of you and reading it is what you can honestly do.
 *
 * ## Matched on the address too, not the id alone
 *
 * Matching by `userId` alone would demote the very people this is meant to
 * protect: one Google account carries a pre-16.1 legacy id on the browser
 * that was migrated and a canonical one everywhere else
 * (`auth/identity.googleUserIds`), so the same person can hold a membership
 * under an id this device does not present. The address is the second key —
 * the same fallback the server ACL uses for a slot nobody has claimed yet.
 */

export interface RoleIdentity {
  userId: string
  email: string
}

const sameAddress = (a: string, b: string): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

export function roleInProject(
  members: ProjectMember[] | undefined,
  identity: RoleIdentity,
): CollabRole {
  const active = (members ?? []).filter((m) => m.status === 'active')
  const mine = active.find(
    (m) => m.userId === identity.userId || sameAddress(m.email, identity.email),
  )
  if (mine) return mine.role
  return active.some((m) => m.email) ? 'viewer' : 'owner'
}

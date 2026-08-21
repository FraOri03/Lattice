import type { CollabRole, ProjectMember } from '@/types/collab'
import { useStore } from '@/store/useStore'
import { useCollabStore } from './collabStore'
import { activityLog } from './ActivityLogService'
import { collabHub } from './hub'
import { canRevoke } from './invitations'
import { inviteService } from './InviteService'
import { currentIdentity } from './localIdentity'
import { serverAcl } from './ServerAclService'

/**
 * revokeSharing — take every project in this vault back to one person.
 *
 * `ShareDialog` removes one member of one project, which is the right shape
 * for a mistake and the wrong one for a mess. A vault that has been through
 * several accounts on the same browser accumulates memberships nobody
 * remembers granting: the pre-16.2 owner bootstrap appointed whichever
 * identity opened a project first *on each device*, so a project synced
 * across two browser profiles and a Drive folder comes back carrying several
 * owners, some of them nameless guests with no address at all. Every one of
 * those rows is a real grant — the read-only banner, the disabled controls
 * and the Share dialog all read from it.
 *
 * This is the bulk answer: keep one address, revoke everything else,
 * everywhere, and say what the server would not do.
 *
 * ## Tombstones, not deletions
 *
 * Membership merges as a union keyed by userId with last-write-wins
 * (`ConflictResolverV2.mergeMembers`), so a row deleted from the array comes
 * straight back from the first peer or CRDT copy that still holds it.
 * Removal is therefore `status: 'removed'` with a fresh `updatedAt`, exactly
 * as `MembersService.removeMember` does it — a fact that wins the merge
 * rather than an absence that loses it.
 *
 * ## The server is asked, never assumed
 *
 * The realtime ACL is the authority on who may actually write
 * (`api/realtime/rooms`), and it refuses to move an owner slot through
 * `set-role`. So a project whose *server* owner is somebody else cannot be
 * reclaimed from here, however thoroughly the local list is rewritten. That
 * outcome is reported, not swallowed: {@link RevokeReport.refused} is the
 * list of things this device asked for and did not get.
 */

/** Addresses compare case-insensitively, or the check has a trivial bypass. */
export function sameAddress(a: string, b: string): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** One grant held by somebody other than the address being kept. */
export interface ForeignGrant {
  projectId: string
  /** The project's name, or its id when the vault no longer holds it. */
  projectName: string
  kind: 'member' | 'invite'
  /** `''` for a membership recorded without one — a guest identity. */
  email: string
  /** What a summary shows: the address, or the name standing in for it. */
  label: string
  role: CollabRole
  /** An owner slot: local rewriting works, `set-role` on the server does not. */
  owner: boolean
}

export interface RevokeReport {
  /** Projects that held at least one foreign grant. */
  projects: number
  members: number
  invites: number
  /** Projects whose owner row was foreign and is now the keeper's. */
  reclaimed: string[]
  /** What the server refused, one line each — never silently dropped. */
  refused: string[]
}

/**
 * Every grant in this vault that is not the kept address's.
 *
 * Read from the collaboration store rather than from the project list: its
 * maps outlive the projects they describe (a purge before 15.6 left them
 * behind), and an address stranded in a record for a project that no longer
 * exists is still an address stored on this machine.
 */
export function foreignGrants(keepEmail: string): ForeignGrant[] {
  const now = Date.now()
  const projects = useStore.getState().projects
  const { members, invites } = useCollabStore.getState()
  const nameOf = (projectId: string) => projects[projectId]?.name ?? projectId
  const found: ForeignGrant[] = []

  for (const [projectId, list] of Object.entries(members)) {
    for (const member of list) {
      if (member.status === 'removed') continue
      if (sameAddress(member.email, keepEmail)) continue
      found.push({
        projectId,
        projectName: nameOf(projectId),
        kind: 'member',
        email: member.email,
        label: member.email || member.name || member.userId,
        role: member.role,
        owner: member.role === 'owner',
      })
    }
  }

  for (const [projectId, list] of Object.entries(invites)) {
    for (const invite of list) {
      // an accepted or declined invitation is a historical record; only an
      // offer that could still turn into access is worth withdrawing
      if (!canRevoke(invite, now)) continue
      if (sameAddress(invite.email, keepEmail)) continue
      found.push({
        projectId,
        projectName: nameOf(projectId),
        kind: 'invite',
        email: invite.email,
        label: invite.email,
        role: invite.role,
        owner: false,
      })
    }
  }

  return found
}

/** The addresses in a grant list, deduplicated, for a confirmation summary. */
export function grantAddresses(grants: ForeignGrant[]): string[] {
  return [...new Set(grants.map((g) => g.label))].sort()
}

/**
 * Revoke every grant that is not `keepEmail`'s, in every project.
 *
 * `keepEmail` is the signed-in account's address and not a parameter the UI
 * invents: the row that survives has to be one this browser can still prove,
 * or the sweep locks the user out of their own vault.
 */
export async function revokeForeignAccess(keepEmail: string): Promise<RevokeReport> {
  const keeper = currentIdentity()
  const report: RevokeReport = {
    projects: 0,
    members: 0,
    invites: 0,
    reclaimed: [],
    refused: [],
  }
  if (!keepEmail.trim()) return report

  // the server knows about invitations this device has never seen — a link
  // sent from another browser is exactly the kind of standing offer a sweep
  // is for. Best effort: a project the server does not know falls back to
  // whatever is local, which is what `refresh` already does.
  for (const projectId of Object.keys(useCollabStore.getState().invites)) {
    await inviteService.refresh(projectId).catch(() => {})
  }

  const grants = foreignGrants(keepEmail)
  const byProject = new Map<string, ForeignGrant[]>()
  for (const grant of grants) {
    const list = byProject.get(grant.projectId) ?? []
    list.push(grant)
    byProject.set(grant.projectId, list)
  }
  report.projects = byProject.size

  for (const [projectId, list] of byProject) {
    const projectName = list[0].projectName
    const memberGrants = list.filter((g) => g.kind === 'member')
    const inviteGrants = list.filter((g) => g.kind === 'invite')

    if (memberGrants.length) {
      report.members += memberGrants.length
      if (revokeMembersLocally(projectId, keepEmail, keeper)) {
        report.reclaimed.push(projectName)
      }
      for (const grant of memberGrants) {
        if (!grant.email) continue // a guest row the server never knew
        const result = await serverAcl.setRole(projectId, grant.email, null)
        if (!result.ok) {
          report.refused.push(
            `${projectName} — ${grant.label}: ${result.error ?? 'refused'}`,
          )
        }
      }
    }

    for (const grant of inviteGrants) {
      const invite = inviteService
        .invitesOf(projectId)
        .find((i) => sameAddress(i.email, grant.email))
      if (!invite) continue
      await inviteService.revoke(projectId, invite.id)
      report.invites += 1
    }
  }

  return report
}

/**
 * Rewrite one project's member list: foreign rows tombstoned, the keeper
 * left holding an active owner row.
 *
 * @returns whether an owner row had to be reclaimed — `createdBy` is
 * restamped when it was, because `MembersService.ensureOwner` rebuilds the
 * owner from that field on any device whose member list is still empty, and
 * would otherwise reinstate exactly the row this just removed.
 */
function revokeMembersLocally(
  projectId: string,
  keepEmail: string,
  keeper: ReturnType<typeof currentIdentity>,
): boolean {
  const store = useCollabStore.getState()
  const now = Date.now()
  const before = store.members[projectId] ?? []
  const removed: string[] = []
  let removedOwner = false

  const next = before.map((member) => {
    if (member.status === 'removed') return member
    if (sameAddress(member.email, keepEmail)) return member
    removed.push(member.email || member.name || member.userId)
    if (member.role === 'owner') removedOwner = true
    return { ...member, status: 'removed' as const, updatedAt: now }
  })

  // a project with no active owner is unmanageable — `changeRole` and
  // `removeMember` both rank the actor against the target — so the keeper
  // takes the slot, under the userId `useMyRole` actually matches on
  if (!next.some((m) => m.status === 'active' && m.role === 'owner')) {
    const mine = next.findIndex((m) => m.userId === keeper.userId)
    if (mine >= 0) {
      next[mine] = {
        ...next[mine],
        role: 'owner',
        status: 'active',
        email: keeper.email || next[mine].email,
        updatedAt: now,
      }
    } else {
      const owner: ProjectMember = {
        userId: keeper.userId,
        name: keeper.name,
        email: keeper.email,
        avatarUrl: keeper.avatarUrl,
        role: 'owner',
        joinedAt: now,
        invitedBy: keeper.userId,
        status: 'active',
        lastActiveAt: now,
        updatedAt: now,
      }
      next.push(owner)
    }
  }

  store.setMembers(projectId, next)
  for (const name of removed) {
    activityLog.log(projectId, 'member.removed', `${name} was removed from the project`)
  }
  collabHub.broadcastState(projectId)

  if (removedOwner) restampCreator(projectId, keeper)
  return removedOwner
}

/**
 * Record the keeper as the project's creator.
 *
 * Written straight into the store rather than through `updateProject`,
 * because that stamps `updatedAt` — and `updatedAt` is what Home and the
 * project switcher sort by. A repair is not an edit, and a sweep across a
 * whole vault must not reshuffle every shelf in it.
 */
function restampCreator(
  projectId: string,
  keeper: ReturnType<typeof currentIdentity>,
): void {
  const projects = useStore.getState().projects
  const project = projects[projectId]
  if (!project) return
  useStore.setState({
    projects: {
      ...projects,
      [projectId]: {
        ...project,
        createdBy: {
          userId: keeper.userId,
          email: keeper.email.trim().toLowerCase(),
          name: keeper.name,
          avatarUrl: keeper.avatarUrl,
        },
      },
    },
  })
}

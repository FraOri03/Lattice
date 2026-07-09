import { nid } from '@/lib/id'
import type { CollabRole, ProjectInvite } from '@/types/collab'
import { useCollabStore } from './collabStore'
import { currentIdentity } from './CollaborationProvider'
import { membersService } from './MembersService'
import { activityLog } from './ActivityLogService'
import { collabHub } from './hub'

/**
 * InviteService — invite people to a project by email.
 *
 * Honest limits: Lattice has no email backend, so invites are delivered
 * as LINKS (copy & send yourself). The link carries an opaque token; when
 * someone opens it in a browser where the invite state is reachable (same
 * browser, or same Drive via the polling provider), the accept flow adds
 * them as a member with the assigned role. The share dialog also offers
 * "simulate acceptance" so permission flows are testable offline.
 */

class InviteService {
  invitesOf(projectId: string): ProjectInvite[] {
    return useCollabStore.getState().invites[projectId] ?? []
  }

  create(projectId: string, email: string, role: CollabRole): ProjectInvite | null {
    const clean = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return null
    const s = useCollabStore.getState()
    const existing = this.invitesOf(projectId).find(
      (i) => i.email === clean && i.status === 'pending',
    )
    if (existing) return existing
    const identity = currentIdentity()
    const now = Date.now()
    const invite: ProjectInvite = {
      id: nid('inv'),
      projectId,
      email: clean,
      role,
      token: nid('tok') + nid('tok'),
      createdAt: now,
      invitedBy: identity.userId,
      invitedByName: identity.name,
      status: 'pending',
      updatedAt: now,
    }
    s.setInvites(projectId, [invite, ...this.invitesOf(projectId)])
    activityLog.log(
      projectId,
      'member.invited',
      `${clean} was invited as ${role}`,
      invite.id,
    )
    collabHub.broadcastState(projectId)
    return invite
  }

  linkFor(invite: ProjectInvite): string {
    return `${location.origin}${location.pathname}#invite=${invite.token}`
  }

  revoke(projectId: string, inviteId: string): void {
    this.patch(projectId, inviteId, { status: 'revoked' })
  }

  resend(projectId: string, inviteId: string): void {
    this.patch(projectId, inviteId, { resentAt: Date.now() })
  }

  /** Find a pending invite by link token across all projects. */
  findByToken(token: string): ProjectInvite | null {
    const all = useCollabStore.getState().invites
    for (const list of Object.values(all)) {
      const hit = list.find((i) => i.token === token && i.status === 'pending')
      if (hit) return hit
    }
    return null
  }

  /**
   * Accept an invite as the CURRENT identity (real accept flow, used when
   * an invite link is opened).
   */
  accept(invite: ProjectInvite): boolean {
    if (invite.status !== 'pending') return false
    const identity = currentIdentity()
    membersService.addMember(invite.projectId, {
      userId: identity.userId,
      name: identity.name,
      email: identity.email || invite.email,
      avatarUrl: identity.avatarUrl,
      role: invite.role,
      invitedBy: invite.invitedBy,
    })
    this.patch(invite.projectId, invite.id, {
      status: 'accepted',
      acceptedAt: Date.now(),
    })
    return true
  }

  /**
   * Simulate the invitee accepting (offline testing): creates a mock
   * member from the invited email so roles/permissions can be exercised
   * without a second person.
   */
  acceptAsMock(invite: ProjectInvite): boolean {
    if (invite.status !== 'pending') return false
    membersService.addMember(invite.projectId, {
      userId: `mock_${invite.email}`,
      name: invite.email.split('@')[0],
      email: invite.email,
      role: invite.role,
      invitedBy: invite.invitedBy,
    })
    this.patch(invite.projectId, invite.id, {
      status: 'accepted',
      acceptedAt: Date.now(),
    })
    return true
  }

  private patch(
    projectId: string,
    inviteId: string,
    patch: Partial<ProjectInvite>,
  ): void {
    const s = useCollabStore.getState()
    s.setInvites(
      projectId,
      this.invitesOf(projectId).map((i) =>
        i.id === inviteId ? { ...i, ...patch, updatedAt: Date.now() } : i,
      ),
    )
    collabHub.broadcastState(projectId)
  }
}

export const inviteService = new InviteService()

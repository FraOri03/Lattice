import type { CollabRole, ProjectMember } from '@/types/collab'
import { useCollabStore } from './collabStore'
import { currentIdentity } from './CollaborationProvider'
import { canManageRole } from './permissions'
import { activityLog } from './ActivityLogService'
import { collabHub } from './hub'
import { serverAcl } from './ServerAclService'

/**
 * MembersService — project membership. Every project has exactly one
 * owner; the local account is bootstrapped as owner of projects that have
 * no member list yet (all pre-Phase-7 projects).
 */

class MembersService {
  /** Idempotent: make sure the current user owns projects they created. */
  ensureOwner(projectId: string): void {
    const s = useCollabStore.getState()
    const members = s.members[projectId] ?? []
    if (members.some((m) => m.status === 'active' && m.role === 'owner')) {
      this.touchSelf(projectId)
      return
    }
    const identity = currentIdentity()
    const now = Date.now()
    const owner: ProjectMember = {
      userId: identity.userId,
      name: identity.name,
      email: identity.email,
      avatarUrl: identity.avatarUrl,
      role: 'owner',
      joinedAt: now,
      invitedBy: identity.userId,
      status: 'active',
      lastActiveAt: now,
      updatedAt: now,
    }
    s.setMembers(projectId, [
      owner,
      ...members.filter((m) => m.userId !== identity.userId),
    ])
    collabHub.broadcastState(projectId)
  }

  membersOf(projectId: string): ProjectMember[] {
    return (useCollabStore.getState().members[projectId] ?? []).filter(
      (m) => m.status !== 'removed',
    )
  }

  /** The current user's real role in a project (no view-as applied). */
  actualRole(projectId: string): CollabRole {
    const identity = currentIdentity()
    const member = this.membersOf(projectId).find(
      (m) => m.userId === identity.userId && m.status === 'active',
    )
    // projects without membership data belong to the local user
    return member?.role ?? 'owner'
  }

  /** Role used for permission checks — honors the "view as" preview. */
  effectiveRole(projectId: string): CollabRole {
    const viewAs = useCollabStore.getState().viewAsRole
    const actual = this.actualRole(projectId)
    if (viewAs && actual === 'owner') return viewAs
    return actual
  }

  changeRole(projectId: string, userId: string, role: CollabRole): boolean {
    const s = useCollabStore.getState()
    const members = s.members[projectId] ?? []
    const target = members.find((m) => m.userId === userId)
    if (!target || target.role === 'owner') return false
    if (!canManageRole(this.actualRole(projectId), target.role)) return false
    s.setMembers(
      projectId,
      members.map((m) =>
        m.userId === userId ? { ...m, role, updatedAt: Date.now() } : m,
      ),
    )
    activityLog.log(
      projectId,
      'member.role-changed',
      `${target.name || target.email} is now ${role}`,
      userId,
    )
    collabHub.broadcastState(projectId)
    void serverAcl.setRole(projectId, target.email, role)
    return true
  }

  removeMember(projectId: string, userId: string): boolean {
    const s = useCollabStore.getState()
    const members = s.members[projectId] ?? []
    const target = members.find((m) => m.userId === userId)
    if (!target || target.role === 'owner') return false
    if (!canManageRole(this.actualRole(projectId), target.role)) return false
    s.setMembers(
      projectId,
      members.map((m) =>
        m.userId === userId
          ? { ...m, status: 'removed' as const, updatedAt: Date.now() }
          : m,
      ),
    )
    activityLog.log(
      projectId,
      'member.removed',
      `${target.name || target.email} was removed from the project`,
      userId,
    )
    collabHub.broadcastState(projectId)
    void serverAcl.setRole(projectId, target.email, null)
    return true
  }

  /** Owner-only. The previous owner becomes an admin. */
  transferOwnership(projectId: string, toUserId: string): boolean {
    if (this.actualRole(projectId) !== 'owner') return false
    const s = useCollabStore.getState()
    const members = s.members[projectId] ?? []
    const target = members.find(
      (m) => m.userId === toUserId && m.status === 'active',
    )
    if (!target || target.role === 'owner') return false
    const identity = currentIdentity()
    const now = Date.now()
    s.setMembers(
      projectId,
      members.map((m) => {
        if (m.userId === toUserId) return { ...m, role: 'owner' as const, updatedAt: now }
        if (m.userId === identity.userId)
          return { ...m, role: 'admin' as const, updatedAt: now }
        return m
      }),
    )
    activityLog.log(
      projectId,
      'member.role-changed',
      `Ownership transferred to ${target.name || target.email}`,
      toUserId,
    )
    collabHub.broadcastState(projectId)
    return true
  }

  /**
   * Add a member directly (used by the invite acceptance flow and by the
   * local test-member tool in the share dialog).
   */
  addMember(
    projectId: string,
    partial: Pick<ProjectMember, 'userId' | 'name' | 'email' | 'role'> &
      Partial<ProjectMember>,
  ): void {
    const s = useCollabStore.getState()
    const members = s.members[projectId] ?? []
    const now = Date.now()
    const identity = currentIdentity()
    const member: ProjectMember = {
      avatarUrl: '',
      joinedAt: now,
      invitedBy: identity.userId,
      status: 'active',
      updatedAt: now,
      ...partial,
    }
    s.setMembers(projectId, [
      ...members.filter((m) => m.userId !== member.userId),
      member,
    ])
    activityLog.log(
      projectId,
      'member.joined',
      `${member.name || member.email} joined as ${member.role}`,
      member.userId,
    )
    collabHub.broadcastState(projectId)
    void serverAcl.setRole(projectId, member.email, member.role)
  }

  /** Refresh the current user's lastActiveAt (cheap presence-over-Drive). */
  private touchSelf(projectId: string): void {
    const s = useCollabStore.getState()
    const identity = currentIdentity()
    const members = s.members[projectId] ?? []
    const me = members.find((m) => m.userId === identity.userId)
    if (!me) return
    // avoid rebroadcasting for sub-minute touches
    if (Date.now() - (me.lastActiveAt ?? 0) < 60_000) return
    s.setMembers(
      projectId,
      members.map((m) =>
        m.userId === identity.userId
          ? { ...m, lastActiveAt: Date.now(), updatedAt: Date.now() }
          : m,
      ),
    )
    collabHub.broadcastState(projectId)
  }
}

export const membersService = new MembersService()

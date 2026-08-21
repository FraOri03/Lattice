import type { CollabRole, ProjectMember } from '@/types/collab'
import { useStore } from '@/store/useStore'
import { useCollabStore } from './collabStore'
import { currentIdentity } from './localIdentity'
import { canManageRole } from './permissions'
import { roleInProject } from './memberRole'
import { activityLog } from './ActivityLogService'
import { collabHub } from './hub'
import { serverAcl } from './ServerAclService'
import { mirrorToServer } from './serverMirror'

/**
 * MembersService — project membership. Every project has exactly one
 * owner; the local account is bootstrapped as owner of projects that have
 * no member list yet (all pre-Phase-7 projects).
 */

class MembersService {
  /** Idempotent: make sure the current user owns projects they created. */
  /**
   * Make sure the project has its owner recorded.
   *
   * The owner is the account that CREATED the project, read from
   * `project.createdBy`. That field travels with the project, so every device
   * that opens it writes the same owner instead of appointing itself — which
   * is what produced projects carrying four owners, one per device that had
   * ever seen them, and two of them nameless guests with no address at all.
   *
   * The current identity is used only for projects created before the creator
   * was recorded. That fallback is the old behaviour, kept because a legacy
   * project with no owner at all would otherwise be unmanageable, and narrowed
   * to the only case that needs it.
   */
  ensureOwner(projectId: string): void {
    const s = useCollabStore.getState()
    const members = s.members[projectId] ?? []
    if (members.some((m) => m.status === 'active' && m.role === 'owner')) {
      this.touchSelf(projectId)
      return
    }
    const creator = useStore.getState().projects[projectId]?.createdBy
    const identity = creator ?? currentIdentity()
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

  /**
   * The current user's real role in a project (no view-as applied).
   *
   * Resolved by `memberRole.roleInProject`, which is also what the hooks
   * read: the rank checks below decide who may demote whom, and an answer
   * that disagreed with the one the UI is showing would let a control appear
   * that its own handler then refuses.
   */
  actualRole(projectId: string): CollabRole {
    return roleInProject(this.membersOf(projectId), currentIdentity())
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
    void mirrorToServer(
      projectId,
      `${target.name || target.email} still has their old access on the server.`,
      () => serverAcl.setRole(projectId, target.email, role),
    )
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
    // the direction that matters: they are gone from this screen and, until
    // this lands, still able to write over the realtime backend
    void mirrorToServer(
      projectId,
      `${target.name || target.email} still has access on the server.`,
      () => serverAcl.setRole(projectId, target.email, null),
    )
    return true
  }

  /**
   * Owner-only. The previous owner becomes an admin.
   *
   * Mirrored to the server like every other membership change in this file.
   * It was not, and it was the only one: on a realtime project the local list
   * said the recipient owned it while the ACL the endpoints enforce still
   * named the sender — so the new owner could not manage admins or delete the
   * rooms, and the old one still could.
   */
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
    void mirrorToServer(
      projectId,
      `The server still records you as the owner, not ${target.name || target.email}.`,
      () => serverAcl.transferOwnership(projectId, target.email),
    )
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
    void mirrorToServer(
      projectId,
      `${member.name || member.email} does not have access on the server yet.`,
      () => serverAcl.setRole(projectId, member.email, member.role),
    )
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

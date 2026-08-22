import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import type { CollabRole, PresencePeer } from '@/types/collab'
import { useCollabStore } from './collabStore'
import { SESSION_ID, currentIdentity } from './CollaborationProvider'
import { can, isReadOnly, type Capability } from './permissions'
import { roleInProject } from './memberRole'

/**
 * React hooks over the collaboration layer. Components use these instead
 * of talking to services directly, so role changes and the "view as"
 * preview re-render everything consistently.
 */

/** The current user's effective role in the active project. */
export function useMyRole(): CollabRole {
  const projectId = useStore((s) => s.activeProjectId)
  const members = useCollabStore((s) => s.members[projectId])
  const viewAsRole = useCollabStore((s) => s.viewAsRole)
  return useMemo(() => {
    const actual = roleInProject(members, currentIdentity())
    if (viewAsRole && actual === 'owner') return viewAsRole
    return actual
  }, [members, viewAsRole])
}

/**
 * Somebody else's role in the active project, by id or by address.
 *
 * A presence peer and a comment author carry a name and a face and no role —
 * the role lives in the member list, which is the one record that has it. So
 * the marks that follow a face around the app (`AdminMark`) look it up here
 * rather than each growing their own copy of the join.
 *
 * Both keys, for the same reason `memberRole` matches on both: one Google
 * account can hold a membership under an id a given device does not present
 * (`auth/identity.googleUserIds`), and the address is the fallback the
 * server ACL already uses for a slot nobody has claimed.
 *
 * `undefined` means the list does not know them — a peer in a project this
 * device has no membership record for, which is not the same as a viewer and
 * must not be drawn as one.
 */
export function useRoleLookup(): (
  userId: string,
  email?: string,
) => CollabRole | undefined {
  const projectId = useStore((s) => s.activeProjectId)
  const members = useCollabStore((s) => s.members[projectId])
  return useMemo(() => {
    const byId = new Map<string, CollabRole>()
    const byEmail = new Map<string, CollabRole>()
    for (const member of members ?? []) {
      if (member.status !== 'active') continue
      if (member.userId) byId.set(member.userId, member.role)
      if (member.email) byEmail.set(member.email.trim().toLowerCase(), member.role)
    }
    return (userId, email) =>
      byId.get(userId) ??
      (email ? byEmail.get(email.trim().toLowerCase()) : undefined)
  }, [members])
}

export function useCan(cap: Capability): boolean {
  return can(useMyRole(), cap)
}

/** True when the current role cannot edit content (viewer/commenter). */
export function useReadOnly(): boolean {
  return isReadOnly(useMyRole())
}

/** Live peers in the active project (other sessions, this one excluded). */
export function usePeers(): PresencePeer[] {
  const projectId = useStore((s) => s.activeProjectId)
  const peers = useCollabStore((s) => s.peers)
  return useMemo(
    () =>
      Object.values(peers)
        .filter((p) => p.projectId === projectId && p.sessionId !== SESSION_ID)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [peers, projectId],
  )
}

/** Peers with a live cursor on the given board. */
export function useBoardPeers(boardId: string): PresencePeer[] {
  const peers = usePeers()
  return useMemo(
    () => peers.filter((p) => p.cursor?.boardId === boardId),
    [peers, boardId],
  )
}

/** Open comment count for a target (badges on cards/tabs). */
export function useOpenCommentCount(targetId: string | undefined): number {
  const projectId = useStore((s) => s.activeProjectId)
  const comments = useCollabStore((s) => s.comments[projectId])
  return useMemo(() => {
    if (!targetId || !comments) return 0
    return comments.filter((t) => t.targetId === targetId && !t.resolved).length
  }, [comments, targetId])
}

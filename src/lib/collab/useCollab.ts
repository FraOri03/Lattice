import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import type { CollabRole, PresencePeer } from '@/types/collab'
import { useCollabStore } from './collabStore'
import { SESSION_ID, currentIdentity } from './CollaborationProvider'
import { can, isReadOnly, type Capability } from './permissions'

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
    const identity = currentIdentity()
    const me = members?.find(
      (m) => m.userId === identity.userId && m.status === 'active',
    )
    const actual = me?.role ?? 'owner'
    if (viewAsRole && actual === 'owner') return viewAsRole
    return actual
  }, [members, viewAsRole])
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

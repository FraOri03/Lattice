import type { CollabRole } from '../../types/collab'

/**
 * Role → realtime-room access mapping, shared VERBATIM by the client UI
 * and the Vercel serverless endpoints (api/realtime/*). Keeping it in one
 * dependency-free module means the browser can only ever *predict* what
 * the server will decide — it can never override it.
 *
 * Every project maps to two Liveblocks rooms:
 *  - content room: Yjs docs for rich documents, code, sheets and boards.
 *    Writable by owner/admin/editor only.
 *  - collab room: comments (incl. area comments), activity, versions
 *    index, membership mirror. Writable by commenters too — that is
 *    exactly what the "commenter" role means.
 *
 * Viewers get read + presence on both rooms: they appear in presence and
 * see everything live, but the backend rejects any write they attempt,
 * regardless of what a tampered client claims.
 */

export type ProjectRoomKind = 'content' | 'collab'

/** Liveblocks permission strings (kept literal: no client-side SDK import). */
export type RoomPermissionString =
  | 'room:write'
  | 'room:read'
  | 'room:presence:write'

export function contentRoomId(projectId: string): string {
  return `lattice:proj:${projectId}`
}

export function collabRoomId(projectId: string): string {
  return `lattice:proj:${projectId}:collab`
}

export function roomIdsForProject(projectId: string): string[] {
  return [contentRoomId(projectId), collabRoomId(projectId)]
}

/** Parse a room id back into { projectId, kind }; null if not ours. */
export function parseRoomId(
  roomId: string,
): { projectId: string; kind: ProjectRoomKind } | null {
  const m = /^lattice:proj:([^:]+)(:collab)?$/.exec(roomId)
  if (!m) return null
  return { projectId: m[1], kind: m[2] ? 'collab' : 'content' }
}

const CONTENT_WRITERS: readonly CollabRole[] = ['owner', 'admin', 'editor']
const COLLAB_WRITERS: readonly CollabRole[] = [
  'owner',
  'admin',
  'editor',
  'commenter',
]

/** Permissions a role receives on a given room kind. */
export function permissionsForRole(
  role: CollabRole,
  kind: ProjectRoomKind,
): RoomPermissionString[] {
  const writers = kind === 'content' ? CONTENT_WRITERS : COLLAB_WRITERS
  return writers.includes(role)
    ? ['room:write']
    : ['room:read', 'room:presence:write']
}

/** True if `role` may write CRDT content (docs/code/boards). */
export function roleWritesContent(role: CollabRole): boolean {
  return CONTENT_WRITERS.includes(role)
}

/** True if `role` may write to the collab room (comments, areas…). */
export function roleWritesCollab(role: CollabRole): boolean {
  return COLLAB_WRITERS.includes(role)
}

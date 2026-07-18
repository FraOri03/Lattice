/**
 * The LiveKit room a project's call lives in.
 *
 * Media is a SEPARATE transport from collaboration: Liveblocks/Yjs keep owning
 * CRDT content, presence, cursors, comments and permissions, while LiveKit
 * carries only audio/video/screen share. The two therefore have their own room
 * namespaces — Liveblocks uses `lattice:proj:<id>` (see
 * src/lib/collab/roleAccess.ts), LiveKit uses the id below.
 *
 * Pure and dependency-free so the browser, the Vercel function and the unit
 * tests all derive the exact same string — the room id is never spelled out
 * inline in a component.
 */

/** Same shape the realtime endpoints already validate project ids against. */
const PROJECT_ID = /^[\w-]{1,64}$/

const PREFIX = 'lattice-project-'

/**
 * The media room for a project. Throws on an invalid id rather than building a
 * room name that could collide or escape its namespace.
 */
export function mediaRoomId(projectId: string): string {
  if (!isValidProjectId(projectId)) {
    throw new Error(`Invalid projectId for a media room: ${JSON.stringify(projectId)}`)
  }
  return `${PREFIX}${projectId}`
}

export function isValidProjectId(projectId: unknown): projectId is string {
  return typeof projectId === 'string' && PROJECT_ID.test(projectId)
}

/** Inverse of `mediaRoomId`; null when the string is not one of ours. */
export function parseMediaRoomId(roomId: string): string | null {
  if (typeof roomId !== 'string' || !roomId.startsWith(PREFIX)) return null
  const projectId = roomId.slice(PREFIX.length)
  return isValidProjectId(projectId) ? projectId : null
}

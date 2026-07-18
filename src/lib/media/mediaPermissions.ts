import type { CollabRole } from '../../types/collab'

/**
 * Role → media capability matrix, shared VERBATIM by the client UI and the
 * Vercel media-token endpoint (api/realtime/media-token.ts) — the same
 * dependency-free pattern as src/lib/collab/roleAccess.ts. The browser can only
 * ever *predict* what the server will grant; the LiveKit token is the real
 * enforcement boundary.
 *
 * HOW THIS WAS DERIVED (not copied blindly from the brief):
 *
 * - `join` / `audio` / `video` — every project member, viewers included.
 *   Rationale: Lattice already grants viewers `room:presence:write` on both
 *   Liveblocks rooms (roleAccess.ts), i.e. viewers may broadcast presence.
 *   Speaking or turning a camera on is presence, not content: it mutates
 *   nothing in the project. Denying it would contradict the existing model.
 *
 * - `screenShare` — owner / admin / editor only, i.e. exactly the roles that
 *   pass `roleWritesContent`. Rationale: a screen share is a broadcast of
 *   arbitrary content into the project's space — the media analogue of
 *   contributing content, not of being present. The brief offered screen share
 *   to commenters "only if coherent with the existing matrix"; it is NOT:
 *   a commenter cannot create or edit content (`content.create`/`content.edit`
 *   are absent from their capability set in permissions.ts), so they do not get
 *   to broadcast it either. Viewers are denied for the same reason.
 *
 * - `moderate` (mute or remove other participants) — owner / admin, mirroring
 *   the `members.manage` capability in permissions.ts. Editors administer
 *   content, not people.
 *
 * Non-members never reach this matrix: the endpoint rejects them from the
 * project ACL before any capability is computed.
 */

export interface MediaCapabilities {
  /** may connect to the project's media room at all */
  join: boolean
  /** may publish a microphone track */
  audio: boolean
  /** may publish a camera track */
  video: boolean
  /** may publish a screen-share track */
  screenShare: boolean
  /** may mute or disconnect other participants */
  moderate: boolean
}

const NONE: MediaCapabilities = {
  join: false,
  audio: false,
  video: false,
  screenShare: false,
  moderate: false,
}

const MATRIX: Record<CollabRole, MediaCapabilities> = {
  owner: { join: true, audio: true, video: true, screenShare: true, moderate: true },
  admin: { join: true, audio: true, video: true, screenShare: true, moderate: true },
  editor: { join: true, audio: true, video: true, screenShare: true, moderate: false },
  commenter: { join: true, audio: true, video: true, screenShare: false, moderate: false },
  viewer: { join: true, audio: true, video: true, screenShare: false, moderate: false },
}

/** Media capabilities for a role; a missing/unknown role gets nothing. */
export function mediaCapabilitiesFor(
  role: CollabRole | null | undefined,
): MediaCapabilities {
  if (!role || !(role in MATRIX)) return { ...NONE }
  return { ...MATRIX[role] }
}

/** LiveKit source names this role may publish (drives `canPublishSources`). */
export type MediaSource =
  | 'microphone'
  | 'camera'
  | 'screen_share'
  | 'screen_share_audio'

export function publishableSources(role: CollabRole | null | undefined): MediaSource[] {
  const caps = mediaCapabilitiesFor(role)
  const sources: MediaSource[] = []
  if (caps.audio) sources.push('microphone')
  if (caps.video) sources.push('camera')
  if (caps.screenShare) sources.push('screen_share', 'screen_share_audio')
  return sources
}

import type { ViewMode } from './model'

/* ---------------- roles & members (Phase 7) ---------------- */

export type CollabRole = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'

export const ROLE_LABEL: Record<CollabRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
}

export const ROLE_DESCRIPTION: Record<CollabRole, string> = {
  owner: 'Full access — delete project, transfer ownership, manage everything',
  admin: 'Manage files and members (except the owner), edit all content',
  editor: 'Create, edit and delete boards, docs, sheets, presentations and code',
  commenter: 'View everything, add comments, resolve own comments',
  viewer: 'Read-only access',
}

export type MemberStatus = 'active' | 'pending' | 'removed'

export interface ProjectMember {
  userId: string
  name: string
  email: string
  avatarUrl: string
  role: CollabRole
  joinedAt: number
  invitedBy: string
  status: MemberStatus
  /** last presence heartbeat we know of (any provider) */
  lastActiveAt?: number
  updatedAt: number
}

/* ---------------- invitations ---------------- */

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface ProjectInvite {
  id: string
  projectId: string
  email: string
  role: CollabRole
  /** opaque token carried by the invite link */
  token: string
  createdAt: number
  invitedBy: string
  invitedByName: string
  status: InviteStatus
  resentAt?: number
  acceptedAt?: number
  updatedAt: number
}

/* ---------------- presence ---------------- */

export interface PresenceLocation {
  mode: ViewMode
  boardId?: string
  entityKind?: 'doc' | 'code' | 'sheet' | 'note' | 'asset'
  entityId?: string
  entityTitle?: string
}

export interface PresencePeer {
  /** unique per tab/session — one user can appear from several tabs */
  sessionId: string
  userId: string
  name: string
  avatarUrl?: string
  /** stable per-user accent color for cursors/outlines */
  color: string
  projectId: string
  location: PresenceLocation
  /** live cursor in board flow coordinates */
  cursor?: { boardId: string; x: number; y: number }
  /** board node ids this peer has selected */
  selection?: string[]
  /** entity the peer is actively editing right now */
  editing?: { kind: 'doc' | 'code' | 'sheet'; id: string; title: string }
  /**
   * transient drag state (Phase 8): node geometry while the peer drags,
   * rendered as a live outline; the final position arrives as a CRDT op
   * on drag end. Never persisted.
   */
  dragging?: {
    boardId: string
    nodes: Record<string, { x: number; y: number; w?: number; h?: number }>
  }
  /** selected cell/range in a spreadsheet (Phase 8 presence) */
  sheetCell?: { sheetId: string; sheetName: string; r: number; c: number }
  /** cursor line in a code file (Phase 8 presence) */
  codeLine?: { codeId: string; line: number }
  lastSeenAt: number
}

/* ---------------- soft file locks (code collaboration) ---------------- */

export interface FileLock {
  fileId: string
  projectId: string
  userId: string
  userName: string
  sessionId: string
  acquiredAt: number
  /** heartbeat — locks expire when this goes stale */
  renewedAt: number
}

/** Lock freshness window: a lock older than this is considered released. */
export const LOCK_TTL_MS = 45_000

/* ---------------- comments ---------------- */

export type CommentTargetType =
  | 'board' // free pin on the canvas (anchor.x/y in flow coords)
  | 'area' // rectangular region of a board (thread.area holds geometry)
  | 'card' // any board card (pin follows the card)
  | 'section'
  | 'doc'
  | 'code'
  | 'sheet'
  | 'asset'
  | 'webembed'

/**
 * Area comment geometry (Phase 8): a translucent rectangle drawn over
 * the board in FLOW coordinates. Lives on its thread (thread.area), so
 * it persists, merges and syncs exactly like every other comment.
 */
export interface CommentArea {
  id: string
  boardId: string
  projectId: string
  x: number
  y: number
  width: number
  height: number
  threadId: string
  authorId: string
  createdAt: number
  updatedAt: number
  resolved: boolean
  color: string
  metadata: Record<string, unknown>
}

export interface CommentAnchor {
  /** board the pin lives on (board/card/section targets) */
  boardId?: string
  /** free-pin position in flow coordinates (board target) */
  x?: number
  y?: number
  /** 1-based line for code comments */
  line?: number
}

export interface CommentReply {
  id: string
  authorId: string
  authorName: string
  authorAvatar?: string
  body: string
  createdAt: number
  updatedAt: number
}

export interface CommentThread {
  id: string
  projectId: string
  targetType: CommentTargetType
  targetId: string
  anchor?: CommentAnchor
  authorId: string
  authorName: string
  authorAvatar?: string
  body: string
  /** @mentioned member names (lowercased) */
  mentions: string[]
  createdAt: number
  updatedAt: number
  resolved: boolean
  resolvedBy?: string
  resolvedByName?: string
  replies: CommentReply[]
  /** rectangle geometry when targetType === 'area' */
  area?: CommentArea
}

/* ---------------- activity log ---------------- */

export type ActivityType =
  | 'project.created'
  | 'member.invited'
  | 'member.joined'
  | 'member.role-changed'
  | 'member.removed'
  | 'file.imported'
  | 'doc.edited'
  | 'code.edited'
  | 'sheet.edited'
  | 'present.edited'
  | 'board.card-moved'
  | 'board.card-added'
  | 'board.card-deleted'
  | 'comment.added'
  | 'comment.resolved'
  | 'version.created'
  | 'version.restored'
  | 'github.sync'
  | 'drive.sync'
  | 'export'

export interface ActivityEvent {
  id: string
  projectId: string
  type: ActivityType
  actorId: string
  actorName: string
  at: number
  /** human-readable one-liner, already resolved (“Ada moved ‘Roadmap’”) */
  message: string
  targetId?: string
}

/* ---------------- version history ---------------- */

export type VersionTargetType = 'board' | 'doc' | 'code' | 'project'

export interface VersionEntry {
  id: string
  projectId: string
  targetType: VersionTargetType
  targetId: string
  targetTitle: string
  createdAt: number
  createdBy: string
  createdByName: string
  label: string
  changeSummary: string
  /** StorageProvider document key holding the snapshot payload */
  snapshotRef: string
}

/* ---------------- provider messages ---------------- */

export type CollabMessageType =
  | 'presence' // full peer state (heartbeat)
  | 'presence-bye' // tab closing
  | 'board-op' // node moved/resized/added/removed
  | 'doc-update' // a document body was saved
  | 'lock' // file lock acquired/renewed
  | 'unlock'
  | 'lock-request' // "may I edit?" ping to the lock holder
  | 'collab-state' // members/invites/comments/activity/versions changed

export interface CollabMessage {
  type: CollabMessageType
  projectId: string
  /** sending session (never echo back to the sender) */
  senderId: string
  at: number
  payload: unknown
}

/** What a provider can honestly deliver — surfaced in the UI. */
export interface CollabCapabilities {
  presence: boolean
  liveCursors: boolean
  liveBoardOps: boolean
  liveDocuments: boolean
  /** how quickly peers see changes */
  latency: 'instant' | 'seconds' | 'minutes' | 'none'
  scope: 'this browser' | 'same Google Drive' | 'anywhere'
  /* ---- Phase 8: CRDT-era capabilities ---- */
  /** granular CRDT board operations (not full-board rebroadcast) */
  boardRealtime: boolean
  /** rich documents merge through Yjs (no last-writer-wins) */
  documentCRDT: boolean
  /** code files merge through Yjs */
  codeCRDT: boolean
  /** comments/areas appear on peers without polling */
  commentsRealtime: boolean
  /** the backend independently rejects unauthorized operations */
  serverPermissions: boolean
  /** offline edits are queued and deterministically merged on reconnect */
  offlineRecovery: boolean
}

/* ---------------- realtime connection state (Phase 8) ---------------- */

export type RealtimeStatus =
  | 'unconfigured' // no realtime backend in this build — honest setup state
  | 'no-account' // backend configured but user is not signed in with Google
  | 'inactive' // configured but not currently attached to a project room
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'unauthorized' // server rejected this user for the project room
  | 'error'

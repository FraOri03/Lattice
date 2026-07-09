import type { Board, BoardNode } from '@/types/model'
import type {
  ActivityEvent,
  CommentThread,
  ProjectInvite,
  ProjectMember,
  VersionEntry,
} from '@/types/collab'

/**
 * ConflictResolverV2 (Phase 7) — merge logic for multi-writer data.
 *
 * V1 (lib/sync/ConflictResolver) resolves whole entities newest-wins.
 * V2 adds structure-aware merging for the data collaboration introduces:
 *
 *  - collab state (members/invites/comments/activity/versions): set-union
 *    by id, newest-updatedAt wins per record — two writers editing
 *    DIFFERENT records never lose anything
 *  - boards: node-level merge instead of whole-board LWW, so two people
 *    moving different cards both keep their change
 *
 * True operational transforms / CRDT text merging need the realtime
 * backend (Phase 8); this module is deliberately conservative and never
 * drops a record it cannot merge.
 */

/* ---------------- generic record merging ---------------- */

interface Stamped {
  updatedAt: number
}

/** Union two lists by key; when both have a record, newest updatedAt wins. */
export function mergeByKey<T extends Stamped>(
  local: T[],
  remote: T[],
  keyOf: (t: T) => string,
): T[] {
  const map = new Map<string, T>()
  for (const r of local) map.set(keyOf(r), r)
  for (const r of remote) {
    const existing = map.get(keyOf(r))
    if (!existing || r.updatedAt > existing.updatedAt) map.set(keyOf(r), r)
  }
  return [...map.values()]
}

export function mergeMembers(local: ProjectMember[], remote: ProjectMember[]) {
  return mergeByKey(local, remote, (m) => m.userId)
}

export function mergeInvites(local: ProjectInvite[], remote: ProjectInvite[]) {
  return mergeByKey(local, remote, (i) => i.id)
}

export function mergeComments(local: CommentThread[], remote: CommentThread[]) {
  // thread-level LWW, but replies are unioned so a reply written on one
  // device is never lost to a resolve toggled on another
  const merged = mergeByKey(local, remote, (c) => c.id)
  const localById = new Map(local.map((c) => [c.id, c]))
  const remoteById = new Map(remote.map((c) => [c.id, c]))
  return merged.map((thread) => {
    const a = localById.get(thread.id)
    const b = remoteById.get(thread.id)
    if (!a || !b) return thread
    const replies = mergeByKey(a.replies, b.replies, (r) => r.id).sort(
      (x, y) => x.createdAt - y.createdAt,
    )
    return { ...thread, replies }
  })
}

export function mergeActivity(
  local: ActivityEvent[],
  remote: ActivityEvent[],
  cap = 500,
): ActivityEvent[] {
  const map = new Map<string, ActivityEvent>()
  for (const e of [...local, ...remote]) map.set(e.id, e)
  return [...map.values()].sort((a, b) => b.at - a.at).slice(0, cap)
}

export function mergeVersions(local: VersionEntry[], remote: VersionEntry[]) {
  const map = new Map<string, VersionEntry>()
  for (const v of [...local, ...remote]) map.set(v.id, v)
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt)
}

/** One project's durable collab state, as exchanged between providers. */
export interface CollabStateSlice {
  members: ProjectMember[]
  invites: ProjectInvite[]
  comments: CommentThread[]
  activity: ActivityEvent[]
  versions: VersionEntry[]
}

export function mergeCollabState(
  local: CollabStateSlice,
  remote: Partial<CollabStateSlice>,
): CollabStateSlice {
  return {
    members: mergeMembers(local.members, remote.members ?? []),
    invites: mergeInvites(local.invites, remote.invites ?? []),
    comments: mergeComments(local.comments, remote.comments ?? []),
    activity: mergeActivity(local.activity, remote.activity ?? []),
    versions: mergeVersions(local.versions, remote.versions ?? []),
  }
}

/* ---------------- board merging ---------------- */

/**
 * Node-level board merge. `stampOf` reads a per-node modification stamp
 * (kept in node.data.__movedAt by RealtimeBoardSync); nodes without a
 * stamp fall back to `preferLocal`.
 *
 *  - nodes present on both sides: newer stamp wins
 *  - nodes present on one side only: kept (deletions propagate through
 *    explicit board ops, never through snapshot merges)
 *  - edges: union by id
 */
export function mergeBoards(local: Board, remote: Board): Board {
  const stampOf = (n: BoardNode) => (n.data.__movedAt as number | undefined) ?? 0
  const nodes = new Map<string, BoardNode>()
  for (const n of local.nodes) nodes.set(n.id, n)
  for (const n of remote.nodes) {
    const mine = nodes.get(n.id)
    if (!mine || stampOf(n) > stampOf(mine)) nodes.set(n.id, n)
  }
  const edges = new Map(local.edges.map((e) => [e.id, e]))
  for (const e of remote.edges) if (!edges.has(e.id)) edges.set(e.id, e)
  return { ...local, nodes: [...nodes.values()], edges: [...edges.values()] }
}

/**
 * Version check for incoming document updates: apply only when the remote
 * copy is strictly newer than what we already have — protects against
 * out-of-order polling results overwriting fresher local work.
 */
export function shouldApplyRemote(
  localUpdatedAt: number | undefined,
  remoteUpdatedAt: number,
): boolean {
  return remoteUpdatedAt > (localUpdatedAt ?? 0)
}

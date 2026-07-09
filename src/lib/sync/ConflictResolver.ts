import type { SyncConflict } from '@/types/model'

/**
 * ConflictResolver — decides what happens when the same entity changed
 * both locally and remotely since the last sync.
 *
 * Phase 6 policy (single-user, multi-device):
 *  - newest updatedAt wins ("last writer wins")
 *  - the losing version is never destroyed: when remote wins, the local
 *    body is uploaded to Drive as a .conflict-<ts> backup first; when
 *    local wins, Drive's own revision history retains the remote version
 *  - every decision is surfaced in the sync status UI
 *
 * Phase 7 will replace this with real multi-writer merging (CRDT or
 * operation log) — this module is the seam where that lands.
 */

export interface VersionedEntity {
  id: string
  title?: string
  updatedAt: number
}

export type Resolution = 'local' | 'remote' | 'none'

/**
 * Compare a local and remote copy of the same entity.
 *  - 'none'   → nothing to do (same timestamp)
 *  - 'local'  → local copy should overwrite remote
 *  - 'remote' → remote copy should overwrite local
 */
export function resolveVersions(
  local: VersionedEntity | undefined,
  remote: VersionedEntity | undefined,
): Resolution {
  if (!local && !remote) return 'none'
  if (!local) return 'remote'
  if (!remote) return 'local'
  if (local.updatedAt === remote.updatedAt) return 'none'
  return local.updatedAt > remote.updatedAt ? 'local' : 'remote'
}

/**
 * True when BOTH sides changed since the last successful sync — a real
 * conflict rather than a plain fast-forward.
 */
export function isConflict(
  local: VersionedEntity | undefined,
  remote: VersionedEntity | undefined,
  lastSyncAt: number | null,
): boolean {
  if (!local || !remote || lastSyncAt === null) return false
  return local.updatedAt > lastSyncAt && remote.updatedAt > lastSyncAt
}

export function describeConflict(
  kind: string,
  local: VersionedEntity,
  remote: VersionedEntity,
  resolution: 'local' | 'remote',
): SyncConflict {
  return {
    key: `${kind}:${local.id}`,
    title: local.title ?? local.id,
    localUpdatedAt: local.updatedAt,
    remoteUpdatedAt: remote.updatedAt,
    resolution,
  }
}

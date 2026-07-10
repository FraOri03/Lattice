import * as Y from 'yjs'
import { storage } from '@/lib/storage/StorageProvider'
import type { ProjectRoom, RoomDocKind } from './ProjectRoom'

/**
 * CRDTPersistenceAdapter — explicit, restorable CRDT snapshots.
 *
 * Persistence roles in Phase 8 (each layer does one job):
 *  - realtime backend  → active shared state (Liveblocks Yjs storage)
 *  - y-indexeddb       → local update cache: offline edits, instant loads
 *  - THIS adapter      → binary Y.Doc snapshots in the StorageProvider,
 *    used by Version History 2.0 (restorable states) and as migration
 *    backups taken before any destructive document transformation
 *  - Google Drive      → durable JSON bodies + assets (unchanged paths)
 *
 * Snapshots are full state updates (Y.encodeStateAsUpdate): applying one
 * to an empty doc reproduces the exact state; applying it to a live doc
 * merges losslessly — safe in both restore directions.
 */

const snapshotKey = (projectId: string, kind: RoomDocKind, label: string) =>
  `crdt-snap:${projectId}:${kind}:${label}`

/** Encode the current state of one of the room's docs. */
export function encodeRoomState(room: ProjectRoom, kind: RoomDocKind): Uint8Array {
  return Y.encodeStateAsUpdate(room.doc(kind))
}

/** Store a labelled snapshot (e.g. 'pre-migration', a version id…). */
export async function saveRoomSnapshot(
  room: ProjectRoom,
  kind: RoomDocKind,
  label: string,
): Promise<string> {
  const key = snapshotKey(room.projectId, kind, label)
  const update = encodeRoomState(room, kind)
  const buffer = new ArrayBuffer(update.byteLength)
  new Uint8Array(buffer).set(update)
  await storage.putBlob(key, new Blob([buffer], { type: 'application/octet-stream' }))
  return key
}

/** Load a snapshot's raw update bytes; undefined when missing. */
export async function loadRoomSnapshot(key: string): Promise<Uint8Array | undefined> {
  const blob = await storage.getBlob(key)
  if (!blob) return undefined
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Merge a snapshot back into a live doc. Yjs merges deterministically;
 * content produced after the snapshot is preserved (CRDT semantics), so
 * "restore" for CRDTs means re-adding what was removed rather than
 * rewinding time — version history handles hard restores at the JSON
 * body level where true rollback is expected.
 */
export function applySnapshot(
  room: ProjectRoom,
  kind: RoomDocKind,
  update: Uint8Array,
  origin: unknown,
): void {
  Y.applyUpdate(room.doc(kind), update, origin)
}

export async function deleteRoomSnapshot(key: string): Promise<void> {
  await storage.deleteBlob(key)
}

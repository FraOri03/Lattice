import { useCrdtStore } from './crdtStore'
import { BC_ORIGIN, type ProjectRoom } from './ProjectRoom'

/**
 * OfflineUpdateQueue — honest bookkeeping of local CRDT updates that have
 * not reached the realtime backend yet.
 *
 * The updates themselves are already durable: y-indexeddb stores every
 * update locally, and Yjs replays/merges them deterministically when the
 * provider reconnects (state-vector sync). What this class adds is the
 * *visible* part: a counter the UI can show ("3 offline changes pending")
 * and a reset when the backend confirms sync — so users can trust what
 * the sync indicator says instead of hoping.
 *
 * Local vs remote: local edits come from editor bindings (y-prosemirror,
 * y-monaco) or our own transactions; remote updates carry an origin that
 * was explicitly registered (BroadcastChannel relay, IndexedDB replay,
 * the realtime provider). Anything not registered counts as local work.
 */
export class OfflineUpdateQueue {
  private detachFns: (() => void)[] = []
  /** origins whose updates are NOT local pending work */
  private remoteOrigins = new Set<unknown>([BC_ORIGIN])
  /** true while a realtime provider is attached AND synced */
  private synced = false
  /** true while a realtime backend is attached at all */
  private attached = false

  track(room: ProjectRoom): void {
    this.untrack()
    for (const doc of [room.content, room.collab]) {
      const handler = (_update: Uint8Array, origin: unknown) => {
        if (this.remoteOrigins.has(origin)) return
        if (this.attached && this.synced) return // shipped immediately
        useCrdtStore.getState().bumpPendingUpdates()
      }
      doc.on('update', handler)
      this.detachFns.push(() => doc.off('update', handler))
    }
  }

  untrack(): void {
    for (const f of this.detachFns) f()
    this.detachFns = []
    useCrdtStore.getState().setPendingUpdates(0)
  }

  /** Register an origin (provider/persistence instance) as non-local. */
  addRemoteOrigin(origin: unknown): void {
    if (origin != null) this.remoteOrigins.add(origin)
  }

  setAttached(attached: boolean): void {
    this.attached = attached
    if (!attached) this.synced = false
  }

  /** Called when the realtime provider reports a completed sync. */
  markSynced(): void {
    this.synced = true
    useCrdtStore.getState().markSynced()
  }

  markUnsynced(): void {
    this.synced = false
  }
}

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'

/**
 * ProjectRoom — the CRDT state of one project.
 *
 * Two Y.Docs per project, mirroring the two-permission-tier room design
 * (see src/lib/collab/roleAccess.ts):
 *
 *  content doc               collab doc
 *  ├─ projectMetadata: Y.Map ├─ comments:    Y.Map (threads + areas)
 *  ├─ documents:  Y.Map      ├─ collabState: Y.Map (members/invites/…)
 *  │   docId → Y.XmlFragment └─ inbox:       Y.Map (per-user notifications)
 *  ├─ codeDocuments: Y.Map
 *  │   codeId → Y.Text
 *  ├─ spreadsheets: Y.Map
 *  └─ boards: Y.Map
 *      boardId → Y.Map { name, nodes: Y.Map, edges: Y.Map }
 *
 * Persistence layers (each honest about its role):
 *  - y-indexeddb: local update cache — offline editing + instant loads.
 *  - BroadcastChannel relay (below): keystroke-level CRDT sync across
 *    tabs of THIS browser, no backend needed.
 *  - Liveblocks provider (attached by YjsManager when configured):
 *    cross-device realtime + server-side permission enforcement.
 *  - Google Drive: continues to hold durable JSON snapshots via the
 *    existing SyncEngine — the CRDT layer feeds it through the same
 *    persistDocContent/persistCodeContent paths as before.
 *
 * A room per project keeps permissions simple (they are per-project) and
 * loading bounded; if a single project ever grows past that, the maps are
 * ready to be split into independently loaded subdocuments.
 */

export type RoomDocKind = 'content' | 'collab'

/** Origin marker for transactions produced by local UI actions. */
export const LOCAL_ORIGIN = 'lattice:local'
/** Origin marker for updates applied from another tab (BroadcastChannel). */
export const BC_ORIGIN = 'lattice:bc'
/** Origin marker for CRDT migrations (seeding from stored JSON bodies). */
export const MIGRATION_ORIGIN = 'lattice:migration'

/**
 * Cross-tab Yjs relay over BroadcastChannel: a ~80-line y-websocket.
 * Protocol: on join each tab broadcasts its state vector (s1); peers
 * answer with the missing diff (s2) and their own vector once; live
 * updates fan out as they happen. Everything is idempotent — Yjs drops
 * duplicate updates — so no handshake bookkeeping is needed.
 */
class BroadcastDocRelay {
  private channel: BroadcastChannel | null = null
  private readonly onUpdate: (update: Uint8Array, origin: unknown) => void

  constructor(
    private readonly doc: Y.Doc,
    channelName: string,
  ) {
    this.onUpdate = (update, origin) => {
      if (origin === BC_ORIGIN) return // don't echo what we just applied
      this.post({ t: 'u', d: update })
    }
    if (typeof BroadcastChannel === 'undefined') return
    this.channel = new BroadcastChannel(channelName)
    this.channel.onmessage = (e) => this.receive(e.data)
    this.doc.on('update', this.onUpdate)
    // announce our state so peers send what we miss (and vice versa)
    this.post({ t: 's1', sv: Y.encodeStateVector(this.doc), reply: true })
  }

  private post(msg: Record<string, unknown>): void {
    try {
      this.channel?.postMessage(msg)
    } catch {
      // channel closed or payload not cloneable — never crash the app
    }
  }

  private receive(msg: {
    t: 's1' | 's2' | 'u'
    sv?: Uint8Array
    d?: Uint8Array
    reply?: boolean
  }): void {
    switch (msg.t) {
      case 's1': {
        if (!msg.sv) return
        const diff = Y.encodeStateAsUpdate(this.doc, msg.sv)
        if (diff.length > 2) this.post({ t: 's2', d: diff })
        // answer once with our own vector so sync converges both ways
        if (msg.reply)
          this.post({ t: 's1', sv: Y.encodeStateVector(this.doc), reply: false })
        break
      }
      case 's2':
      case 'u': {
        if (msg.d) Y.applyUpdate(this.doc, msg.d, BC_ORIGIN)
        break
      }
    }
  }

  destroy(): void {
    this.doc.off('update', this.onUpdate)
    this.channel?.close()
    this.channel = null
  }
}

/**
 * Cross-tab awareness relay: carets/selections between tabs of the same
 * browser with no backend. Same pattern as BroadcastDocRelay — encode
 * awareness updates, fan them out, apply with a marker origin.
 */
class BroadcastAwarenessRelay {
  private channel: BroadcastChannel | null = null
  private readonly onUpdate: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => void

  constructor(
    private readonly awareness: Awareness,
    channelName: string,
  ) {
    this.onUpdate = ({ added, updated, removed }, origin) => {
      if (origin === BC_ORIGIN) return
      const changed = [...added, ...updated, ...removed]
      if (!changed.length) return
      this.post(encodeAwarenessUpdate(this.awareness, changed))
    }
    if (typeof BroadcastChannel === 'undefined') return
    this.channel = new BroadcastChannel(channelName)
    this.channel.onmessage = (e: MessageEvent<Uint8Array>) => {
      try {
        applyAwarenessUpdate(this.awareness, e.data, BC_ORIGIN)
      } catch {
        // malformed frame — ignore
      }
    }
    this.awareness.on('update', this.onUpdate)
  }

  private post(update: Uint8Array): void {
    try {
      this.channel?.postMessage(update)
    } catch {
      // channel closed — never crash the app
    }
  }

  destroy(): void {
    this.awareness.off('update', this.onUpdate)
    // tell peers our states are gone before closing
    removeAwarenessStates(
      this.awareness,
      [this.awareness.clientID],
      'destroy',
    )
    this.channel?.close()
    this.channel = null
  }
}

export class ProjectRoom {
  readonly projectId: string
  readonly content: Y.Doc
  readonly collab: Y.Doc
  /** resolves when both docs are loaded from IndexedDB */
  readonly loaded: Promise<void>

  private persistence: IndexeddbPersistence[] = []
  private relays: BroadcastDocRelay[] = []
  private awarenessInstances = new Map<RoomDocKind, Awareness>()
  private awarenessRelays: BroadcastAwarenessRelay[] = []
  private destroyed = false

  constructor(projectId: string) {
    this.projectId = projectId
    this.content = new Y.Doc({ guid: `lattice-content-${projectId}` })
    this.collab = new Y.Doc({ guid: `lattice-collab-${projectId}` })

    const loads: Promise<unknown>[] = []
    if (typeof indexedDB !== 'undefined') {
      for (const [kind, doc] of [
        ['content', this.content],
        ['collab', this.collab],
      ] as const) {
        const p = new IndexeddbPersistence(`lattice-yjs-${projectId}-${kind}`, doc)
        this.persistence.push(p)
        loads.push(p.whenSynced)
      }
    }
    this.loaded = Promise.all(loads).then(() => {
      if (this.destroyed) return
      // relays start after local load so the first state vector is real
      this.relays.push(
        new BroadcastDocRelay(this.content, `lattice-yjs:${projectId}:content`),
        new BroadcastDocRelay(this.collab, `lattice-yjs:${projectId}:collab`),
      )
    })
  }

  doc(kind: RoomDocKind): Y.Doc {
    return kind === 'content' ? this.content : this.collab
  }

  /** IndexedDB replay transactions carry these instances as origin. */
  persistenceOrigins(): unknown[] {
    return [...this.persistence]
  }

  /**
   * Local (cross-tab) awareness for editor carets/selections when no
   * realtime backend is attached. With Liveblocks attached, editors use
   * the provider's awareness instead (see YjsManager.contentAwareness).
   */
  localAwareness(kind: RoomDocKind): Awareness {
    let aw = this.awarenessInstances.get(kind)
    if (!aw) {
      aw = new Awareness(this.doc(kind))
      this.awarenessInstances.set(kind, aw)
      this.awarenessRelays.push(
        new BroadcastAwarenessRelay(aw, `lattice-yaw:${this.projectId}:${kind}`),
      )
    }
    return aw
  }

  /* ---------------- content maps ---------------- */

  projectMetadata(): Y.Map<unknown> {
    return this.content.getMap('projectMetadata')
  }

  /** docId → Y.XmlFragment (rich documents) */
  documents(): Y.Map<Y.XmlFragment> {
    return this.content.getMap('documents')
  }

  /** codeId → Y.Text (code documents) */
  codeDocuments(): Y.Map<Y.Text> {
    return this.content.getMap('codeDocuments')
  }

  /** sheetId → last-writer-wins JSON body (cell-level CRDT is future work) */
  spreadsheets(): Y.Map<unknown> {
    return this.content.getMap('spreadsheets')
  }

  /** boardId → Y.Map { name, nodes: Y.Map, edges: Y.Map } */
  boards(): Y.Map<Y.Map<unknown>> {
    return this.content.getMap('boards')
  }

  /* ---------------- collab maps ---------------- */

  /** threadId → CommentThread JSON (point pins and area comments) */
  comments(): Y.Map<unknown> {
    return this.collab.getMap('comments')
  }

  /** slice name → durable collab state JSON (members/invites/activity/versions) */
  collabState(): Y.Map<unknown> {
    return this.collab.getMap('collabState')
  }

  /** userId → Y.Array of notification JSON records */
  inbox(): Y.Map<unknown> {
    return this.collab.getMap('inbox')
  }

  /* ---------------- transactions ---------------- */

  /** Run local mutations on the content doc with the local origin marker. */
  transactContent(fn: () => void): void {
    this.content.transact(fn, LOCAL_ORIGIN)
  }

  /** Run local mutations on the collab doc with the local origin marker. */
  transactCollab(fn: () => void): void {
    this.collab.transact(fn, LOCAL_ORIGIN)
  }

  destroy(): void {
    this.destroyed = true
    for (const r of this.awarenessRelays) r.destroy()
    this.awarenessRelays = []
    for (const aw of this.awarenessInstances.values()) aw.destroy()
    this.awarenessInstances.clear()
    for (const r of this.relays) r.destroy()
    this.relays = []
    for (const p of this.persistence) void p.destroy()
    this.persistence = []
    this.content.destroy()
    this.collab.destroy()
  }
}

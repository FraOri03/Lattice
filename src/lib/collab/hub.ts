import type { CollabMessage, CollabMessageType } from '@/types/collab'
import { useStore } from '@/store/useStore'
import { yjsManager } from '@/lib/crdt/YjsManager'
import { LOCAL_ORIGIN } from '@/lib/crdt/ProjectRoom'
import { useCollabStore } from './collabStore'
import {
  LocalCollaborationProvider,
  RealtimeCollaborationProvider,
  SESSION_ID,
  type CollaborationProvider,
} from './CollaborationProvider'
import { DrivePollingCollaborationProvider } from './DrivePollingCollaborationProvider'
import { mergeCollabState, type CollabStateSlice } from './ConflictResolverV2'

/**
 * CollabHub — routes collaboration traffic between the app services and
 * whatever providers are available in this session.
 *
 *  services ──send──▶ hub ──▶ every running provider
 *  provider ──recv──▶ hub ──▶ subscribed handlers (presence, board sync…)
 *
 * The 'collab-state' channel is handled by the hub itself: incoming
 * durable state is merged (ConflictResolverV2) into the collab store, so
 * every transport — BroadcastChannel or Drive polling — converges through
 * one code path.
 */

type Handler = (msg: CollabMessage) => void

class CollabHub {
  private providers: CollaborationProvider[] = []
  private handlers = new Map<CollabMessageType, Set<Handler>>()
  private started = false
  private offCrdtState: (() => void) | null = null
  private offProjectSwitch: (() => void) | null = null
  /** last JSON written to / read from the CRDT map, to break echo loops */
  private lastCrdtStateJson = new Map<string, string>()

  start(): void {
    if (this.started) return
    this.started = true

    const drive = new DrivePollingCollaborationProvider()
    drive.getLocalState = (projectId) => this.localState(projectId)

    const candidates: CollaborationProvider[] = [
      new LocalCollaborationProvider(),
      drive,
      new RealtimeCollaborationProvider(),
    ]
    this.providers = candidates.filter((p) => p.isAvailable())
    for (const p of this.providers) p.start((msg) => this.dispatch(msg))

    // durable-state merging lives in the hub
    this.on('collab-state', (msg) => this.applyRemoteState(msg))

    // CRDT durability: the active project's collab doc mirrors the
    // durable slices (members/invites/comments/activity/versions), so
    // they reach peers that were offline during the broadcast — and sync
    // across devices whenever the realtime backend is attached.
    this.bindCrdtState(useStore.getState().activeProjectId)
    this.offProjectSwitch = useStore.subscribe((state, prev) => {
      if (state.activeProjectId !== prev.activeProjectId) {
        this.bindCrdtState(state.activeProjectId)
      }
    })
  }

  stop(): void {
    for (const p of this.providers) p.stop()
    this.providers = []
    this.handlers.clear()
    this.offCrdtState?.()
    this.offCrdtState = null
    this.offProjectSwitch?.()
    this.offProjectSwitch = null
    this.lastCrdtStateJson.clear()
    this.started = false
  }

  private bindCrdtState(projectId: string): void {
    this.offCrdtState?.()
    this.offCrdtState = null
    const room = yjsManager.room(projectId)
    void room.loaded.then(() => {
      if (!this.started) return
      const map = room.collabState()
      const handler = (
        _events: unknown,
        tx: { origin: unknown },
      ) => {
        if (tx.origin === LOCAL_ORIGIN) return
        const raw = map.get('state')
        if (typeof raw !== 'string') return
        if (this.lastCrdtStateJson.get(projectId) === raw) return
        this.lastCrdtStateJson.set(projectId, raw)
        try {
          const payload = JSON.parse(raw) as CollabStateSlice
          this.applyRemoteState({
            type: 'collab-state',
            projectId,
            senderId: `crdt:${SESSION_ID}`,
            at: Date.now(),
            payload,
          })
        } catch {
          // malformed state — ignore
        }
      }
      map.observe(handler as Parameters<typeof map.observe>[0])
      this.offCrdtState = () => map.unobserve(handler as Parameters<typeof map.observe>[0])
      // adopt state that synced while we were away
      handler(undefined, { origin: null })
    })
  }

  /** Mirror the merged local state into the project's collab CRDT doc. */
  private writeCrdtState(projectId: string): void {
    const room = yjsManager.room(projectId)
    const json = JSON.stringify(this.localState(projectId))
    if (this.lastCrdtStateJson.get(projectId) === json) return
    this.lastCrdtStateJson.set(projectId, json)
    room.transactCollab(() => room.collabState().set('state', json))
  }

  /** Providers currently running (settings UI shows their capabilities). */
  activeProviders(): CollaborationProvider[] {
    return this.providers
  }

  on(type: CollabMessageType, handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(handler)
    return () => this.handlers.get(type)?.delete(handler)
  }

  send(type: CollabMessageType, projectId: string, payload: unknown): void {
    const msg: CollabMessage = {
      type,
      projectId,
      senderId: SESSION_ID,
      at: Date.now(),
      payload,
    }
    for (const p of this.providers) p.send(msg)
  }

  private dispatch(msg: CollabMessage): void {
    const set = this.handlers.get(msg.type)
    if (!set) return
    for (const h of set) {
      try {
        h(msg)
      } catch (err) {
        console.error('[collab] handler failed', msg.type, err)
      }
    }
  }

  /* ---------------- durable state ---------------- */

  private localState(projectId: string): CollabStateSlice {
    const s = useCollabStore.getState()
    return {
      members: s.members[projectId] ?? [],
      invites: s.invites[projectId] ?? [],
      comments: s.comments[projectId] ?? [],
      activity: s.activity[projectId] ?? [],
      versions: s.versions[projectId] ?? [],
    }
  }

  /**
   * Called by every service after it mutates durable collab state:
   * fans the fresh state out to other tabs, mirrors it into the collab
   * CRDT doc (durable + cross-device) and marks Drive dirty.
   */
  broadcastState(projectId: string): void {
    this.send('collab-state', projectId, this.localState(projectId))
    this.writeCrdtState(projectId)
  }

  private applyRemoteState(msg: CollabMessage): void {
    const remote = msg.payload as Partial<CollabStateSlice> | null
    if (!remote) return
    const projectId = msg.projectId
    const merged = mergeCollabState(this.localState(projectId), remote)
    const s = useCollabStore.getState()
    s.setMembers(projectId, merged.members)
    s.setInvites(projectId, merged.invites)
    s.setComments(projectId, merged.comments)
    s.setActivity(projectId, merged.activity)
    s.setVersions(projectId, merged.versions)
    // push the merged superset back to the CRDT: deterministic merging
    // makes this converge (identical json stops the echo) and peers that
    // only saw part of the state pick up the rest
    this.writeCrdtState(projectId)
  }
}

/** App-wide singleton; started once from App. */
export const collabHub = new CollabHub()

import type { CollabMessage, CollabMessageType } from '@/types/collab'
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
  }

  stop(): void {
    for (const p of this.providers) p.stop()
    this.providers = []
    this.handlers.clear()
    this.started = false
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
   * fans the fresh state out to other tabs and marks Drive dirty.
   */
  broadcastState(projectId: string): void {
    this.send('collab-state', projectId, this.localState(projectId))
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
  }
}

/** App-wide singleton; started once from App. */
export const collabHub = new CollabHub()

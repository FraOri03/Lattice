import type { CollabMessage, CollabRole, PresencePeer, RealtimeStatus } from '@/types/collab'
import { authService } from '@/lib/auth/AuthService'
import { hasRealtimeBackend } from '@/lib/env'
import { useStore } from '@/store/useStore'
import { useCrdtStore } from './crdtStore'
import { OfflineUpdateQueue } from './OfflineUpdateQueue'
import { ProjectRoom } from './ProjectRoom'

/**
 * YjsManager — owns every ProjectRoom (CRDT state per project) and the
 * optional realtime attachment for the active one.
 *
 * Always on, even with no backend: rooms load from IndexedDB and relay
 * across tabs, so CRDT editing works offline and browser-locally out of
 * the box. When VITE_REALTIME_BACKEND=liveblocks AND the user is signed
 * in with Google, the active project's room additionally attaches to the
 * realtime backend (lazy-loaded chunk — see ./liveblocks.ts).
 *
 * The CollabMessage bus (presence, locks, durable-state fan-out) rides on
 * the same attachment; RealtimeCollaborationProvider delegates here so
 * the Phase 7 provider architecture stays intact.
 */

/** What a realtime transport must provide (implemented by ./liveblocks.ts). */
export interface RealtimeAttachment {
  send(msg: CollabMessage): void
  updatePresence(peer: PresencePeer): void
  /**
   * Awareness instance for editor carets/selections on the content doc
   * (y-prosemirror / y-monaco compatible).
   */
  contentAwareness(): unknown
  detach(): void
}

export interface AttachmentCallbacks {
  onMessage(msg: CollabMessage): void
  onStatus(status: RealtimeStatus, detail?: string | null): void
  onServerRole(role: CollabRole | null): void
  onSynced(): void
  onUnsynced(): void
  registerRemoteOrigin(origin: unknown): void
}

class YjsManager {
  private rooms = new Map<string, ProjectRoom>()
  private activeProjectId: string | null = null
  private attachment: RealtimeAttachment | null = null
  private attachSeq = 0
  private unsubscribeStore: (() => void) | null = null
  private messageHandler: ((msg: CollabMessage) => void) | null = null
  private queue = new OfflineUpdateQueue()
  private started = false

  /** Get (or lazily create) the CRDT room of a project. */
  room(projectId: string): ProjectRoom {
    let room = this.rooms.get(projectId)
    if (!room) {
      room = new ProjectRoom(projectId)
      this.rooms.set(projectId, room)
      for (const origin of room.persistenceOrigins())
        this.queue.addRemoteOrigin(origin)
    }
    return room
  }

  /** The active project's room (always exists once started). */
  activeRoom(): ProjectRoom | null {
    return this.activeProjectId ? this.room(this.activeProjectId) : null
  }

  start(): void {
    if (this.started) return
    this.started = true
    const projectId = useStore.getState().activeProjectId
    void this.activate(projectId)
    this.unsubscribeStore = useStore.subscribe((state, prev) => {
      if (state.activeProjectId !== prev.activeProjectId) {
        void this.activate(state.activeProjectId)
      }
    })
  }

  stop(): void {
    this.started = false
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    this.detachRealtime()
    this.queue.untrack()
    this.activeProjectId = null
    // rooms stay cached: destroying them would drop unsaved editor bindings
  }

  /** Provider hook: deliver incoming realtime CollabMessages to the hub. */
  setMessageHandler(handler: ((msg: CollabMessage) => void) | null): void {
    this.messageHandler = handler
  }

  /** Provider hook: ship a CollabMessage over the realtime backend. */
  sendRealtime(msg: CollabMessage): void {
    this.attachment?.send(msg)
  }

  /** Presence heartbeats ride the realtime presence channel when attached. */
  sendPresence(peer: PresencePeer): void {
    this.attachment?.updatePresence(peer)
  }

  isAttached(): boolean {
    return this.attachment !== null
  }

  /**
   * The awareness source editors should bind carets/selections to:
   * the realtime provider's awareness when the project is attached,
   * otherwise the room's local cross-tab awareness.
   */
  contentAwareness(projectId: string): unknown {
    if (this.attachment && this.activeProjectId === projectId) {
      return this.attachment.contentAwareness()
    }
    return this.room(projectId).localAwareness('content')
  }

  private async activate(projectId: string): Promise<void> {
    if (this.activeProjectId === projectId && this.attachment) return
    this.detachRealtime()
    this.activeProjectId = projectId
    const room = this.room(projectId)
    this.queue.track(room)
    useCrdtStore.getState().setAttached(null)

    if (!hasRealtimeBackend) {
      useCrdtStore
        .getState()
        .setStatus('unconfigured', 'No realtime backend is configured in this build.')
      return
    }
    if (authService.kind !== 'google' || !authService.restore()) {
      useCrdtStore
        .getState()
        .setStatus(
          'no-account',
          'Sign in with Google to connect realtime collaboration.',
        )
      return
    }

    const seq = ++this.attachSeq
    useCrdtStore.getState().setStatus('connecting')
    try {
      const { attachLiveblocks } = await import('./liveblocks')
      const callbacks: AttachmentCallbacks = {
        onMessage: (msg) => this.messageHandler?.(msg),
        onStatus: (status, detail) => {
          if (seq === this.attachSeq)
            useCrdtStore.getState().setStatus(status, detail ?? null)
        },
        onServerRole: (role) => {
          if (seq === this.attachSeq) useCrdtStore.getState().setServerRole(role)
        },
        onSynced: () => {
          if (seq === this.attachSeq) this.queue.markSynced()
        },
        onUnsynced: () => {
          if (seq === this.attachSeq) this.queue.markUnsynced()
        },
        registerRemoteOrigin: (origin) => this.queue.addRemoteOrigin(origin),
      }
      const attachment = await attachLiveblocks(room, callbacks)
      // the project may have changed while we were connecting
      if (seq !== this.attachSeq || this.activeProjectId !== projectId) {
        attachment.detach()
        return
      }
      this.attachment = attachment
      this.queue.setAttached(true)
      useCrdtStore.getState().setAttached(projectId)
    } catch (err) {
      if (seq !== this.attachSeq) return
      const message = err instanceof Error ? err.message : String(err)
      const status: RealtimeStatus = /not a member|unauthorized|403/i.test(message)
        ? 'unauthorized'
        : 'error'
      useCrdtStore.getState().setStatus(status, message)
      console.warn('[crdt] realtime attach failed:', message)
    }
  }

  private detachRealtime(): void {
    this.attachSeq++
    this.attachment?.detach()
    this.attachment = null
    this.queue.setAttached(false)
    useCrdtStore.getState().setAttached(null)
    useCrdtStore.getState().setServerRole(null)
    if (hasRealtimeBackend) useCrdtStore.getState().setStatus('inactive')
  }
}

/** App-wide singleton; started from App alongside the collab hub. */
export const yjsManager = new YjsManager()

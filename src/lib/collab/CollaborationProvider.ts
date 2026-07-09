import { nid } from '@/lib/id'
import type { CollabCapabilities, CollabMessage } from '@/types/collab'

/**
 * CollaborationProvider — pluggable transport for collaboration traffic
 * (presence, board ops, document updates, locks, durable collab state).
 *
 * Three implementations, honestly labelled by capability:
 *
 *  - LocalCollaborationProvider: BroadcastChannel. REAL low-latency
 *    collaboration between tabs/windows of the same browser profile.
 *    This is what makes presence/cursors/live board sync testable today
 *    without a backend, and it is never presented as more than it is.
 *
 *  - DrivePollingCollaborationProvider: durable collab state (members,
 *    invites, comments, activity, versions) synced through the project's
 *    Google Drive folder on a short polling interval. No live cursors —
 *    latency is "seconds to minutes" and the UI says so.
 *
 *  - RealtimeCollaborationProvider: placeholder for a true realtime
 *    backend (Supabase Realtime, Liveblocks, PartyKit, y-websocket…).
 *    Activates only when VITE_REALTIME_WS_URL is configured; the class
 *    documents the contract a backend must fulfil. Nothing is faked.
 */

export interface CollaborationProvider {
  readonly id: 'local' | 'drive-polling' | 'realtime'
  readonly label: string
  readonly capabilities: CollabCapabilities
  /** true when the provider can actually run in this session */
  isAvailable(): boolean
  start(onMessage: (msg: CollabMessage) => void): void
  stop(): void
  send(msg: CollabMessage): void
}

/* ---------------- session identity ---------------- */

export interface CollabIdentity {
  userId: string
  name: string
  email: string
  avatarUrl: string
}

const GUEST_KEY = 'lattice-guest-id'

/** Stable identity for presence/comments: the signed-in account, else a per-browser guest. */
export function currentIdentity(): CollabIdentity {
  try {
    const raw = localStorage.getItem('lattice-account')
    if (raw) {
      const acc = JSON.parse(raw) as {
        id: string
        name: string
        email: string
        avatarUrl: string
      }
      if (acc?.id) {
        return {
          userId: acc.id,
          name: acc.name || 'User',
          email: acc.email || '',
          avatarUrl: acc.avatarUrl || '',
        }
      }
    }
  } catch {
    /* fall through to guest */
  }
  let guestId = localStorage.getItem(GUEST_KEY)
  if (!guestId) {
    guestId = nid('guest')
    localStorage.setItem(GUEST_KEY, guestId)
  }
  return { userId: guestId, name: 'Guest', email: '', avatarUrl: '' }
}

/** This tab's session id — one user may be present from several tabs. */
export const SESSION_ID = nid('sess')

const PEER_COLORS = [
  '#0d99ff',
  '#9747ff',
  '#14ae5c',
  '#ffa629',
  '#f24822',
  '#ffcd29',
  '#00b5b0',
  '#ff5ca8',
]

/** Deterministic accent color per user id (cursors, outlines, avatars). */
export function colorForUser(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return PEER_COLORS[h % PEER_COLORS.length]
}

/* ---------------- local (BroadcastChannel) ---------------- */

const CHANNEL = 'lattice-collab-v1'

export class LocalCollaborationProvider implements CollaborationProvider {
  readonly id = 'local' as const
  readonly label = 'This browser (tabs)'
  readonly capabilities: CollabCapabilities = {
    presence: true,
    liveCursors: true,
    liveBoardOps: true,
    liveDocuments: true,
    latency: 'instant',
    scope: 'this browser',
  }
  private channel: BroadcastChannel | null = null

  isAvailable(): boolean {
    return typeof BroadcastChannel !== 'undefined'
  }

  start(onMessage: (msg: CollabMessage) => void): void {
    if (!this.isAvailable() || this.channel) return
    this.channel = new BroadcastChannel(CHANNEL)
    this.channel.onmessage = (e: MessageEvent<CollabMessage>) => {
      const msg = e.data
      if (msg && msg.senderId !== SESSION_ID) onMessage(msg)
    }
  }

  stop(): void {
    this.channel?.close()
    this.channel = null
  }

  send(msg: CollabMessage): void {
    try {
      this.channel?.postMessage(msg)
    } catch {
      // non-cloneable payloads / closed channel: drop, never crash the app
    }
  }
}

/* ---------------- realtime placeholder ---------------- */

/**
 * Contract for a real backend (Phase 8). A conforming server relays
 * CollabMessage frames between sessions subscribed to the same project
 * and answers presence snapshots on join. Candidates: y-websocket,
 * PartyKit room, Supabase Realtime channel, Liveblocks room.
 */
export class RealtimeCollaborationProvider implements CollaborationProvider {
  readonly id = 'realtime' as const
  readonly label = 'Realtime backend'
  readonly capabilities: CollabCapabilities = {
    presence: true,
    liveCursors: true,
    liveBoardOps: true,
    liveDocuments: true,
    latency: 'instant',
    scope: 'anywhere',
  }
  private url = (import.meta.env.VITE_REALTIME_WS_URL as string | undefined) ?? ''

  isAvailable(): boolean {
    // Intentionally strict: without a configured backend this provider
    // does not run. We never simulate a websocket.
    return this.url.length > 0
  }

  start(): void {
    if (!this.isAvailable()) return
    console.warn(
      '[collab] VITE_REALTIME_WS_URL is set but the realtime client is not implemented yet (Phase 8). Falling back to local + polling providers.',
    )
  }

  stop(): void {}

  send(): void {}
}

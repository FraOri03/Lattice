import { nid } from '@/lib/id'
import type { CollabCapabilities, CollabMessage, PresencePeer } from '@/types/collab'
import { authService } from '@/lib/auth/AuthService'
import { hasRealtimeBackend } from '@/lib/env'
import { yjsManager } from '@/lib/crdt/YjsManager'

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
 *  - RealtimeCollaborationProvider: PRODUCTION realtime backend
 *    (Liveblocks + Yjs, Phase 8). Activates only when
 *    VITE_REALTIME_BACKEND=liveblocks is configured AND the user is
 *    signed in with Google; identity and per-project permissions are
 *    verified server-side (api/realtime/*) on every connection. When not
 *    configured, the UI shows an honest setup state — a remote
 *    connection is never simulated.
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
    // CRDT sync between tabs rides the BroadcastChannel Yjs relay
    boardRealtime: true,
    documentCRDT: true,
    codeCRDT: true,
    commentsRealtime: true,
    // there is no server in this transport — permissions are UI-only here
    serverPermissions: false,
    offlineRecovery: true,
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

/* ---------------- production realtime (Liveblocks + Yjs) ---------------- */

/**
 * Production realtime transport (Phase 8). The heavy lifting lives in
 * src/lib/crdt/ (YjsManager owns the rooms; ./liveblocks.ts is the
 * lazy-loaded SDK attachment). This class adapts that machinery to the
 * CollaborationProvider interface so CollabHub keeps routing exactly as
 * it did in Phase 7:
 *
 *  - presence heartbeats → Liveblocks presence (every role may send)
 *  - locks / durable collab-state / legacy frames → room broadcast events
 *  - documents / code / boards / comments → Yjs CRDT sync (not messages)
 *
 * isAvailable() is strict: a configured backend AND a signed-in Google
 * account. Anything less and the provider stays out of the hub while the
 * settings UI shows the honest setup state (crdtStore.status).
 */
export class RealtimeCollaborationProvider implements CollaborationProvider {
  readonly id = 'realtime' as const
  readonly label = 'Realtime backend (Liveblocks + Yjs)'
  readonly capabilities: CollabCapabilities = {
    presence: true,
    liveCursors: true,
    liveBoardOps: true,
    liveDocuments: true,
    latency: 'instant',
    scope: 'anywhere',
    boardRealtime: true,
    documentCRDT: true,
    codeCRDT: true,
    commentsRealtime: true,
    serverPermissions: true,
    offlineRecovery: true,
  }

  isAvailable(): boolean {
    // strict: configured backend + real Google account, nothing simulated
    return (
      hasRealtimeBackend && authService.kind === 'google' && authService.restore() !== null
    )
  }

  start(onMessage: (msg: CollabMessage) => void): void {
    if (!this.isAvailable()) return
    yjsManager.setMessageHandler(onMessage)
  }

  stop(): void {
    yjsManager.setMessageHandler(null)
  }

  send(msg: CollabMessage): void {
    if (msg.type === 'presence') {
      yjsManager.sendPresence(msg.payload as PresencePeer)
      return
    }
    yjsManager.sendRealtime(msg)
  }
}

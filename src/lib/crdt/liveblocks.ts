import { createClient, type Client } from '@liveblocks/client'
import { LiveblocksYjsProvider } from '@liveblocks/yjs'
import type { CollabMessage, CollabRole, PresencePeer } from '@/types/collab'
import { authService } from '@/lib/auth/AuthService'
import { env } from '@/lib/env'
import { SESSION_ID } from '@/lib/collab/CollaborationProvider'
import { collabRoomId, contentRoomId } from '@/lib/collab/roleAccess'
import type { AttachmentCallbacks, RealtimeAttachment } from './YjsManager'
import type { ProjectRoom } from './ProjectRoom'

/**
 * Liveblocks transport for a ProjectRoom — loaded lazily so the realtime
 * SDK never weighs down the base bundle.
 *
 * Two Liveblocks rooms per project (content + collab, see roleAccess.ts).
 * Both carry a Yjs doc via LiveblocksYjsProvider; the content room also
 * carries presence (every role may write presence) and the collab room
 * carries CollabMessage broadcast frames (locks, durable-state fan-out).
 *
 * Authentication is delegated to /api/realtime/auth: the client sends its
 * Google OAuth access token, the endpoint verifies it against Google and
 * the project's room ACL, and Liveblocks enforces the resulting scopes on
 * every websocket operation — a tampered client cannot exceed its role.
 */

let client: Client | null = null

function getClient(): Client {
  if (client) return client
  client = createClient({
    authEndpoint: async (roomId?: string) => {
      const googleToken = await authService.getAccessToken()
      if (!googleToken) {
        throw new Error('Sign in with Google to use realtime collaboration.')
      }
      const res = await fetch(env.realtimeAuthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomId, googleToken }),
      })
      const body = (await res.json().catch(() => null)) as
        | { token?: string; error?: string }
        | null
      if (!res.ok || !body?.token) {
        throw new Error(body?.error ?? `Realtime auth failed (HTTP ${res.status})`)
      }
      return { token: body.token }
    },
  })
  return client
}

/** Ask the server to create/refresh this project's rooms and report our role. */
async function ensureServerRooms(
  projectId: string,
  projectName: string,
): Promise<CollabRole> {
  const googleToken = await authService.getAccessToken()
  if (!googleToken) throw new Error('Sign in with Google to use realtime collaboration.')
  const res = await fetch(env.realtimeRoomsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ensure', projectId, projectName, googleToken }),
  })
  const body = (await res.json().catch(() => null)) as
    | { role?: CollabRole; error?: string }
    | null
  if (res.status === 403) {
    throw new Error(body?.error ?? 'You are not a member of this project (server check).')
  }
  if (!res.ok || !body?.role) {
    throw new Error(body?.error ?? `Realtime room setup failed (HTTP ${res.status})`)
  }
  return body.role
}

export async function attachLiveblocks(
  projectRoom: ProjectRoom,
  cb: AttachmentCallbacks,
): Promise<RealtimeAttachment> {
  const { projectId } = projectRoom
  const projectName = `Project ${projectId}`

  // 1. server-side room + ACL bootstrap (throws on 403/unconfigured)
  const role = await ensureServerRooms(projectId, projectName)
  cb.onServerRole(role)

  // 2. join both rooms
  const lb = getClient()
  const content = lb.enterRoom(contentRoomId(projectId))
  const collab = lb.enterRoom(collabRoomId(projectId))
  const unsubscribers: (() => void)[] = []

  // 3. Yjs sync on both docs
  const contentProvider = new LiveblocksYjsProvider(content.room, projectRoom.content)
  const collabProvider = new LiveblocksYjsProvider(collab.room, projectRoom.collab)
  cb.registerRemoteOrigin(contentProvider)
  cb.registerRemoteOrigin(collabProvider)

  let contentSynced = false
  let collabSynced = false
  const refreshSynced = () => {
    if (contentSynced && collabSynced) cb.onSynced()
    else cb.onUnsynced()
  }
  const onContentSync = (synced: boolean) => {
    contentSynced = synced
    refreshSynced()
  }
  const onCollabSync = (synced: boolean) => {
    collabSynced = synced
    refreshSynced()
  }
  contentProvider.on('sync', onContentSync)
  collabProvider.on('sync', onCollabSync)

  // 4. connection state → honest UI status
  const room = content.room
  unsubscribers.push(
    room.subscribe('status', (status) => {
      switch (status) {
        case 'connected':
          cb.onStatus('connected')
          break
        case 'connecting':
          cb.onStatus('connecting')
          break
        case 'reconnecting':
          cb.onStatus(navigator.onLine ? 'reconnecting' : 'offline')
          break
        case 'disconnected':
          cb.onStatus('offline', 'Realtime connection lost.')
          break
        default:
          break
      }
    }),
    room.subscribe('lost-connection', (event) => {
      if (event === 'lost') cb.onStatus('reconnecting', 'Reconnecting…')
      if (event === 'failed')
        cb.onStatus('offline', 'Could not reach the realtime backend.')
      if (event === 'restored') cb.onStatus('connected')
    }),
  )

  const peerOf = (presence: unknown): PresencePeer | null => {
    const peer = (presence as { peer?: PresencePeer } | null)?.peer
    return peer && typeof peer.sessionId === 'string' ? peer : null
  }

  // 5. presence: others' peer states → CollabMessage 'presence' frames
  unsubscribers.push(
    room.subscribe('others', (others, event) => {
      if (event.type === 'leave') {
        const peer = peerOf(event.user.presence)
        if (peer) {
          cb.onMessage({
            type: 'presence-bye',
            projectId,
            senderId: peer.sessionId,
            at: Date.now(),
            payload: { sessionId: peer.sessionId },
          })
        }
        return
      }
      const users =
        event.type === 'reset' ? [...others] : 'user' in event ? [event.user] : []
      for (const u of users) {
        const peer = peerOf(u.presence)
        if (peer && peer.sessionId !== SESSION_ID) {
          cb.onMessage({
            type: 'presence',
            projectId,
            senderId: peer.sessionId,
            at: Date.now(),
            payload: peer,
          })
        }
      }
    }),
  )

  // 6. CollabMessage broadcast frames (locks, collab-state, board fallback)
  const collabRoom = collab.room
  unsubscribers.push(
    collabRoom.subscribe('event', ({ event }) => {
      const msg = event as unknown as CollabMessage
      if (msg?.type && msg.senderId && msg.senderId !== SESSION_ID) {
        cb.onMessage(msg)
      }
    }),
  )

  return {
    send(msg: CollabMessage): void {
      try {
        collabRoom.broadcastEvent(JSON.parse(JSON.stringify(msg)))
      } catch {
        // read-only roles can't broadcast; server enforcement is the point
      }
    },
    updatePresence(peer: PresencePeer): void {
      try {
        room.updatePresence({ peer: JSON.parse(JSON.stringify(peer)) })
      } catch {
        // presence rejected — never crash the caller
      }
    },
    contentAwareness(): unknown {
      return contentProvider.awareness
    },
    detach(): void {
      contentProvider.off('sync', onContentSync)
      collabProvider.off('sync', onCollabSync)
      for (const u of unsubscribers) u()
      contentProvider.destroy()
      collabProvider.destroy()
      content.leave()
      collab.leave()
      cb.onStatus('inactive')
    },
  }
}

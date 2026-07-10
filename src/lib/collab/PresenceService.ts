import { useStore } from '@/store/useStore'
import type { PresenceLocation, PresencePeer } from '@/types/collab'
import { useCollabStore } from './collabStore'
import {
  colorForUser,
  currentIdentity,
  SESSION_ID,
} from './CollaborationProvider'
import { collabHub } from './hub'

/**
 * PresenceService — who is here, where, doing what.
 *
 * Sends a heartbeat with this session's full presence state every
 * HEARTBEAT_MS (and immediately on location/selection changes); cursor
 * moves are throttled separately so dragging stays smooth. Peers that
 * miss ~3 heartbeats are pruned.
 *
 * Presence is only as live as the transport: with the local provider it
 * is instant across tabs; Drive polling deliberately does NOT fake live
 * presence (it only refreshes members' lastActiveAt).
 */

const HEARTBEAT_MS = 10_000
const PEER_TTL_MS = 35_000
const CURSOR_THROTTLE_MS = 60

class PresenceService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private pruneTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribeStore: (() => void) | null = null
  private unsubscribeHub: (() => void)[] = []
  private lastCursorSentAt = 0

  private cursor: PresencePeer['cursor']
  private selection: string[] = []
  private editing: PresencePeer['editing']

  start(): void {
    if (this.heartbeatTimer) return

    this.unsubscribeHub.push(
      collabHub.on('presence', (msg) => {
        const peer = msg.payload as PresencePeer
        if (peer?.sessionId) useCollabStore.getState().upsertPeer(peer)
      }),
      collabHub.on('presence-bye', (msg) => {
        const { sessionId } = msg.payload as { sessionId: string }
        if (sessionId) useCollabStore.getState().removePeer(sessionId)
      }),
    )

    this.heartbeatTimer = setInterval(() => this.beat(), HEARTBEAT_MS)
    this.pruneTimer = setInterval(
      () => useCollabStore.getState().prunePeers(PEER_TTL_MS),
      HEARTBEAT_MS,
    )

    // announce moves between boards/modes/documents immediately
    this.unsubscribeStore = useStore.subscribe((state, prev) => {
      if (
        state.viewMode !== prev.viewMode ||
        state.activeBoardId !== prev.activeBoardId ||
        state.activeDocId !== prev.activeDocId ||
        state.activeCodeId !== prev.activeCodeId ||
        state.activeSheetId !== prev.activeSheetId ||
        state.activeProjectId !== prev.activeProjectId
      ) {
        this.beat()
      }
    })

    window.addEventListener('beforeunload', this.bye)
    this.beat()
  }

  stop(): void {
    this.bye()
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.pruneTimer) clearInterval(this.pruneTimer)
    this.heartbeatTimer = null
    this.pruneTimer = null
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    for (const u of this.unsubscribeHub) u()
    this.unsubscribeHub = []
    window.removeEventListener('beforeunload', this.bye)
  }

  /** Board cursor in flow coordinates; throttled. */
  setCursor(boardId: string, x: number, y: number): void {
    this.cursor = { boardId, x, y }
    const now = Date.now()
    if (now - this.lastCursorSentAt < CURSOR_THROTTLE_MS) return
    this.lastCursorSentAt = now
    this.beat()
  }

  clearCursor(): void {
    if (!this.cursor) return
    this.cursor = undefined
    this.beat()
  }

  setSelection(nodeIds: string[]): void {
    const same =
      nodeIds.length === this.selection.length &&
      nodeIds.every((id, i) => this.selection[i] === id)
    if (same) return
    this.selection = nodeIds
    this.beat()
  }

  setEditing(editing: PresencePeer['editing']): void {
    if (this.editing?.id === editing?.id && this.editing?.kind === editing?.kind) return
    this.editing = editing
    this.beat()
  }

  /** This session's presence, as peers see it. */
  self(): PresencePeer {
    const identity = currentIdentity()
    return {
      sessionId: SESSION_ID,
      userId: identity.userId,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      color: colorForUser(identity.userId),
      projectId: useStore.getState().activeProjectId,
      location: this.location(),
      cursor: this.cursor,
      selection: this.selection.length ? this.selection : undefined,
      editing: this.editing,
      lastSeenAt: Date.now(),
    }
  }

  private location(): PresenceLocation {
    const s = useStore.getState()
    const loc: PresenceLocation = { mode: s.viewMode, boardId: s.activeBoardId }
    if (s.activeDocId && s.docs[s.activeDocId]) {
      loc.entityKind = 'doc'
      loc.entityId = s.activeDocId
      loc.entityTitle = s.docs[s.activeDocId].title
    } else if (s.activeCodeId && s.codeDocs[s.activeCodeId]) {
      const c = s.codeDocs[s.activeCodeId]
      loc.entityKind = 'code'
      loc.entityId = s.activeCodeId
      loc.entityTitle = `${c.title}.${c.extension}`
    } else if (s.activeSheetId && s.sheetDocs[s.activeSheetId]) {
      loc.entityKind = 'sheet'
      loc.entityId = s.activeSheetId
      loc.entityTitle = s.sheetDocs[s.activeSheetId].title
    } else if (s.activeNoteId && s.notes[s.activeNoteId]) {
      loc.entityKind = 'note'
      loc.entityId = s.activeNoteId
      loc.entityTitle = s.notes[s.activeNoteId].title
    }
    return loc
  }

  private beat(): void {
    const self = this.self()
    collabHub.send('presence', self.projectId, self)
  }

  private bye = (): void => {
    collabHub.send('presence-bye', useStore.getState().activeProjectId, {
      sessionId: SESSION_ID,
    })
  }
}

export const presenceService = new PresenceService()

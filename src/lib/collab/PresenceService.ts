import { useStore } from '@/store/useStore'
import { openEntityOf } from '@/lib/tabs/openEntity'
import { describeEntity } from '@/lib/entities/entityLabel'
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

type ReportedKind = NonNullable<PresenceLocation['entityKind']>
const REPORTED_KINDS: ReportedKind[] = ['doc', 'code', 'sheet', 'note', 'asset']

const HEARTBEAT_MS = 10_000
const PEER_TTL_MS = 35_000
const CURSOR_THROTTLE_MS = 60
const DRAG_THROTTLE_MS = 50

class PresenceService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private pruneTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribeStore: (() => void) | null = null
  private unsubscribeHub: (() => void)[] = []
  private lastCursorSentAt = 0

  private cursor: PresencePeer['cursor']
  private selection: string[] = []
  private editing: PresencePeer['editing']
  private dragging: PresencePeer['dragging']
  private lastDragSentAt = 0
  private sheetCell: PresencePeer['sheetCell']
  private codeLine: PresencePeer['codeLine']

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
        state.activeProjectId !== prev.activeProjectId ||
        // one comparison instead of one per kind, and it now catches the two
        // the old list forgot: opening a note or a presentation
        openEntityOf(state) !== openEntityOf(prev)
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

  /**
   * Transient drag geometry (Phase 8): peers render it as a live outline
   * while the committed positions arrive as CRDT ops on drag end.
   * Throttled independently of the cursor so drags stay smooth without
   * flooding the transport.
   */
  setDragging(dragging: PresencePeer['dragging']): void {
    this.dragging = dragging
    const now = Date.now()
    if (dragging && now - this.lastDragSentAt < DRAG_THROTTLE_MS) return
    this.lastDragSentAt = now
    this.beat()
  }

  clearDragging(): void {
    if (!this.dragging) return
    this.dragging = undefined
    this.beat()
  }

  /** Selected spreadsheet cell (Phase 8 presence). */
  setSheetCell(sheetCell: PresencePeer['sheetCell']): void {
    const a = this.sheetCell
    if (
      a?.sheetId === sheetCell?.sheetId &&
      a?.sheetName === sheetCell?.sheetName &&
      a?.r === sheetCell?.r &&
      a?.c === sheetCell?.c
    )
      return
    this.sheetCell = sheetCell
    this.beat()
  }

  /** Active code line (Phase 8 presence). */
  setCodeLine(codeLine: PresencePeer['codeLine']): void {
    if (this.codeLine?.codeId === codeLine?.codeId && this.codeLine?.line === codeLine?.line)
      return
    this.codeLine = codeLine
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
      dragging: this.dragging,
      sheetCell: this.sheetCell,
      codeLine: this.codeLine,
      lastSeenAt: Date.now(),
    }
  }

  private location(): PresenceLocation {
    const s = useStore.getState()
    const loc: PresenceLocation = { mode: s.viewMode, boardId: s.activeBoardId }
    // "what this user has open" is the active tab, and its title comes from
    // the one lookup every surface shares — this used to be a fifth hand-rolled
    // chain over the slots, with its own idea of how a code file is named
    const tab = openEntityOf(s)
    const described = tab && describeEntity(tab.kind, tab.id, s)
    // `PresenceLocation.entityKind` has no 'present' or 'asset', and the chain
    // this replaced reported neither: peers see "in a presentation" as just
    // the mode. Widening the wire type is a presence change, not a tab one.
    if (tab && described && REPORTED_KINDS.includes(tab.kind as ReportedKind)) {
      loc.entityKind = tab.kind as ReportedKind
      loc.entityId = tab.id
      loc.entityTitle = described.title
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

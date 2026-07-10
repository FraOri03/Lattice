import { useStore } from '@/store/useStore'
import type { Board, BoardNode } from '@/types/model'
import { yjsManager } from '@/lib/crdt/YjsManager'
import { BoardCRDT, type NodeGeometryPatch } from '@/lib/crdt/BoardCRDT'
import { LOCAL_ORIGIN, MIGRATION_ORIGIN } from '@/lib/crdt/ProjectRoom'
import { awareness } from '@/lib/crdt/AwarenessService'
import { absolutePositionOf, refreshSectionChildren } from '@/lib/board/sections'
import { activityLog } from './ActivityLogService'

/**
 * RealtimeBoardSync — the bridge between the zustand board state and the
 * board CRDT (Phase 8; replaces the Phase 7 op-broadcast model).
 *
 * Local edits: a store subscription diffs the active board and writes
 * GRANULAR CRDT operations — node upserts, geometry patches, edge
 * add/remove, data updates, layer order. The full board is serialized
 * only once, when an existing board is first seeded into an empty CRDT.
 *
 * Dragging: while a node is being dragged, geometry travels as THROTTLED
 * TRANSIENT presence (peers render a manipulation outline); the committed
 * CRDT op is written on drag end. Pointer movement never rewrites the
 * board. A node a peer is actively dragging is locally non-draggable
 * (one authoritative drag; takeover after release) and a node the local
 * user is dragging is never moved by remote updates.
 *
 * Remote edits: a deep CRDT observer rebuilds the affected board and
 * merges it into the store, preserving local runtime state (selection,
 * in-flight drags). Two users editing different objects touch different
 * CRDT keys and can never overwrite each other; same-object conflicts
 * resolve last-writer-wins per object.
 */

const COMMIT_THROTTLE_MS = 80

class RealtimeBoardSync {
  private applying = false
  private unsubscribeStore: (() => void) | null = null
  private offCrdt: (() => void) | null = null
  private crdt: BoardCRDT | null = null
  private boundProjectId: string | null = null
  private bindSeq = 0

  private pendingPatches = new Map<string, NodeGeometryPatch>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushBoardId: string | null = null
  /** node ids this session was dragging in the previous diff */
  private wasDragging = new Set<string>()
  private lastMoveLogAt = 0

  start(): void {
    if (this.unsubscribeStore) return
    const s = useStore.getState()
    void this.bind(s.activeProjectId)

    this.unsubscribeStore = useStore.subscribe((state, prev) => {
      if (state.activeProjectId !== prev.activeProjectId) {
        void this.bind(state.activeProjectId)
        return
      }
      if (this.applying) return
      // board created/deleted locally
      if (state.boards !== prev.boards) {
        for (const id of Object.keys(prev.boards)) {
          if (!state.boards[id]) this.crdt?.removeBoard(id)
        }
      }
      // switching boards: make sure the new active board is in the CRDT
      if (state.activeBoardId !== prev.activeBoardId) {
        this.ensureBoard(state.activeBoardId)
      }
      const boardId = state.activeBoardId
      const cur = state.boards[boardId]
      const old = prev.boards[boardId]
      if (!cur || !old || cur === old) return
      this.diff(old, cur)
    })
  }

  stop(): void {
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    this.offCrdt?.()
    this.offCrdt = null
    this.crdt = null
    this.boundProjectId = null
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.pendingPatches.clear()
    this.wasDragging.clear()
  }

  /* ---------------- room binding ---------------- */

  private async bind(projectId: string): Promise<void> {
    const seq = ++this.bindSeq
    this.offCrdt?.()
    this.offCrdt = null
    this.crdt = null
    this.boundProjectId = null

    const room = yjsManager.room(projectId)
    await room.loaded
    if (seq !== this.bindSeq) return // switched again while loading

    const crdt = new BoardCRDT(room)
    this.crdt = crdt
    this.boundProjectId = projectId

    // adopt CRDT state or seed it from the store, board by board
    this.ensureBoard(useStore.getState().activeBoardId)

    this.offCrdt = crdt.observe((boardId, origin) => {
      if (origin === LOCAL_ORIGIN || origin === MIGRATION_ORIGIN) return
      this.applyFromCrdt(boardId)
    })
  }

  /**
   * First contact between a board and the CRDT: an empty CRDT adopts the
   * store's board (one-time seed); a non-empty CRDT is the shared truth
   * and replaces the local copy (it may hold newer remote edits).
   */
  private ensureBoard(boardId: string): void {
    const crdt = this.crdt
    const board = useStore.getState().boards[boardId]
    if (!crdt || !board) return
    if (board.projectId && board.projectId !== this.boundProjectId) return
    if (crdt.hasBoard(boardId)) this.applyFromCrdt(boardId)
    else crdt.seedBoard(board)
  }

  /* ---------------- outgoing (store → CRDT) ---------------- */

  private diff(old: Board, cur: Board): void {
    const crdt = this.crdt
    if (!crdt || !crdt.hasBoard(cur.id)) return
    const oldById = new Map(old.nodes.map((n) => [n.id, n]))
    const curById = new Map(cur.nodes.map((n) => [n.id, n]))
    const orderOld = new Map(old.nodes.map((n, i) => [n.id, i]))

    const added: { node: BoardNode; order: number }[] = []
    const dataChanged: BoardNode[] = []
    const transient: Record<string, { x: number; y: number; w?: number; h?: number }> =
      {}
    let anyDragging = false

    cur.nodes.forEach((n, index) => {
      const before = oldById.get(n.id)
      if (!before) {
        added.push({ node: n, order: index })
        return
      }
      if (n.dragging) {
        // throttled transient presence — never a CRDT write per pointer move
        anyDragging = true
        this.wasDragging.add(n.id)
        const abs = absolutePositionOf(n, cur.nodes)
        transient[n.id] = {
          x: abs.x,
          y: abs.y,
          w: n.width ?? undefined,
          h: n.height ?? undefined,
        }
        return
      }
      const dragEnded = this.wasDragging.has(n.id)
      if (dragEnded) this.wasDragging.delete(n.id)
      const geometryChanged =
        before.position.x !== n.position.x ||
        before.position.y !== n.position.y ||
        before.width !== n.width ||
        before.height !== n.height ||
        before.parentId !== n.parentId ||
        before.hidden !== n.hidden ||
        orderOld.get(n.id) !== index
      if (geometryChanged || dragEnded) {
        this.pendingPatches.set(n.id, {
          id: n.id,
          position: n.position,
          width: n.width ?? undefined,
          height: n.height ?? undefined,
          parentId: n.parentId ?? null,
          hidden: n.hidden ?? false,
          order: index,
          movedAt: Date.now(),
        })
      }
      if (before.data !== n.data) dataChanged.push(n)
    })

    const removedIds = old.nodes.filter((n) => !curById.has(n.id)).map((n) => n.id)

    if (added.length) crdt.upsertNodes(cur.id, added)
    if (removedIds.length) crdt.removeNodes(cur.id, removedIds)
    for (const n of dataChanged) crdt.updateNodeData(cur.id, n.id, n.data)

    // edges: id-level union diff
    const oldEdges = new Set(old.edges.map((e) => e.id))
    const curEdges = new Set(cur.edges.map((e) => e.id))
    const addedEdges = cur.edges.filter((e) => !oldEdges.has(e.id))
    const changedEdges = cur.edges.filter((e) => {
      if (!oldEdges.has(e.id)) return false
      const prev = old.edges.find((x) => x.id === e.id)
      return prev !== e
    })
    const removedEdges = old.edges.filter((e) => !curEdges.has(e.id)).map((e) => e.id)
    if (addedEdges.length || changedEdges.length)
      crdt.upsertEdges(cur.id, [...addedEdges, ...changedEdges])
    if (removedEdges.length) crdt.removeEdges(cur.id, removedEdges)

    // board rename
    if (old.name !== cur.name) crdt.setName(cur.id, cur.name)

    // transient drag presence (throttled inside PresenceService)
    if (anyDragging) {
      awareness.setDragging(cur.id, transient)
    } else if (this.wasDragging.size === 0 && Object.keys(transient).length === 0) {
      awareness.clearDragging()
    }

    if (this.pendingPatches.size && !this.flushTimer) {
      this.flushBoardId = cur.id
      this.flushTimer = setTimeout(() => this.flushPatches(), COMMIT_THROTTLE_MS)
    }
  }

  private flushPatches(): void {
    this.flushTimer = null
    const boardId = this.flushBoardId
    if (!boardId || !this.pendingPatches.size) return
    const patches = [...this.pendingPatches.values()]
    this.pendingPatches.clear()
    this.crdt?.patchNodes(boardId, patches)
    // activity: one entry per rearrangement burst, not per pixel
    if (Date.now() - this.lastMoveLogAt > 4000) {
      this.lastMoveLogAt = Date.now()
      const s = useStore.getState()
      const board = s.boards[boardId]
      if (board) {
        activityLog.log(
          s.activeProjectId,
          'board.card-moved',
          `Cards rearranged on “${board.name}”`,
          boardId,
        )
      }
    }
  }

  /* ---------------- incoming (CRDT → store) ---------------- */

  private applyFromCrdt(boardId: string): void {
    const crdt = this.crdt
    if (!crdt) return
    const snapshot = crdt.snapshot(boardId)
    const s = useStore.getState()
    const board = s.boards[boardId]

    // board deleted remotely (CRDT entry gone but we still have it)
    if (!snapshot) {
      if (!board) return
      if (board.projectId && board.projectId !== this.boundProjectId) return
      const siblings = s.boardOrder.filter(
        (b) => s.boards[b]?.projectId === board.projectId,
      )
      if (siblings.length <= 1) return // never drop a project's last board
      this.applying = true
      try {
        useStore.setState((state) => {
          const boards = { ...state.boards }
          delete boards[boardId]
          const boardOrder = state.boardOrder.filter((b) => b !== boardId)
          const activeBoardId =
            state.activeBoardId === boardId
              ? (siblings.find((b) => b !== boardId) ?? boardOrder[0])
              : state.activeBoardId
          return { boards, boardOrder, activeBoardId }
        })
      } finally {
        this.applying = false
      }
      return
    }

    // board created remotely: materialize it locally
    if (!board) {
      this.applying = true
      try {
        const projectId = this.boundProjectId ?? undefined
        useStore.setState((state) => ({
          boards: {
            ...state.boards,
            [boardId]: {
              id: boardId,
              name: snapshot.name || 'Board',
              nodes: refreshSectionChildren(snapshot.nodes),
              edges: snapshot.edges,
              projectId,
            },
          },
          boardOrder: state.boardOrder.includes(boardId)
            ? state.boardOrder
            : [...state.boardOrder, boardId],
        }))
      } finally {
        this.applying = false
      }
      return
    }

    const localById = new Map(board.nodes.map((n) => [n.id, n]))
    const nodes = snapshot.nodes.map((n) => {
      const local = localById.get(n.id)
      if (!local) return n
      // never fight the local user's own drag/resize
      if (local.dragging || local.resizing) return local
      return {
        ...n,
        selected: local.selected,
        // trust locally measured dimensions until a real change arrives
        measured: local.measured,
      }
    })

    this.applying = true
    try {
      useStore.setState((state) => {
        const target = state.boards[boardId]
        if (!target) return {}
        return {
          boards: {
            ...state.boards,
            [boardId]: {
              ...target,
              name: snapshot.name || target.name,
              nodes: refreshSectionChildren(nodes),
              edges: snapshot.edges,
            },
          },
        }
      })
    } finally {
      this.applying = false
    }
  }
}

export const realtimeBoardSync = new RealtimeBoardSync()

import type { Edge } from '@xyflow/react'
import { useStore } from '@/store/useStore'
import type { Board, BoardNode } from '@/types/model'
import { collabHub } from './hub'
import { activityLog } from './ActivityLogService'

/**
 * RealtimeBoardSync — live board mirroring between sessions.
 *
 * Local edits: a store subscription diffs the active board against its
 * previous value and broadcasts compact ops (moves/resizes throttled so
 * drags stay smooth; adds/removes sent immediately).
 *
 * Remote ops: applied node-by-node. Safety rules:
 *  - ops only touch the board they were recorded on
 *  - a node the local user is currently dragging is never moved remotely
 *  - each applied op stamps node.data.__movedAt, which ConflictResolverV2
 *    uses for node-level merges of full snapshots
 *
 * With the BroadcastChannel provider this is real live sync across tabs;
 * across devices it requires the realtime backend (Phase 8) — Drive
 * polling intentionally does not carry board ops.
 */

interface NodePatch {
  id: string
  position?: { x: number; y: number }
  width?: number
  height?: number
  parentId?: string | null
  hidden?: boolean
  movedAt: number
}

interface BoardOpPayload {
  boardId: string
  op: 'nodes-patch' | 'nodes-add' | 'nodes-remove' | 'edges-add' | 'edges-remove'
  patches?: NodePatch[]
  nodes?: BoardNode[]
  nodeIds?: string[]
  edges?: Edge[]
  edgeIds?: string[]
}

const MOVE_THROTTLE_MS = 80

class RealtimeBoardSync {
  private applying = false
  private unsubscribe: (() => void) | null = null
  private offHub: (() => void) | null = null
  private pendingPatches = new Map<string, NodePatch>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private lastMoveLogAt = 0

  start(): void {
    if (this.unsubscribe) return
    this.offHub = collabHub.on('board-op', (msg) => {
      this.apply(msg.payload as BoardOpPayload)
    })
    this.unsubscribe = useStore.subscribe((state, prev) => {
      if (this.applying) return
      const boardId = state.activeBoardId
      const cur = state.boards[boardId]
      const old = prev.boards[boardId]
      if (!cur || !old || cur === old) return
      this.diff(old, cur)
    })
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.offHub?.()
    this.offHub = null
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.pendingPatches.clear()
  }

  /* ---------------- outgoing ---------------- */

  private diff(old: Board, cur: Board): void {
    const projectId = useStore.getState().activeProjectId
    const oldById = new Map(old.nodes.map((n) => [n.id, n]))
    const curById = new Map(cur.nodes.map((n) => [n.id, n]))

    // adds / removes / geometry changes
    const added: BoardNode[] = []
    for (const n of cur.nodes) {
      const before = oldById.get(n.id)
      if (!before) {
        added.push(n)
        continue
      }
      if (
        before.position.x !== n.position.x ||
        before.position.y !== n.position.y ||
        before.width !== n.width ||
        before.height !== n.height ||
        before.parentId !== n.parentId ||
        before.hidden !== n.hidden
      ) {
        this.pendingPatches.set(n.id, {
          id: n.id,
          position: n.position,
          width: n.width ?? undefined,
          height: n.height ?? undefined,
          parentId: n.parentId ?? null,
          hidden: n.hidden ?? false,
          movedAt: Date.now(),
        })
      }
    }
    const removedIds = old.nodes.filter((n) => !curById.has(n.id)).map((n) => n.id)

    if (added.length) {
      collabHub.send('board-op', projectId, {
        boardId: cur.id,
        op: 'nodes-add',
        nodes: added,
      } satisfies BoardOpPayload)
    }
    if (removedIds.length) {
      collabHub.send('board-op', projectId, {
        boardId: cur.id,
        op: 'nodes-remove',
        nodeIds: removedIds,
      } satisfies BoardOpPayload)
    }

    // edges: id-level union diff
    const oldEdges = new Set(old.edges.map((e) => e.id))
    const curEdges = new Set(cur.edges.map((e) => e.id))
    const addedEdges = cur.edges.filter((e) => !oldEdges.has(e.id))
    const removedEdges = old.edges.filter((e) => !curEdges.has(e.id)).map((e) => e.id)
    if (addedEdges.length) {
      collabHub.send('board-op', projectId, {
        boardId: cur.id,
        op: 'edges-add',
        edges: addedEdges,
      } satisfies BoardOpPayload)
    }
    if (removedEdges.length) {
      collabHub.send('board-op', projectId, {
        boardId: cur.id,
        op: 'edges-remove',
        edgeIds: removedEdges,
      } satisfies BoardOpPayload)
    }

    if (this.pendingPatches.size && !this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushPatches(cur.id), MOVE_THROTTLE_MS)
    }
  }

  private flushPatches(boardId: string): void {
    this.flushTimer = null
    if (!this.pendingPatches.size) return
    const patches = [...this.pendingPatches.values()]
    this.pendingPatches.clear()
    const projectId = useStore.getState().activeProjectId
    collabHub.send('board-op', projectId, {
      boardId,
      op: 'nodes-patch',
      patches,
    } satisfies BoardOpPayload)
    // activity: one entry per drag session, not per pixel (deduped anyway)
    if (Date.now() - this.lastMoveLogAt > 4000) {
      this.lastMoveLogAt = Date.now()
      const board = useStore.getState().boards[boardId]
      if (board) {
        activityLog.log(
          projectId,
          'board.card-moved',
          `Cards rearranged on “${board.name}”`,
          boardId,
        )
      }
    }
  }

  /* ---------------- incoming ---------------- */

  private apply(payload: BoardOpPayload): void {
    const s = useStore.getState()
    const board = s.boards[payload.boardId]
    if (!board) return

    this.applying = true
    try {
      switch (payload.op) {
        case 'nodes-patch': {
          const byId = new Map(payload.patches?.map((p) => [p.id, p]))
          const nodes = board.nodes.map((n) => {
            const p = byId.get(n.id)
            // never fight the local user's own drag
            if (!p || n.dragging) return n
            const next: BoardNode = {
              ...n,
              position: p.position ?? n.position,
              width: p.width ?? n.width,
              height: p.height ?? n.height,
              hidden: p.hidden ?? n.hidden,
              data: { ...n.data, __movedAt: p.movedAt },
            }
            if (p.parentId !== undefined) {
              if (p.parentId === null) delete next.parentId
              else next.parentId = p.parentId
            }
            return next
          })
          this.patchBoard(payload.boardId, { nodes })
          break
        }
        case 'nodes-add': {
          const existing = new Set(board.nodes.map((n) => n.id))
          const fresh = (payload.nodes ?? []).filter((n) => !existing.has(n.id))
          if (!fresh.length) break
          // sections must precede children in React Flow's node array
          const sections = fresh.filter((n) => n.type === 'section')
          const rest = fresh.filter((n) => n.type !== 'section')
          this.patchBoard(payload.boardId, {
            nodes: [
              ...sections,
              ...board.nodes,
              ...rest.map((n) => ({ ...n, selected: false })),
            ],
          })
          break
        }
        case 'nodes-remove': {
          const gone = new Set(payload.nodeIds ?? [])
          if (!gone.size) break
          this.patchBoard(payload.boardId, {
            nodes: board.nodes.filter((n) => !gone.has(n.id)),
            edges: board.edges.filter(
              (e) => !gone.has(e.source) && !gone.has(e.target),
            ),
          })
          break
        }
        case 'edges-add': {
          const existing = new Set(board.edges.map((e) => e.id))
          const fresh = (payload.edges ?? []).filter((e) => !existing.has(e.id))
          if (fresh.length)
            this.patchBoard(payload.boardId, { edges: [...board.edges, ...fresh] })
          break
        }
        case 'edges-remove': {
          const gone = new Set(payload.edgeIds ?? [])
          if (gone.size)
            this.patchBoard(payload.boardId, {
              edges: board.edges.filter((e) => !gone.has(e.id)),
            })
          break
        }
      }
    } finally {
      this.applying = false
    }
  }

  private patchBoard(boardId: string, patch: Partial<Board>): void {
    useStore.setState((s) => ({
      boards: { ...s.boards, [boardId]: { ...s.boards[boardId], ...patch } },
    }))
  }
}

export const realtimeBoardSync = new RealtimeBoardSync()

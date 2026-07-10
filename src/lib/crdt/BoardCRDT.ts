import * as Y from 'yjs'
import type { Edge } from '@xyflow/react'
import type { Board, BoardNode, CardData } from '@/types/model'
import { MIGRATION_ORIGIN, type ProjectRoom } from './ProjectRoom'

/**
 * BoardCRDT — boards as granular CRDT structures:
 *
 *   boards: Y.Map
 *     boardId → Y.Map {
 *       name:  string
 *       nodes: Y.Map  nodeId → serialized node (JSON)
 *       edges: Y.Map  edgeId → edge (JSON)
 *     }
 *
 * Granularity contract: every operation touches only the entries it
 * changes. Two users moving different cards write different keys and can
 * never overwrite each other; two users mutating the same card resolve by
 * CRDT last-writer-wins on that single entry, with drag arbitration
 * handled at the presence layer (one authoritative drag at a time, shown
 * with a manipulation outline).
 *
 * The full board is serialized ONLY when seeding an existing board into
 * an empty CRDT (migration) — never during pointer movement.
 */

/** Persisted shape of a node inside the CRDT (runtime flags stripped). */
export interface CRDTNode {
  id: string
  type: string
  x: number
  y: number
  width: number | null
  height: number | null
  parentId: string | null
  hidden: boolean
  data: CardData
  /** layer order — index in the board's node array (z-stacking) */
  order: number
  /** LWW tiebreaker + "who moved last" for conflict labels */
  movedAt: number
}

export interface NodeGeometryPatch {
  id: string
  position?: { x: number; y: number }
  width?: number
  height?: number
  parentId?: string | null
  hidden?: boolean
  order?: number
  movedAt: number
}

export function serializeNode(n: BoardNode, order = 0): CRDTNode {
  return {
    id: n.id,
    type: n.type ?? 'note',
    x: n.position.x,
    y: n.position.y,
    width: n.width ?? null,
    height: n.height ?? null,
    parentId: n.parentId ?? null,
    hidden: n.hidden ?? false,
    data: n.data,
    order,
    movedAt: Date.now(),
  }
}

export function deserializeNode(rec: CRDTNode): BoardNode {
  const node: BoardNode = {
    id: rec.id,
    type: rec.type,
    position: { x: rec.x, y: rec.y },
    data: rec.data,
    dragHandle: rec.type === 'section' ? '.section-drag' : '.drag-handle',
  }
  if (rec.width != null) node.width = rec.width
  if (rec.height != null) node.height = rec.height
  if (rec.parentId) node.parentId = rec.parentId
  if (rec.hidden) node.hidden = true
  return node
}

export class BoardCRDT {
  constructor(private readonly room: ProjectRoom) {}

  /** The Y.Map of one board; created when `create` is set. */
  private boardMap(boardId: string, create = false): Y.Map<unknown> | null {
    const boards = this.room.boards()
    let map = boards.get(boardId)
    if (!map && create) {
      map = new Y.Map<unknown>()
      const fresh = map
      this.room.transactContent(() => {
        fresh.set('nodes', new Y.Map<unknown>())
        fresh.set('edges', new Y.Map<unknown>())
        boards.set(boardId, fresh)
      })
    }
    return map ?? null
  }

  private nodesMap(boardId: string, create = false): Y.Map<unknown> | null {
    return (this.boardMap(boardId, create)?.get('nodes') as Y.Map<unknown>) ?? null
  }

  private edgesMap(boardId: string, create = false): Y.Map<unknown> | null {
    return (this.boardMap(boardId, create)?.get('edges') as Y.Map<unknown>) ?? null
  }

  /** True when this board has CRDT state (has been seeded/used). */
  hasBoard(boardId: string): boolean {
    return this.room.boards().has(boardId)
  }

  /**
   * Seed an existing board into an empty CRDT — the one full-board write,
   * used for migration when a board first goes collaborative.
   */
  seedBoard(board: Board): void {
    if (this.hasBoard(board.id)) return
    this.room.content.transact(() => {
      const map = new Y.Map<unknown>()
      const nodes = new Y.Map<unknown>()
      const edges = new Y.Map<unknown>()
      map.set('name', board.name)
      map.set('nodes', nodes)
      map.set('edges', edges)
      board.nodes.forEach((n, i) => nodes.set(n.id, serializeNode(n, i)))
      for (const e of board.edges) edges.set(e.id, JSON.parse(JSON.stringify(e)))
      this.room.boards().set(board.id, map)
    }, MIGRATION_ORIGIN)
  }

  /* ---------------- granular local operations ---------------- */

  setName(boardId: string, name: string): void {
    const map = this.boardMap(boardId, true)
    if (map?.get('name') !== name)
      this.room.transactContent(() => map?.set('name', name))
  }

  upsertNodes(boardId: string, nodesToAdd: { node: BoardNode; order: number }[]): void {
    if (!nodesToAdd.length) return
    const nodes = this.nodesMap(boardId, true)
    if (!nodes) return
    this.room.transactContent(() => {
      for (const { node, order } of nodesToAdd) nodes.set(node.id, serializeNode(node, order))
    })
  }

  /** Update node card payloads (color, title, section metadata…). */
  updateNodeData(boardId: string, nodeId: string, data: CardData): void {
    const nodes = this.nodesMap(boardId)
    const rec = nodes?.get(nodeId) as CRDTNode | undefined
    if (!nodes || !rec) return
    this.room.transactContent(() =>
      nodes.set(nodeId, { ...rec, data, movedAt: Date.now() }),
    )
  }

  /** Committed geometry changes (drag end, resize end, reparent). */
  patchNodes(boardId: string, patches: NodeGeometryPatch[]): void {
    if (!patches.length) return
    const nodes = this.nodesMap(boardId)
    if (!nodes) return
    this.room.transactContent(() => {
      for (const p of patches) {
        const rec = nodes.get(p.id) as CRDTNode | undefined
        if (!rec) continue
        nodes.set(p.id, {
          ...rec,
          x: p.position?.x ?? rec.x,
          y: p.position?.y ?? rec.y,
          width: p.width ?? rec.width,
          height: p.height ?? rec.height,
          parentId: p.parentId === undefined ? rec.parentId : p.parentId,
          hidden: p.hidden ?? rec.hidden,
          order: p.order ?? rec.order,
          movedAt: p.movedAt,
        })
      }
    })
  }

  removeNodes(boardId: string, ids: string[]): void {
    if (!ids.length) return
    const nodes = this.nodesMap(boardId)
    if (!nodes) return
    this.room.transactContent(() => {
      for (const id of ids) nodes.delete(id)
    })
  }

  upsertEdges(boardId: string, edgesToAdd: Edge[]): void {
    if (!edgesToAdd.length) return
    const edges = this.edgesMap(boardId, true)
    if (!edges) return
    this.room.transactContent(() => {
      for (const e of edgesToAdd) edges.set(e.id, JSON.parse(JSON.stringify(e)))
    })
  }

  removeEdges(boardId: string, ids: string[]): void {
    if (!ids.length) return
    const edges = this.edgesMap(boardId)
    if (!edges) return
    this.room.transactContent(() => {
      for (const id of ids) edges.delete(id)
    })
  }

  /** Remove a deleted board entirely. */
  removeBoard(boardId: string): void {
    if (!this.hasBoard(boardId)) return
    this.room.transactContent(() => this.room.boards().delete(boardId))
  }

  /* ---------------- reads ---------------- */

  snapshot(boardId: string): { name: string; nodes: BoardNode[]; edges: Edge[] } | null {
    const map = this.boardMap(boardId)
    if (!map) return null
    const nodesMap = map.get('nodes') as Y.Map<unknown> | undefined
    const edgesMap = map.get('edges') as Y.Map<unknown> | undefined
    const recs: CRDTNode[] = []
    nodesMap?.forEach((rec) => recs.push(rec as CRDTNode))
    // layer order, but sections always precede children (React Flow
    // resolves parents top-down and paints in array order)
    recs.sort((a, b) => {
      const sa = a.type === 'section' ? 0 : 1
      const sb = b.type === 'section' ? 0 : 1
      if (sa !== sb) return sa - sb
      return (a.order ?? 0) - (b.order ?? 0)
    })
    const nodes = recs.map(deserializeNode)
    const edges: Edge[] = []
    edgesMap?.forEach((e) => edges.push(e as Edge))
    return { name: (map.get('name') as string) ?? '', nodes, edges }
  }

  /* ---------------- observation ---------------- */

  /**
   * Deep-observe all boards. The callback receives the changed board id
   * and the transaction origin so bridges can skip their own writes.
   */
  observe(cb: (boardId: string, origin: unknown) => void): () => void {
    const boards = this.room.boards()
    const handler = (events: Y.YEvent<Y.AbstractType<unknown>>[], tx: Y.Transaction) => {
      const changed = new Set<string>()
      for (const event of events) {
        if (event.path.length === 0) {
          // top-level: boards added/removed
          for (const key of event.changes.keys.keys()) changed.add(key)
        } else {
          changed.add(String(event.path[0]))
        }
      }
      for (const boardId of changed) cb(boardId, tx.origin)
    }
    boards.observeDeep(handler)
    return () => boards.unobserveDeep(handler)
  }
}

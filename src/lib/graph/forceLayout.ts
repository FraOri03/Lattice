/**
 * Clean-room graph layout. Three deterministic strategies:
 *
 *  - force        — a Fruchterman–Reingold force-directed layout with a
 *                   spatial-grid approximation for repulsion, so it stays
 *                   near-linear instead of O(n²) and scales to large graphs;
 *  - grid-by-type — entities bucketed into columns by kind;
 *  - radial       — BFS rings around a focus node.
 *
 * Everything is seeded from a stable hash so the same graph lays out the
 * same way across reloads (a Graph View product requirement), and pinned
 * positions are honoured as fixed points. Pure and worker-safe.
 *
 * This is an independent implementation based on the published FR algorithm;
 * no third-party graph-layout code is used or ported.
 */
import type {
  GraphLayoutKind,
  GraphNodePosition,
  GraphViewSettings,
  LatticeGraphEdge,
  LatticeGraphNode,
} from './graphTypes'
import { buildAdjacency, neighborhood } from './GraphIndex'

export interface LayoutInput {
  nodes: LatticeGraphNode[]
  edges: LatticeGraphEdge[]
  settings: Pick<GraphViewSettings, 'layout' | 'linkDistance' | 'pinnedPositions'>
  /** focus node for the radial layout */
  focusId?: string | null
  /** deterministic seed (e.g. projectId) */
  seed?: string
}

export type LayoutPositions = Record<string, GraphNodePosition>

/** Small, fast, deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function iterationsFor(n: number): number {
  if (n <= 200) return 300
  if (n <= 1000) return 200
  if (n <= 5000) return 120
  if (n <= 12000) return 70
  return 45
}

function gridByType(nodes: LatticeGraphNode[], k: number): LayoutPositions {
  const byKind = new Map<string, LatticeGraphNode[]>()
  for (const n of nodes) {
    const arr = byKind.get(n.kind) ?? []
    arr.push(n)
    byKind.set(n.kind, arr)
  }
  const kinds = [...byKind.keys()].sort()
  const colGap = k * 3
  const rowGap = k * 1.4
  const positions: LayoutPositions = {}
  kinds.forEach((kind, col) => {
    const group = byKind.get(kind)!
    const perCol = Math.max(1, Math.ceil(Math.sqrt(group.length)))
    group.forEach((node, i) => {
      const subCol = Math.floor(i / perCol)
      const row = i % perCol
      positions[node.id] = {
        x: col * colGap * 1.8 + subCol * (k * 1.2),
        y: row * rowGap,
      }
    })
    // centre each column vertically
  })
  return centre(positions)
}

function radial(input: LayoutInput, k: number): LayoutPositions {
  const { nodes, edges, focusId } = input
  const focus = focusId && nodes.some((n) => n.id === focusId) ? focusId : nodes[0]?.id
  const positions: LayoutPositions = {}
  if (!focus) return positions
  const adj = buildAdjacency(nodes, edges)
  const rings: string[][] = [[focus]]
  const placed = new Set<string>([focus])
  let depth = 1
  while (placed.size < nodes.length && depth < 40) {
    const prev = rings[depth - 1]
    const ring = neighborhood(adj, prev, 1, 'both')
    const next: string[] = []
    for (const id of ring) {
      if (!placed.has(id)) {
        placed.add(id)
        next.push(id)
      }
    }
    if (!next.length) break
    rings.push(next)
    depth++
  }
  // anything unreachable goes on an outer ring
  const rest = nodes.filter((n) => !placed.has(n.id)).map((n) => n.id)
  if (rest.length) rings.push(rest)
  positions[focus] = { x: 0, y: 0 }
  rings.forEach((ring, r) => {
    if (r === 0) return
    const radius = r * k * 2.2
    ring.forEach((id, i) => {
      const angle = (i / ring.length) * Math.PI * 2
      positions[id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
    })
  })
  return positions
}

function centre(positions: LayoutPositions): LayoutPositions {
  const ids = Object.keys(positions)
  if (!ids.length) return positions
  let cx = 0
  let cy = 0
  for (const id of ids) {
    cx += positions[id].x
    cy += positions[id].y
  }
  cx /= ids.length
  cy /= ids.length
  for (const id of ids) {
    positions[id] = { x: positions[id].x - cx, y: positions[id].y - cy }
  }
  return positions
}

/** Fruchterman–Reingold with a uniform spatial grid for repulsion. */
function forceDirected(input: LayoutInput, k: number): LayoutPositions {
  const { nodes, edges } = input
  const n = nodes.length
  const rng = mulberry32(hashSeed(input.seed ?? input.nodes.map((x) => x.id).join('')))
  const index = new Map<string, number>()
  nodes.forEach((node, i) => index.set(node.id, i))

  const px = new Float64Array(n)
  const py = new Float64Array(n)
  const pinned = new Uint8Array(n)
  const radius = Math.sqrt(n) * k
  for (let i = 0; i < n; i++) {
    const pin = input.settings.pinnedPositions[nodes[i].id]
    if (pin) {
      px[i] = pin.x
      py[i] = pin.y
      pinned[i] = 1
    } else {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * radius
      px[i] = Math.cos(a) * r
      py[i] = Math.sin(a) * r
    }
  }

  // edge endpoints as indices
  const es: number[] = []
  const et: number[] = []
  for (const e of edges) {
    const s = index.get(e.source)
    const t = index.get(e.target)
    if (s !== undefined && t !== undefined) {
      es.push(s)
      et.push(t)
    }
  }

  const iterations = iterationsFor(n)
  const cell = k * 2
  const k2 = k * k
  let temp = radius * 0.35
  const cool = temp / (iterations + 1)
  const dx = new Float64Array(n)
  const dy = new Float64Array(n)

  for (let iter = 0; iter < iterations; iter++) {
    dx.fill(0)
    dy.fill(0)

    // bucket nodes into a uniform grid keyed by cell coordinate
    const buckets = new Map<number, number[]>()
    const gx = new Int32Array(n)
    const gy = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(px[i] / cell)
      const cy = Math.floor(py[i] / cell)
      gx[i] = cx
      gy[i] = cy
      const key = (cx + 100000) * 200003 + (cy + 100000)
      const arr = buckets.get(key)
      if (arr) arr.push(i)
      else buckets.set(key, [i])
    }

    // repulsion: only against nodes in the same or adjacent cells
    for (let i = 0; i < n; i++) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const key = (gx[i] + ox + 100000) * 200003 + (gy[i] + oy + 100000)
          const arr = buckets.get(key)
          if (!arr) continue
          for (const j of arr) {
            if (j === i) continue
            let ddx = px[i] - px[j]
            let ddy = py[i] - py[j]
            let dist2 = ddx * ddx + ddy * ddy
            if (dist2 === 0) {
              // jitter coincident nodes deterministically
              ddx = (rng() - 0.5) * 0.01
              ddy = (rng() - 0.5) * 0.01
              dist2 = ddx * ddx + ddy * ddy + 1e-6
            }
            const dist = Math.sqrt(dist2)
            const force = k2 / dist
            dx[i] += (ddx / dist) * force
            dy[i] += (ddy / dist) * force
          }
        }
      }
    }

    // attraction along edges
    for (let e = 0; e < es.length; e++) {
      const i = es[e]
      const j = et[e]
      let ddx = px[i] - px[j]
      let ddy = py[i] - py[j]
      const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-6
      const force = (dist * dist) / k
      const fx = (ddx / dist) * force
      const fy = (ddy / dist) * force
      dx[i] -= fx
      dy[i] -= fy
      dx[j] += fx
      dy[j] += fy
    }

    // integrate, capped by temperature
    for (let i = 0; i < n; i++) {
      if (pinned[i]) continue
      const disp = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1e-6
      const capped = Math.min(disp, temp)
      px[i] += (dx[i] / disp) * capped
      py[i] += (dy[i] / disp) * capped
    }
    temp = Math.max(0, temp - cool)
  }

  const positions: LayoutPositions = {}
  for (let i = 0; i < n; i++) positions[nodes[i].id] = { x: px[i], y: py[i] }
  return centre(positions)
}

/** Compute node positions for the chosen layout. */
export function computeLayout(input: LayoutInput): LayoutPositions {
  const k = Math.max(30, input.settings.linkDistance || 110)
  const layout: GraphLayoutKind = input.settings.layout
  if (!input.nodes.length) return {}
  if (layout === 'grid-by-type') return applyPins(input, gridByType(input.nodes, k))
  if (layout === 'radial') return applyPins(input, radial(input, k))
  return forceDirected(input, k)
}

/** Overlay pinned positions onto a computed layout (force honours pins inline). */
function applyPins(input: LayoutInput, positions: LayoutPositions): LayoutPositions {
  for (const [id, pos] of Object.entries(input.settings.pinnedPositions)) {
    if (positions[id]) positions[id] = pos
  }
  return positions
}

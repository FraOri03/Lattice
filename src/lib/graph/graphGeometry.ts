import type { LatticeGraphEdge } from './graphTypes'

/**
 * Canvas geometry for the Graph view (19B).
 *
 * The renderer is a canvas, so there are no DOM nodes to hit-test against and
 * no layout engine to keep labels apart — both have to be arithmetic. Keeping
 * that arithmetic here means it can be tested without a canvas, and the
 * renderer stays a renderer.
 */

export interface Pt {
  x: number
  y: number
}

/**
 * Distance from a point to a line segment.
 *
 * The classic mistake is measuring to the infinite line, which makes a distant
 * point "on" an edge whenever it happens to be in line with it. Clamping the
 * projection to the segment is what stops a click far past a node's neighbour
 * from selecting the edge between them.
 */
export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export interface EdgeHitInput {
  edges: readonly LatticeGraphEdge[]
  /** screen position of each node, already projected */
  screenOf: (nodeId: string) => Pt | undefined
  /** how close a click has to be, in screen px */
  threshold: number
}

/**
 * The edge nearest a point, when one is close enough.
 *
 * Nodes are hit-tested first by the caller — an edge that ends under the
 * cursor must never win over the node itself — so this only ever runs on the
 * empty space between nodes, which is exactly where an edge is selectable.
 */
export function edgeAt(p: Pt, input: EdgeHitInput): LatticeGraphEdge | null {
  let best: LatticeGraphEdge | null = null
  let bestDistance = input.threshold
  for (const edge of input.edges) {
    const a = input.screenOf(edge.source)
    const b = input.screenOf(edge.target)
    if (!a || !b) continue
    const d = distanceToSegment(p, a, b)
    if (d <= bestDistance) {
      bestDistance = d
      best = edge
    }
  }
  return best
}

export interface LabelBox {
  x: number
  y: number
  w: number
  h: number
}

export const boxesOverlap = (a: LabelBox, b: LabelBox): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/**
 * A greedy collision pass: take labels in priority order and keep the ones
 * that do not overlap anything already kept.
 *
 * Greedy is the right shape here because the input is already sorted by how
 * much each label matters — the selection, then its neighbours, then hubs. A
 * cleverer packing could fit more labels, but it would fit them by dropping
 * more important ones, which is the wrong trade for a map you are reading.
 */
export function placeLabels<T extends { box: LabelBox }>(candidates: readonly T[], cap: number): T[] {
  const kept: T[] = []
  const taken: LabelBox[] = []
  for (const candidate of candidates) {
    if (kept.length >= cap) break
    if (taken.some((b) => boxesOverlap(candidate.box, b))) continue
    kept.push(candidate)
    taken.push(candidate.box)
  }
  return kept
}

/** Ease-out cubic: fast to start, settles rather than stops. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

/**
 * One step of a camera flight.
 *
 * Returned as a value rather than applied, so the tween can be tested and so
 * a reduced-motion caller can simply take the `to` position instead of
 * running the animation at all.
 */
export function tweenCamera(from: Pt, to: Pt, progress: number): Pt {
  const e = easeOutCubic(progress)
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }
}

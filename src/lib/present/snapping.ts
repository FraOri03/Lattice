/**
 * Snapping & smart guides (Phase 1) — pure, unit-testable.
 *
 * Given a moving rect (a single element or the union bounds of a
 * multi-selection) and the rects of the other elements, computes the smallest
 * correction that snaps the moving rect's edges/centers to:
 *   - the slide's left / horizontal-center / right and top / middle / bottom;
 *   - every other element's left / center / right and top / middle / bottom.
 * Returns the (dx, dy) correction to apply plus the guide lines to render.
 *
 * The threshold is in *slide space*; the canvas passes SNAP_PX / scale so the
 * snap feel is constant on screen at any zoom.
 */
import type { Rect } from './geometry'
import { SLIDE_H, SLIDE_W } from './presentModel'

export interface Guide {
  axis: 'x' | 'y'
  /** slide-space position of the line */
  pos: number
  /** cross-axis extent of the drawn line [from, to] */
  from: number
  to: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: Guide[]
}

interface Target {
  line: number
  from: number
  to: number
}

export const DEFAULT_SNAP_THRESHOLD = 6

function axisTargets(
  others: Rect[],
  axis: 'x' | 'y',
  slideW: number,
  slideH: number,
): Target[] {
  const targets: Target[] = []
  if (axis === 'x') {
    // slide vertical lines span the full slide height
    for (const line of [0, slideW / 2, slideW]) targets.push({ line, from: 0, to: slideH })
    for (const r of others) {
      const from = r.y
      const to = r.y + r.h
      targets.push({ line: r.x, from, to })
      targets.push({ line: r.x + r.w / 2, from, to })
      targets.push({ line: r.x + r.w, from, to })
    }
  } else {
    for (const line of [0, slideH / 2, slideH]) targets.push({ line, from: 0, to: slideW })
    for (const r of others) {
      const from = r.x
      const to = r.x + r.w
      targets.push({ line: r.y, from, to })
      targets.push({ line: r.y + r.h / 2, from, to })
      targets.push({ line: r.y + r.h, from, to })
    }
  }
  return targets
}

function bestSnap(
  points: number[],
  targets: Target[],
  threshold: number,
): { delta: number; target: Target } | null {
  let best: { delta: number; target: Target; abs: number } | null = null
  for (const p of points) {
    for (const t of targets) {
      const delta = t.line - p
      const abs = Math.abs(delta)
      if (abs <= threshold && (!best || abs < best.abs)) best = { delta, target: t, abs }
    }
  }
  return best ? { delta: best.delta, target: best.target } : null
}

export function computeSnap(
  moving: Rect,
  others: Rect[],
  threshold = DEFAULT_SNAP_THRESHOLD,
  slideW = SLIDE_W,
  slideH = SLIDE_H,
): SnapResult {
  const xPoints = [moving.x, moving.x + moving.w / 2, moving.x + moving.w]
  const yPoints = [moving.y, moving.y + moving.h / 2, moving.y + moving.h]

  const xSnap = bestSnap(xPoints, axisTargets(others, 'x', slideW, slideH), threshold)
  const ySnap = bestSnap(yPoints, axisTargets(others, 'y', slideW, slideH), threshold)

  const guides: Guide[] = []
  const dx = xSnap ? xSnap.delta : 0
  const dy = ySnap ? ySnap.delta : 0

  if (xSnap) {
    const t = xSnap.target
    guides.push({
      axis: 'x',
      pos: t.line,
      from: Math.min(t.from, moving.y + dy),
      to: Math.max(t.to, moving.y + moving.h + dy),
    })
  }
  if (ySnap) {
    const t = ySnap.target
    guides.push({
      axis: 'y',
      pos: t.line,
      from: Math.min(t.from, moving.x + dx),
      to: Math.max(t.to, moving.x + moving.w + dx),
    })
  }

  return { dx, dy, guides }
}

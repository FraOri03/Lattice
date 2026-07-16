/**
 * Alignment & distribution (Phase 1) — pure, unit-testable.
 *
 * Operate on a selection of ≥2 (align) / ≥3 (distribute) elements and return a
 * map of id → new {x, y}. Only the moved axis changes; the other is preserved,
 * so alignment never has surprising side effects. Callers apply the result
 * through the history layer as one undo step.
 */
import type { Rect } from './geometry'
import { unionBounds } from './geometry'

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type DistributeAxis = 'h' | 'v'

export interface AlignItem extends Rect {
  id: string
}

export function alignElements(
  items: AlignItem[],
  edge: AlignEdge,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (items.length < 2) return out
  const b = unionBounds(items)
  for (const it of items) {
    let { x, y } = it
    switch (edge) {
      case 'left':
        x = b.x
        break
      case 'hcenter':
        x = b.x + b.w / 2 - it.w / 2
        break
      case 'right':
        x = b.x + b.w - it.w
        break
      case 'top':
        y = b.y
        break
      case 'vcenter':
        y = b.y + b.h / 2 - it.h / 2
        break
      case 'bottom':
        y = b.y + b.h - it.h
        break
    }
    out.set(it.id, { x: Math.round(x), y: Math.round(y) })
  }
  return out
}

/**
 * Even-spacing distribution: the two outermost elements stay put and the rest
 * are spread so the gaps between consecutive boxes are equal. Needs ≥3 items;
 * with fewer it returns an empty map (nothing to distribute).
 */
export function distributeElements(
  items: AlignItem[],
  axis: DistributeAxis,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (items.length < 3) return out

  const horizontal = axis === 'h'
  const sorted = [...items].sort((a, b) =>
    horizontal ? a.x + a.w / 2 - (b.x + b.w / 2) : a.y + a.h / 2 - (b.y + b.h / 2),
  )

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const start = horizontal ? first.x : first.y
  const end = horizontal ? last.x + last.w : last.y + last.h
  const span = end - start
  const sizeSum = sorted.reduce((s, it) => s + (horizontal ? it.w : it.h), 0)
  const gap = (span - sizeSum) / (sorted.length - 1)

  let cursor = start
  for (const it of sorted) {
    if (horizontal) {
      out.set(it.id, { x: Math.round(cursor), y: it.y })
      cursor += it.w + gap
    } else {
      out.set(it.id, { x: it.x, y: Math.round(cursor) })
      cursor += it.h + gap
    }
  }
  // pin the outer two exactly to avoid rounding drift
  out.set(first.id, { x: first.x, y: first.y })
  out.set(last.id, { x: last.x, y: last.y })
  return out
}

/**
 * Pure geometry helpers for the slide canvas (Phase 1).
 *
 * Extracted from PresentationWorkspace so the tricky pointer/resize/bounds math
 * is side-effect-free and unit-testable in the node vitest environment. The
 * React canvas calls these; it never re-implements the math inline.
 *
 * Coordinate space is slide space (0..SLIDE_W, 0..SLIDE_H), not screen pixels —
 * the canvas divides pointer deltas by the zoom scale before calling in.
 */
import { SLIDE_H, SLIDE_W, type PresentElement } from './presentModel'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export const MIN_W = 8
export const MIN_H = 8

/** Keep at least 8px of the element on the slide so it can never be lost. */
export function clampPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  slideW = SLIDE_W,
  slideH = SLIDE_H,
): { x: number; y: number } {
  const margin = 8
  return {
    x: Math.round(Math.min(slideW - margin, Math.max(margin - w, x))),
    y: Math.round(Math.min(slideH - margin, Math.max(margin - h, y))),
  }
}

/** Union bounding box of a set of rects (empty → zero rect). */
export function unionBounds(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function rectOf(el: Pick<PresentElement, 'x' | 'y' | 'w' | 'h'>): Rect {
  return { x: el.x, y: el.y, w: el.w, h: el.h }
}

/** Do two rects overlap at all? (used for marquee selection) */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Normalize a drag from anchor→cursor into a positive-size rect. */
export function marqueeRect(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  }
}

export interface ResizeOptions {
  /** lock aspect ratio to the original (Shift) */
  aspect?: boolean
  /** resize symmetrically around the element center (Alt/Option) */
  fromCenter?: boolean
  minW?: number
  minH?: number
}

/**
 * Resize `orig` by dragging `handle` a slide-space delta of (dx, dy).
 * Handles the eight edge/corner handles, optional aspect-lock and
 * resize-from-center, and clamps to a minimum size without letting the box
 * invert. Returns a fresh rect — never mutates.
 */
export function resizeRect(
  orig: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  opts: ResizeOptions = {},
): Rect {
  const minW = opts.minW ?? MIN_W
  const minH = opts.minH ?? MIN_H
  const west = handle === 'nw' || handle === 'w' || handle === 'sw'
  const east = handle === 'ne' || handle === 'e' || handle === 'se'
  const north = handle === 'nw' || handle === 'n' || handle === 'ne'
  const south = handle === 'sw' || handle === 's' || handle === 'se'

  let { x, y, w, h } = orig

  if (opts.fromCenter) {
    // grow/shrink both sides symmetrically
    if (east) w = orig.w + dx * 2
    if (west) w = orig.w - dx * 2
    if (south) h = orig.h + dy * 2
    if (north) h = orig.h - dy * 2
    w = Math.max(minW, w)
    h = Math.max(minH, h)
    if (opts.aspect) ({ w, h } = applyAspect(orig, w, h, handle))
    x = orig.x + orig.w / 2 - w / 2
    y = orig.y + orig.h / 2 - h / 2
    return round({ x, y, w, h })
  }

  if (east) w = Math.max(minW, orig.w + dx)
  if (west) {
    w = Math.max(minW, orig.w - dx)
    x = orig.x + (orig.w - w)
  }
  if (south) h = Math.max(minH, orig.h + dy)
  if (north) {
    h = Math.max(minH, orig.h - dy)
    y = orig.y + (orig.h - h)
  }

  if (opts.aspect) {
    const scaled = applyAspect(orig, w, h, handle)
    // re-anchor west/north edges after aspect adjustment
    if (west) x = orig.x + (orig.w - scaled.w)
    if (north) y = orig.y + (orig.h - scaled.h)
    w = scaled.w
    h = scaled.h
  }

  return round({ x, y, w, h })
}

function applyAspect(
  orig: Rect,
  w: number,
  h: number,
  handle: ResizeHandle,
): { w: number; h: number } {
  const ratio = orig.h === 0 ? 1 : orig.w / orig.h
  const horizontalOnly = handle === 'e' || handle === 'w'
  const verticalOnly = handle === 'n' || handle === 's'
  if (horizontalOnly) return { w, h: w / ratio }
  if (verticalOnly) return { w: h * ratio, h }
  // corner: drive by the larger relative change
  if (Math.abs(w - orig.w) >= Math.abs(h - orig.h)) return { w, h: w / ratio }
  return { w: h * ratio, h }
}

function round(r: Rect): Rect {
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }
}

/**
 * Rewrite z so it is contiguous 0..n-1 in current paint order — call after
 * any layer op so front/back stay meaningful and gaps/collisions don't
 * accumulate (audit DM-8). Returns id → new z.
 */
export function normalizedZ(elements: PresentElement[]): Map<string, number> {
  const ordered = [...elements].sort((a, b) => a.z - b.z || 0)
  const out = new Map<string, number>()
  ordered.forEach((el, i) => out.set(el.id, i))
  return out
}

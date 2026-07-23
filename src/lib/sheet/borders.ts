import type { CellBorders } from './sheetModel'

/**
 * Cell borders over a rectangle.
 *
 * Borders are the one formatting property that depends on WHERE a cell
 * sits in the selection: "outline" draws the outer edge of the block, so
 * the top row gets a top border and only the last column gets a right one.
 * That makes it a range operation rather than a per-cell style patch,
 * which is why it lives here instead of riding on applyStyle.
 *
 * Pure and store-free so the edge rules stay testable.
 */

export type BorderKind = 'all' | 'outline' | 'none'

export interface BorderRect {
  r1: number
  c1: number
  r2: number
  c2: number
}

export interface BorderPatch {
  r: number
  c: number
  /** undefined clears the cell's borders */
  bd: CellBorders | undefined
}

/**
 * Per-cell border sides for applying `kind` across `rect`. Returns an entry
 * for every cell in the rectangle, so callers can patch styles uniformly.
 */
export function computeBorders(rect: BorderRect, kind: BorderKind): BorderPatch[] {
  const out: BorderPatch[] = []
  const r1 = Math.min(rect.r1, rect.r2)
  const r2 = Math.max(rect.r1, rect.r2)
  const c1 = Math.min(rect.c1, rect.c2)
  const c2 = Math.max(rect.c1, rect.c2)

  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      if (kind === 'none') {
        out.push({ r, c, bd: undefined })
        continue
      }
      if (kind === 'all') {
        out.push({ r, c, bd: { t: true, r: true, b: true, l: true } })
        continue
      }
      // outline: only the sides that fall on the block's edge
      const bd: CellBorders = {}
      if (r === r1) bd.t = true
      if (r === r2) bd.b = true
      if (c === c1) bd.l = true
      if (c === c2) bd.r = true
      out.push({ r, c, bd: Object.keys(bd).length ? bd : undefined })
    }
  }
  return out
}

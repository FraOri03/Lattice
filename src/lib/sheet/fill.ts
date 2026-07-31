import type { CellData } from './sheetModel'
import { cellKey } from './sheetModel'
import { translateFormula } from './FormulaEngine'

/**
 * Fill-handle logic: dragging the corner of a selection to extend its
 * pattern into neighbouring cells.
 *
 * This is the "trascinamento" half of copying formulas — the same rule as
 * paste, applied cell by cell. A source cell tiles into the target along
 * one axis, and any formula it carries is translated by how far it moved,
 * so dragging =A1+1 down yields =A2+1, =A3+1, … while $A$1 stays put.
 *
 * Pure and store-free so the tiling and translation stay testable without
 * the grid.
 */

export interface FillRect {
  r1: number
  c1: number
  r2: number
  c2: number
}

export interface FillWrite {
  r: number
  c: number
  cell: CellData | null
}

/** Positive modulo, so tiling works when the fill runs up or left. */
const mod = (n: number, m: number): number => ((n % m) + m) % m

/**
 * The cells to write when `source` is dragged to cover `target`.
 *
 * `target` must contain `source` and extend it along exactly one axis (the
 * caller derives it from the drag). Only the cells OUTSIDE the source are
 * returned — the source itself is left untouched. Each target cell copies
 * the source cell one block back along the fill axis, translating formulas
 * by the offset; an empty source cell clears the target (returning null).
 */
export function computeFill(
  cells: Record<string, CellData>,
  source: FillRect,
  target: FillRect,
  bounds: { rows: number; cols: number },
): FillWrite[] {
  const vertical = target.r1 < source.r1 || target.r2 > source.r2
  const srcRows = source.r2 - source.r1 + 1
  const srcCols = source.c2 - source.c1 + 1
  const writes: FillWrite[] = []

  for (let r = target.r1; r <= target.r2; r++) {
    for (let c = target.c1; c <= target.c2; c++) {
      // leave the source block itself alone
      const inSource =
        r >= source.r1 && r <= source.r2 && c >= source.c1 && c <= source.c2
      if (inSource) continue

      // map back into the source block along the fill axis
      const srcR = vertical ? source.r1 + mod(r - source.r1, srcRows) : r
      const srcC = vertical ? c : source.c1 + mod(c - source.c1, srcCols)
      const src = cells[cellKey(srcR, srcC)]

      if (!src) {
        writes.push({ r, c, cell: null })
        continue
      }

      const dr = r - srcR
      const dc = c - srcC
      const next: CellData = { ...src }
      if (src.f !== undefined && (dr || dc)) {
        next.f = translateFormula(src.f, dr, dc, bounds)
        // the cached value is stale after translation; the engine recomputes
        delete next.c
      }
      writes.push({ r, c, cell: next })
    }
  }
  return writes
}

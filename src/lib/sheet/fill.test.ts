import { describe, expect, it } from 'vitest'
import { computeFill, type FillRect } from './fill'
import { cellKey, type CellData } from './sheetModel'

/**
 * Fill-handle tiling and formula translation. This is the drag half of
 * "copia e trascinamento delle formule": the same reference rules as
 * paste, applied as a source block tiles into the dragged area.
 */

function cellsOf(map: Record<string, string | number>): Record<string, CellData> {
  const out: Record<string, CellData> = {}
  for (const [ref, raw] of Object.entries(map)) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!
    const c = m[1].split('').reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1
    const r = Number(m[2]) - 1
    out[cellKey(r, c)] =
      typeof raw === 'string' && raw.startsWith('=') ? { f: raw.slice(1) } : { v: raw }
  }
  return out
}

const rect = (r1: number, c1: number, r2: number, c2: number): FillRect => ({ r1, c1, r2, c2 })
const bounds = { rows: 100, cols: 26 }

/** Fill written as a { "r:c": formula-or-value } map, for compact assertions. */
function fillMap(
  cells: Record<string, string | number>,
  source: FillRect,
  target: FillRect,
) {
  const writes = computeFill(cellsOf(cells), source, target, bounds)
  const out: Record<string, unknown> = {}
  for (const w of writes) out[`${w.r}:${w.c}`] = w.cell === null ? null : (w.cell.f ?? w.cell.v)
  return out
}

describe('computeFill', () => {
  it('translates a formula as it fills down', () => {
    // A1==A2+1 dragged down becomes A3+1, A4+1 (relative ref follows)
    const out = fillMap({ B1: '=A1+1' }, rect(0, 1, 0, 1), rect(0, 1, 2, 1))
    expect(out).toEqual({ '1:1': 'A2+1', '2:1': 'A3+1' })
  })

  it('translates a formula as it fills right', () => {
    const out = fillMap({ A1: '=A2*2' }, rect(0, 0, 0, 0), rect(0, 0, 0, 2))
    expect(out).toEqual({ '0:1': 'B2*2', '0:2': 'C2*2' })
  })

  it('keeps anchored references fixed while filling', () => {
    const out = fillMap({ B1: '=A1*$C$1' }, rect(0, 1, 0, 1), rect(0, 1, 2, 1))
    expect(out).toEqual({ '1:1': 'A2*$C$1', '2:1': 'A3*$C$1' })
  })

  it('copies a literal value unchanged', () => {
    const out = fillMap({ A1: 7 }, rect(0, 0, 0, 0), rect(0, 0, 2, 0))
    expect(out).toEqual({ '1:0': 7, '2:0': 7 })
  })

  it('leaves the source block untouched', () => {
    const writes = computeFill(cellsOf({ A1: '=B1' }), rect(0, 0, 0, 0), rect(0, 0, 3, 0), bounds)
    expect(writes.every((w) => w.r > 0)).toBe(true)
    expect(writes).toHaveLength(3)
  })

  it('tiles a multi-cell source pattern', () => {
    // a 2-row source repeats every 2 rows as it fills down
    const out = fillMap({ A1: 1, A2: 2 }, rect(0, 0, 1, 0), rect(0, 0, 5, 0))
    expect(out).toEqual({ '2:0': 1, '3:0': 2, '4:0': 1, '5:0': 2 })
  })

  it('tiles formulas by translating from the block cell they map to', () => {
    // source A1=B1, A2=B2; row 3 maps back to A1 (+2), row 4 to A2 (+2)
    const out = fillMap({ A1: '=B1', A2: '=B2' }, rect(0, 0, 1, 0), rect(0, 0, 3, 0))
    expect(out).toEqual({ '2:0': 'B3', '3:0': 'B4' })
  })

  it('clears the target when the source cell is empty', () => {
    const out = fillMap({ A1: 5 }, rect(0, 0, 1, 0), rect(0, 0, 3, 0))
    // A2 is empty, so filling repeats [A1, empty] → row2=A1(5), row3=empty
    expect(out).toEqual({ '2:0': 5, '3:0': null })
  })

  it('fills upward, tiling from the block', () => {
    const out = fillMap({ A3: '=B3' }, rect(2, 0, 2, 0), rect(0, 0, 2, 0))
    expect(out).toEqual({ '0:0': 'B1', '1:0': 'B2' })
  })

  it('drops the stale cached value so the engine recomputes', () => {
    const cells = cellsOf({ B1: '=A1+1' })
    cells[cellKey(0, 1)].c = 99 // pretend a cached result is present
    const writes = computeFill(cells, rect(0, 1, 0, 1), rect(0, 1, 1, 1), bounds)
    expect(writes[0].cell?.c).toBeUndefined()
    expect(writes[0].cell?.f).toBe('A2+1')
  })

  it('turns an off-grid reference into #REF! at the boundary', () => {
    // A1 references the row above it; filling to row 0 pushes it off-grid
    const out = fillMap({ A2: '=A1' }, rect(1, 0, 1, 0), rect(0, 0, 1, 0))
    expect(out).toEqual({ '0:0': '#REF!' })
  })
})

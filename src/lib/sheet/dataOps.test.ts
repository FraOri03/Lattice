import { describe, expect, it } from 'vitest'
import {
  findReplaceInRange,
  removeDuplicateRows,
  sortRows,
  usedRange,
  type CellWrite,
  type DataRect,
} from './dataOps'
import { cellKey, type CellData } from './sheetModel'

/**
 * Sort / de-duplicate / find & replace. The load-bearing rule is that rows
 * physically move, so formulas must travel with their references intact —
 * otherwise sorting a column of =A1*2 silently repoints every formula.
 */

function cellsOf(map: Record<string, string | number | boolean>): Record<string, CellData> {
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

const rect = (r1: number, c1: number, r2: number, c2: number): DataRect => ({ r1, c1, r2, c2 })
const bounds = { rows: 100, cols: 26 }

/** Writes as a { "r:c": value-or-formula } map for compact assertions. */
function asMap(writes: CellWrite[]) {
  const out: Record<string, unknown> = {}
  for (const w of writes) out[`${w.r}:${w.c}`] = w.cell === null ? null : (w.cell.f ?? w.cell.v)
  return out
}

/** Just the values of one column, top to bottom. */
function column(writes: CellWrite[], c: number) {
  return writes
    .filter((w) => w.c === c)
    .sort((a, b) => a.r - b.r)
    .map((w) => (w.cell === null ? null : (w.cell.f ?? w.cell.v)))
}

describe('sortRows', () => {
  it('sorts a column ascending', () => {
    const writes = sortRows(cellsOf({ A1: 3, A2: 1, A3: 2 }), rect(0, 0, 2, 0), 0, 'asc', bounds)
    expect(column(writes, 0)).toEqual([1, 2, 3])
  })

  it('sorts descending', () => {
    const writes = sortRows(cellsOf({ A1: 3, A2: 1, A3: 2 }), rect(0, 0, 2, 0), 0, 'desc', bounds)
    expect(column(writes, 0)).toEqual([3, 2, 1])
  })

  it('carries the whole row along, not just the sorted column', () => {
    const cells = cellsOf({ A1: 2, B1: 'two', A2: 1, B2: 'one' })
    const writes = sortRows(cells, rect(0, 0, 1, 1), 0, 'asc', bounds)
    expect(asMap(writes)).toEqual({ '0:0': 1, '0:1': 'one', '1:0': 2, '1:1': 'two' })
  })

  it('translates formulas by how far the row moved', () => {
    // B1 = A1*2, B2 = A2*2; sorting swaps the rows, so the formulas must
    // follow their own row rather than keep pointing at the old one
    const cells = cellsOf({ A1: 9, B1: '=A1*2', A2: 5, B2: '=A2*2' })
    const writes = sortRows(cells, rect(0, 0, 1, 1), 0, 'asc', bounds)
    expect(asMap(writes)).toEqual({ '0:0': 5, '0:1': 'A1*2', '1:0': 9, '1:1': 'A2*2' })
  })

  it('keeps anchored references fixed while rows move', () => {
    const cells = cellsOf({ A1: 2, B1: '=$C$1', A2: 1, B2: '=$C$1' })
    const writes = sortRows(cells, rect(0, 0, 1, 1), 0, 'asc', bounds)
    expect(column(writes, 1)).toEqual(['$C$1', '$C$1'])
  })

  it('sinks blanks to the bottom in both directions', () => {
    const cells = cellsOf({ A1: 2, A3: 1 }) // A2 blank
    expect(column(sortRows(cells, rect(0, 0, 2, 0), 0, 'asc', bounds), 0)).toEqual([1, 2, null])
    expect(column(sortRows(cells, rect(0, 0, 2, 0), 0, 'desc', bounds), 0)).toEqual([2, 1, null])
  })

  it('orders numbers before text', () => {
    const cells = cellsOf({ A1: 'b', A2: 2, A3: 'a' })
    expect(column(sortRows(cells, rect(0, 0, 2, 0), 0, 'asc', bounds), 0)).toEqual([2, 'a', 'b'])
  })

  it('is stable for equal keys', () => {
    const cells = cellsOf({ A1: 1, B1: 'first', A2: 1, B2: 'second' })
    const writes = sortRows(cells, rect(0, 0, 1, 1), 0, 'asc', bounds)
    expect(column(writes, 1)).toEqual(['first', 'second'])
  })

  it('can sort by a column other than the first', () => {
    const cells = cellsOf({ A1: 'x', B1: 2, A2: 'y', B2: 1 })
    const writes = sortRows(cells, rect(0, 0, 1, 1), 1, 'asc', bounds)
    expect(column(writes, 0)).toEqual(['y', 'x'])
  })
})

describe('removeDuplicateRows', () => {
  it('keeps the first occurrence and closes the gap', () => {
    const cells = cellsOf({ A1: 'a', A2: 'b', A3: 'a', A4: 'c' })
    const { writes, removed } = removeDuplicateRows(cells, rect(0, 0, 3, 0), bounds)
    expect(removed).toBe(1)
    expect(column(writes, 0)).toEqual(['a', 'b', 'c', null])
  })

  it('compares whole rows, not single cells', () => {
    // same first column, different second → not duplicates
    const cells = cellsOf({ A1: 'a', B1: 1, A2: 'a', B2: 2 })
    const { removed } = removeDuplicateRows(cells, rect(0, 0, 1, 1), bounds)
    expect(removed).toBe(0)
  })

  it('reports nothing removed when all rows are unique', () => {
    const { removed } = removeDuplicateRows(
      cellsOf({ A1: 1, A2: 2 }),
      rect(0, 0, 1, 0),
      bounds,
    )
    expect(removed).toBe(0)
  })

  it('translates formulas on surviving rows that moved up', () => {
    const cells = cellsOf({ A1: 'dup', A2: 'dup', A3: 'keep', B3: '=A3' })
    const { writes } = removeDuplicateRows(cells, rect(0, 0, 2, 1), bounds)
    // "keep" moves from row 3 to row 2, so its formula follows
    expect(asMap(writes)['1:1']).toBe('A2')
  })
})

describe('usedRange', () => {
  it('covers every non-empty cell', () => {
    expect(usedRange(cellsOf({ B2: 1, D5: 2 }))).toEqual({ r1: 1, c1: 1, r2: 4, c2: 3 })
  })

  it('is null for an empty sheet', () => {
    expect(usedRange({})).toBeNull()
  })
})

describe('findReplaceInRange', () => {
  it('replaces text in string cells and counts them', () => {
    const cells = cellsOf({ A1: 'foo bar', A2: 'baz', A3: 'foo' })
    const { writes, count } = findReplaceInRange(cells, rect(0, 0, 2, 0), 'foo', 'qux')
    expect(count).toBe(2)
    expect(asMap(writes)).toEqual({ '0:0': 'qux bar', '2:0': 'qux' })
  })

  it('is case-insensitive by default and exact with matchCase', () => {
    const cells = cellsOf({ A1: 'Foo' })
    expect(findReplaceInRange(cells, rect(0, 0, 0, 0), 'foo', 'x').count).toBe(1)
    expect(
      findReplaceInRange(cells, rect(0, 0, 0, 0), 'foo', 'x', { matchCase: true }).count,
    ).toBe(0)
  })

  it('replaces every occurrence in a cell', () => {
    const cells = cellsOf({ A1: 'a-a-a' })
    const { writes } = findReplaceInRange(cells, rect(0, 0, 0, 0), 'a', 'b')
    expect(asMap(writes)['0:0']).toBe('b-b-b')
  })

  it('leaves formulas alone unless explicitly included', () => {
    const cells = cellsOf({ A1: '=SUM(B1:B2)' })
    expect(findReplaceInRange(cells, rect(0, 0, 0, 0), 'SUM', 'MAX').count).toBe(0)
    const opted = findReplaceInRange(cells, rect(0, 0, 0, 0), 'SUM', 'MAX', {
      includeFormulas: true,
    })
    expect(opted.count).toBe(1)
    expect(asMap(opted.writes)['0:0']).toBe('MAX(B1:B2)')
  })

  it('does not search numbers, whose display depends on formatting', () => {
    const cells = cellsOf({ A1: 123 })
    expect(findReplaceInRange(cells, rect(0, 0, 0, 0), '2', '9').count).toBe(0)
  })

  it('is a no-op for an empty search term', () => {
    const cells = cellsOf({ A1: 'x' })
    expect(findReplaceInRange(cells, rect(0, 0, 0, 0), '', 'y').count).toBe(0)
  })
})

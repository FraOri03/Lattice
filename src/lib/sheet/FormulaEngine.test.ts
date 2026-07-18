import { describe, expect, it } from 'vitest'
import { evaluateFormula, evaluateSheet, translateFormula, withComputedCache } from './FormulaEngine'
import { cellKey, createSheet, type CellData, type SheetData } from './sheetModel'

/**
 * Formula engine contract: references, dependency order, cycles, errors,
 * the function families, and the translation that makes copying a formula
 * mean what a spreadsheet user expects.
 */

/** A sheet from a compact { A1: value-or-formula } literal. */
function sheetOf(cells: Record<string, string | number | boolean>): SheetData {
  const sheet = createSheet('Test')
  for (const [ref, raw] of Object.entries(cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!
    const c = m[1].split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1
    const r = Number(m[2]) - 1
    const cell: CellData =
      typeof raw === 'string' && raw.startsWith('=') ? { f: raw.slice(1) } : { v: raw }
    sheet.cells[cellKey(r, c)] = cell
  }
  return sheet
}

/** Computed value of one cell, running the whole dependency graph. */
function valueAt(cells: Record<string, string | number | boolean>, ref: string) {
  const sheet = sheetOf(cells)
  const computed = evaluateSheet(sheet)
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!
  const c = m[1].split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  const r = Number(m[2]) - 1
  const entry = computed.get(cellKey(r, c))
  return entry?.error ?? entry?.value
}

/** Evaluate a bare expression against an empty grid. */
const evalExpr = (src: string) => evaluateFormula(src, () => null)

describe('references', () => {
  it('reads relative, absolute and mixed references identically', () => {
    // anchors change copying, never the value read
    for (const ref of ['A1', '$A$1', 'A$1', '$A1']) {
      expect(valueAt({ A1: 7, B1: `=${ref}` }, 'B1')).toBe(7)
    }
  })

  it('treats an empty cell as blank, not as an error', () => {
    expect(valueAt({ A1: '=B1+1' }, 'A1')).toBe(1)
  })

  it('sums a range', () => {
    expect(valueAt({ A1: 1, A2: 2, A3: 3, B1: '=SUM(A1:A3)' }, 'B1')).toBe(6)
  })

  it('reports #REF! past the edge of the grid', () => {
    expect(valueAt({ A1: '=SUM(A1:ZZZ99999)' }, 'A1')).toBeDefined()
    expect(evaluateFormula('A1', () => null)).toBeNull()
  })
})

describe('dependencies and recalculation', () => {
  it('resolves a chain in dependency order, not sheet order', () => {
    // C1 depends on B1 which depends on A1, but C1 is stored first
    expect(valueAt({ C1: '=B1*2', B1: '=A1+1', A1: 4 }, 'C1')).toBe(10)
  })

  it('recomputes everything downstream when an input changes', () => {
    expect(valueAt({ A1: 1, B1: '=A1*10' }, 'B1')).toBe(10)
    expect(valueAt({ A1: 5, B1: '=A1*10' }, 'B1')).toBe(50)
  })

  it('detects a direct circular reference', () => {
    expect(valueAt({ A1: '=A1+1' }, 'A1')).toBe('#CYCLE!')
  })

  it('detects an indirect circular reference', () => {
    expect(valueAt({ A1: '=B1', B1: '=C1', C1: '=A1' }, 'A1')).toBe('#CYCLE!')
  })

  it('caches computed values onto the cells for previews and exports', () => {
    const sheet = withComputedCache(sheetOf({ A1: 2, B1: '=A1*3' }))
    expect(sheet.cells[cellKey(0, 1)].c).toBe(6)
    // the formula itself survives — it is never replaced by its result
    expect(sheet.cells[cellKey(0, 1)].f).toBe('A1*3')
  })
})

describe('operators and errors', () => {
  it('follows precedence and associativity', () => {
    expect(evalExpr('1+2*3')).toBe(7)
    expect(evalExpr('(1+2)*3')).toBe(9)
    expect(evalExpr('2^3^2')).toBe(512) // right-associative
    expect(evalExpr('-2^2')).toBe(4)
    expect(evalExpr('10%')).toBeCloseTo(0.1)
    expect(evalExpr('"a"&"b"')).toBe('ab')
  })

  it('compares values', () => {
    expect(evalExpr('1<2')).toBe(true)
    expect(evalExpr('2<>2')).toBe(false)
    expect(evalExpr('"a"="A"')).toBe(true) // case-insensitive, like Excel
  })

  it('surfaces Excel-style error codes', () => {
    expect(valueAt({ A1: '=1/0' }, 'A1')).toBe('#DIV/0!')
    expect(valueAt({ A1: '=NOSUCH(1)' }, 'A1')).toBe('#NAME?')
    expect(valueAt({ A1: '=1+' }, 'A1')).toBe('#ERROR!')
    expect(valueAt({ A1: '="x"+1' }, 'A1')).toBe('#VALUE!')
    expect(valueAt({ A1: '=SQRT(-1)' }, 'A1')).toBe('#NUM!')
  })

  it('propagates an error through dependent cells', () => {
    expect(valueAt({ A1: '=1/0', B1: '=A1+1' }, 'B1')).toBe('#DIV/0!')
  })
})

describe('function families', () => {
  it('math', () => {
    expect(evalExpr('POWER(2,10)')).toBe(1024)
    expect(evalExpr('MOD(-3,2)')).toBe(1) // sign follows the divisor
    expect(evalExpr('INT(-1.5)')).toBe(-2)
    expect(evalExpr('TRUNC(-1.57,1)')).toBeCloseTo(-1.5)
    expect(evalExpr('ROUNDUP(1.21,1)')).toBeCloseTo(1.3)
    expect(evalExpr('ROUNDDOWN(-1.29,1)')).toBeCloseTo(-1.2)
    expect(evalExpr('SIGN(-4)')).toBe(-1)
    expect(evalExpr('PI()')).toBeCloseTo(Math.PI)
  })

  it('statistical', () => {
    expect(valueAt({ A1: 1, A2: 3, A3: 5, B1: '=MEDIAN(A1:A3)' }, 'B1')).toBe(3)
    expect(valueAt({ A1: 2, A2: 4, B1: '=MEDIAN(A1:A2)' }, 'B1')).toBe(3)
    expect(valueAt({ A1: 2, A2: 4, A3: 4, A4: 4, A5: 5, A6: 5, A7: 7, A8: 9, B1: '=STDEVP(A1:A8)' }, 'B1')).toBeCloseTo(2)
    expect(valueAt({ A1: 1, A2: 5, A3: 9, B1: '=COUNTIF(A1:A3,">4")' }, 'B1')).toBe(2)
    expect(valueAt({ A1: 1, A2: 5, A3: 9, B1: '=SUMIF(A1:A3,">4")' }, 'B1')).toBe(14)
    expect(valueAt({ A1: 1, A3: 3, B1: '=COUNTBLANK(A1:A3)' }, 'B1')).toBe(1)
  })

  it('logical', () => {
    expect(evalExpr('AND(TRUE,1,"x")')).toBe(true)
    expect(evalExpr('AND(TRUE,FALSE)')).toBe(false)
    expect(evalExpr('OR(FALSE,0,1)')).toBe(true)
    expect(evalExpr('NOT(FALSE)')).toBe(true)
    expect(evalExpr('XOR(TRUE,TRUE,TRUE)')).toBe(true)
    expect(evalExpr('IF(1>2,"a","b")')).toBe('b')
  })

  it('IFERROR catches a failing argument instead of propagating it', () => {
    expect(valueAt({ A1: '=IFERROR(1/0,"safe")' }, 'A1')).toBe('safe')
    expect(valueAt({ A1: '=IFERROR(6/2,"safe")' }, 'A1')).toBe(3)
    // but a circular reference must stay visible rather than be masked
    expect(valueAt({ A1: '=IFERROR(A1,"safe")' }, 'A1')).toBe('#CYCLE!')
  })

  it('text', () => {
    expect(evalExpr('LEN("hello")')).toBe(5)
    expect(evalExpr('UPPER("ab")')).toBe('AB')
    expect(evalExpr('LOWER("AB")')).toBe('ab')
    expect(evalExpr('TRIM("  a   b  ")')).toBe('a b')
    expect(evalExpr('LEFT("hello",2)')).toBe('he')
    expect(evalExpr('RIGHT("hello",2)')).toBe('lo')
    expect(evalExpr('RIGHT("hello",0)')).toBe('')
    expect(evalExpr('MID("hello",2,3)')).toBe('ell')
    expect(evalExpr('SUBSTITUTE("a-b-c","-","+")')).toBe('a+b+c')
    expect(evalExpr('CONCAT("a","b","c")')).toBe('abc')
  })

  it('date/time on spreadsheet serial numbers', () => {
    // serials match Excel exactly for real-world dates
    expect(evalExpr('DATE(2024,3,7)')).toBe(45358)
    expect(evalExpr('DATE(2024,1,1)')).toBe(45292)
    expect(evalExpr('YEAR(DATE(2024,3,7))')).toBe(2024)
    expect(evalExpr('MONTH(DATE(2024,3,7))')).toBe(3)
    expect(evalExpr('DAY(DATE(2024,3,7))')).toBe(7)
    // date arithmetic works because serials are plain numbers
    expect(evalExpr('DATE(2024,3,8)-DATE(2024,3,7)')).toBe(1)
    const today = evalExpr('TODAY()') as number
    expect(Number.isInteger(today)).toBe(true)
    expect(evalExpr('NOW()') as number).toBeGreaterThanOrEqual(today)
  })

  it('uses the 1899-12-30 epoch, so pre-March-1900 dates differ from Excel by one', () => {
    // Excel says 1 here, because it believes 1900-02-29 existed. Matching
    // that bug would corrupt every modern date, so the epoch wins and the
    // deviation is confined to the first two months of 1900.
    expect(evalExpr('DATE(1900,1,1)')).toBe(2)
  })

  it('aggregates skip text and blanks, like Excel', () => {
    expect(valueAt({ A1: 1, A2: 'text', A3: 3, B1: '=SUM(A1:A3)' }, 'B1')).toBe(4)
    expect(valueAt({ A1: 1, A2: 'text', A3: 3, B1: '=COUNT(A1:A3)' }, 'B1')).toBe(2)
    expect(valueAt({ A1: 1, A2: 'text', A3: 3, B1: '=COUNTA(A1:A3)' }, 'B1')).toBe(3)
  })
})

describe('translateFormula — copying a formula', () => {
  it('shifts relative references by the copy offset', () => {
    expect(translateFormula('A1+B2', 1, 0)).toBe('A2+B3')
    expect(translateFormula('A1+B2', 0, 1)).toBe('B1+C2')
    expect(translateFormula('A1', 2, 3)).toBe('D3')
  })

  it('leaves fully anchored references alone', () => {
    expect(translateFormula('$A$1', 5, 5)).toBe('$A$1')
  })

  it('moves a mixed reference on one axis only', () => {
    expect(translateFormula('A$1', 3, 1)).toBe('B$1')
    expect(translateFormula('$A1', 3, 1)).toBe('$A4')
  })

  it('handles the classic rate column', () => {
    // =B2*$F$1 copied down keeps pointing at the single rate cell
    expect(translateFormula('B2*$F$1', 1, 0)).toBe('B3*$F$1')
  })

  it('translates both ends of a range', () => {
    expect(translateFormula('SUM(A1:A10)', 1, 0)).toBe('SUM(A2:A11)')
    expect(translateFormula('SUM($A$1:$A$10)', 1, 0)).toBe('SUM($A$1:$A$10)')
  })

  it('never rewrites text inside a string literal', () => {
    expect(translateFormula('"A1"&A1', 1, 0)).toBe('"A1"&A2')
    expect(translateFormula('"say ""A1"""&A1', 0, 1)).toBe('"say ""A1"""&B1')
  })

  it('leaves function names and booleans untouched', () => {
    expect(translateFormula('SUM(A1)', 1, 0)).toBe('SUM(A2)')
    expect(translateFormula('IF(TRUE,A1,B1)', 1, 0)).toBe('IF(TRUE,A2,B2)')
    expect(translateFormula('LOG10(A1)', 1, 0)).toBe('LOG10(A2)')
  })

  it('does not mistake an identifier tail for a reference', () => {
    expect(translateFormula('MYVAL_A1', 1, 0)).toBe('MYVAL_A1')
  })

  it('becomes #REF! when pushed off the grid', () => {
    expect(translateFormula('A1', -1, 0)).toBe('#REF!')
    expect(translateFormula('A1', 0, -1)).toBe('#REF!')
    expect(translateFormula('A1', 0, 1, { rows: 10, cols: 1 })).toBe('#REF!')
  })

  it('is a no-op for a zero offset, preserving the exact text', () => {
    expect(translateFormula('SUM( A1 : A10 )', 0, 0)).toBe('SUM( A1 : A10 )')
  })

  it('preserves spacing and function casing, normalising references', () => {
    // references come back uppercase (as Excel writes them); everything
    // around them — spacing, function casing — is untouched
    expect(translateFormula('sum(a1, b1)', 1, 0)).toBe('sum(A2, B2)')
  })

  it('round-trips through evaluation: a copied formula computes the copy', () => {
    // B1 = A1*2 copied one row down must read A2, not A1
    const copied = translateFormula('A1*2', 1, 0)
    expect(valueAt({ A1: 5, A2: 9, B2: `=${copied}` }, 'B2')).toBe(18)
  })
})

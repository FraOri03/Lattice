import { displayValueOf, parseRef, type SheetData } from '@/lib/sheet/sheetModel'

/**
 * Reading a spreadsheet range for a slide (19E.4).
 *
 * A chart on a slide points at a range — `Revenue!B2:E8` — and this is the
 * only place that turns such a pointer into numbers. It is pure, so the same
 * reference produces the same table in the editor, in a thumbnail and in an
 * export, and a chart can be re-read without a component being mounted.
 */

export interface ParsedRange {
  /** the sheet's name, when the reference names one */
  sheet?: string
  r0: number
  c0: number
  r1: number
  c1: number
}

/** `Revenue!B2:E8`, `B2:E8`, or a single cell. Null when it is not a range. */
export function parseRange(ref: string): ParsedRange | null {
  const trimmed = ref.trim()
  if (!trimmed) return null
  const bang = trimmed.lastIndexOf('!')
  const sheet = bang >= 0 ? trimmed.slice(0, bang).replace(/^'|'$/g, '') : undefined
  const body = bang >= 0 ? trimmed.slice(bang + 1) : trimmed
  const [a, b] = body.split(':')
  const start = parseRef(a ?? '')
  if (!start) return null
  const end = b ? parseRef(b) : start
  if (!end) return null
  return {
    ...(sheet ? { sheet } : {}),
    r0: Math.min(start.r, end.r),
    c0: Math.min(start.c, end.c),
    r1: Math.max(start.r, end.r),
    c1: Math.max(start.c, end.c),
  }
}

/** Render a parsed range back to A1 form, for labels and round-trips. */
export function formatRange(range: ParsedRange): string {
  const col = (c: number): string => {
    let s = ''
    let n = c
    do {
      s = String.fromCharCode(65 + (n % 26)) + s
      n = Math.floor(n / 26) - 1
    } while (n >= 0)
    return s
  }
  const body = `${col(range.c0)}${range.r0 + 1}:${col(range.c1)}${range.r1 + 1}`
  return range.sheet ? `${range.sheet}!${body}` : body
}

export interface RangeTable {
  /** every cell of the block, row by row, as displayed */
  rows: (string | number | boolean | null)[][]
}

/** Pull the block out of a sheet. Cells outside the data are simply empty. */
export function readRange(sheet: SheetData, range: ParsedRange): RangeTable {
  const rows: RangeTable['rows'] = []
  for (let r = range.r0; r <= range.r1; r++) {
    const row: RangeTable['rows'][number] = []
    for (let c = range.c0; c <= range.c1; c++) {
      row.push(displayValueOf(sheet.cells[`${r}:${c}`]))
    }
    rows.push(row)
  }
  return { rows }
}

export interface ChartData {
  /** the first column, used as the category axis */
  categories: string[]
  /** one entry per remaining column */
  series: { name: string; values: number[] }[]
}

const asNumber = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    // sheets hold "3 120" and "1,480" as text more often than anyone admits
    const n = Number(v.replace(/[\s,]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return 0
}

/**
 * Interpret a block as a chart: first row is the header, first column is the
 * category. It is the convention a person already uses when they lay a table
 * out to be charted, so it needs no configuration to be right most of the time
 * — and the range can always be moved when it is not.
 */
export function chartDataOf(table: RangeTable): ChartData {
  const [header = [], ...body] = table.rows
  const seriesNames = header.slice(1).map((h, i) => String(h ?? `Series ${i + 1}`))
  const categories = body.map((row) => String(row[0] ?? ''))
  const series = seriesNames.map((name, i) => ({
    name,
    values: body.map((row) => asNumber(row[i + 1])),
  }))
  return { categories, series }
}

/** True when there is nothing to draw — an empty range is not an error. */
export const isEmptyChart = (data: ChartData): boolean =>
  data.series.length === 0 || data.categories.length === 0

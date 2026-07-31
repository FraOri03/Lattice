/**
 * The canonical spreadsheet document format (SpreadsheetBody). Like rich
 * documents (Tiptap JSON) and code documents (plain text), the source of
 * truth is JSON — XLSX/CSV/ODS are import/export formats, never the
 * internal representation. Bodies live in the StorageProvider and are
 * lazy-loaded; the store only holds digested SpreadsheetDocMeta.
 */

/** Number display format for a cell. */
export type NumFmt =
  | 'general'
  | 'number'
  | 'integer'
  | 'percent'
  | 'currency'
  | 'date'
  | 'time'
  | 'datetime'

/** Which sides of a cell draw an explicit border. */
export interface CellBorders {
  t?: boolean
  r?: boolean
  b?: boolean
  l?: boolean
}

export interface CellStyle {
  /** bold */
  b?: boolean
  /** italic */
  i?: boolean
  /** underline */
  u?: boolean
  /** text color (css) */
  color?: string
  /** fill color (css) */
  bg?: string
  /** horizontal alignment */
  align?: 'left' | 'center' | 'right'
  /** vertical alignment */
  valign?: 'top' | 'middle' | 'bottom'
  /** wrap long text onto multiple lines */
  wrap?: boolean
  /** font family (css font-family value) */
  ff?: string
  /** font size in px */
  fs?: number
  fmt?: NumFmt
  /** decimal places for number/percent/currency (overrides the default 2) */
  dec?: number
  /** thousands grouping for the number format */
  thou?: boolean
  /** explicit borders; absent means only the default grid lines */
  bd?: CellBorders
}

export interface CellData {
  /** literal value (absent when the cell is formula-driven) */
  v?: string | number | boolean
  /** formula source without the leading '=' */
  f?: string
  /**
   * cached computed value of a formula cell, refreshed on every save so
   * previews/exports/digests never need the FormulaEngine
   */
  c?: string | number | boolean | null
  s?: CellStyle
}

/** One sheet (tab) inside a spreadsheet document. Cells are sparse. */
export interface SheetData {
  id: string
  name: string
  rows: number
  cols: number
  /** sparse cells keyed "row:col" (0-based) */
  cells: Record<string, CellData>
  /** column widths in px, keyed by column index (defaults elsewhere) */
  colW: Record<number, number>
  /** row heights in px, keyed by row index */
  rowH: Record<number, number>
}

export interface SpreadsheetBody {
  version: 1
  sheets: SheetData[]
}

export const DEFAULT_COL_W = 96
export const DEFAULT_ROW_H = 24
export const MIN_COL_W = 36
export const MIN_ROW_H = 18
export const DEFAULT_ROWS = 100
export const DEFAULT_COLS = 26
/** Import guardrails — beyond this a sheet is truncated (noted in the UI). */
export const MAX_ROWS = 5000
export const MAX_COLS = 256

/* ---------------- keys and A1 references ---------------- */

export const cellKey = (r: number, c: number): string => `${r}:${c}`

export function parseKey(key: string): { r: number; c: number } {
  const i = key.indexOf(':')
  return { r: Number(key.slice(0, i)), c: Number(key.slice(i + 1)) }
}

/** 0 → A, 25 → Z, 26 → AA … */
export function colName(c: number): string {
  let name = ''
  let n = c
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

/** A → 0, Z → 25, AA → 26 … */
export function colIndex(name: string): number {
  let n = 0
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** (0,0) → "A1" */
export const cellRef = (r: number, c: number): string => `${colName(c)}${r + 1}`

/** "B3" → {r:2, c:1}; returns null for invalid refs. */
export function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim())
  if (!m) return null
  return { r: Number(m[2]) - 1, c: colIndex(m[1]) }
}

/* ---------------- construction ---------------- */

let sheetSeq = 0
export function newSheetId(): string {
  return `s_${Date.now().toString(36)}${(sheetSeq++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 5)}`
}

export function createSheet(
  name: string,
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS,
): SheetData {
  return { id: newSheetId(), name, rows, cols, cells: {}, colW: {}, rowH: {} }
}

export function createBody(): SpreadsheetBody {
  return { version: 1, sheets: [createSheet('Sheet 1')] }
}

/** Defensive normalization for bodies read from storage / project files. */
export function normalizeBody(raw: unknown): SpreadsheetBody {
  const body = raw as SpreadsheetBody | undefined
  if (!body || !Array.isArray(body.sheets) || body.sheets.length === 0) {
    return createBody()
  }
  return body
}

/* ---------------- display values ---------------- */

/** The value a cell shows: cached computed result for formulas, else literal. */
export function displayValueOf(cell: CellData | undefined): string | number | boolean | null {
  if (!cell) return null
  if (cell.f !== undefined) return cell.c ?? null
  return cell.v ?? null
}

const nf = {
  number: new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  integer: new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }),
  percent: new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 2,
  }),
  currency: new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
  }),
  general: new Intl.NumberFormat(undefined, { maximumFractionDigits: 10 }),
  date: null,
  time: null,
  datetime: null,
}

/* serial-date helpers, matching the FormulaEngine epoch (1899-12-30). Kept
   inline so sheetModel stays free of a cycle with the engine. */
const SERIAL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000
const serialToDate = (serial: number): Date =>
  new Date(SERIAL_EPOCH_UTC + Math.round(serial * DAY_MS))
const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Number formatter honouring a decimals override and thousands toggle. */
function numberFormatter(base: NumFmt, dec?: number, thou?: boolean): Intl.NumberFormat {
  const opts: Intl.NumberFormatOptions = { useGrouping: thou ?? true }
  if (base === 'percent') opts.style = 'percent'
  if (base === 'currency') {
    opts.style = 'currency'
    opts.currency = 'EUR'
  }
  const digits = dec ?? (base === 'integer' ? 0 : 2)
  opts.minimumFractionDigits = digits
  opts.maximumFractionDigits = digits
  return new Intl.NumberFormat(undefined, opts)
}

/**
 * Format a raw display value using the cell's number format. The simple
 * two-argument form is kept for callers that only know the format id;
 * date/time/decimals/thousands need the full style, so pass it as the
 * optional third argument (formatCell does).
 */
export function formatValue(
  value: string | number | boolean | null,
  fmt: NumFmt = 'general',
  style?: CellStyle,
): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '#NUM!'
    if (fmt === 'date' || fmt === 'time' || fmt === 'datetime') {
      const d = serialToDate(value)
      const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
      const frac = value - Math.floor(value)
      const secs = Math.round(frac * 86_400)
      const time = `${pad2(Math.floor(secs / 3600) % 24)}:${pad2(Math.floor(secs / 60) % 60)}:${pad2(secs % 60)}`
      return fmt === 'date' ? date : fmt === 'time' ? time : `${date} ${time}`
    }
    if (fmt === 'general') return nf.general.format(value)
    if ((style?.dec === undefined && !style?.thou) || fmt === 'integer') {
      // fast path: the shared formatter covers the default cases
      if (style?.dec === undefined && style?.thou === undefined) return nf[fmt]!.format(value)
    }
    return numberFormatter(fmt, style?.dec, style?.thou).format(value)
  }
  return value
}

export function formatCell(cell: CellData | undefined): string {
  const v = displayValueOf(cell)
  if (typeof v === 'string' && v.startsWith('#')) return v // error codes as-is
  return formatValue(v, cell?.s?.fmt, cell?.s)
}

/**
 * Parse what the user typed into cell content: '=…' → formula, numeric
 * strings → numbers, TRUE/FALSE → booleans, anything else → text.
 */
export function parseCellInput(raw: string): Pick<CellData, 'v' | 'f'> | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (trimmed.startsWith('=') && trimmed.length > 1) return { f: trimmed.slice(1) }
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) return { v: Number(trimmed) }
  if (/^(true|false)$/i.test(trimmed)) return { v: trimmed.toLowerCase() === 'true' }
  return { v: raw }
}

/** What the formula bar / in-cell editor shows for a cell. */
export function editableTextOf(cell: CellData | undefined): string {
  if (!cell) return ''
  if (cell.f !== undefined) return `=${cell.f}`
  const v = cell.v
  if (v === undefined || v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

/* ---------------- digest (meta refresh on save) ---------------- */

export interface SheetDigest {
  sheetNames: string[]
  cellCount: number
  /** formatted values of the top-left corner of the first sheet, for cards */
  preview: string[][]
  snippet: string
}

const PREVIEW_ROWS = 8
const PREVIEW_COLS = 6

export function digestSpreadsheet(body: SpreadsheetBody): SheetDigest {
  let cellCount = 0
  for (const sheet of body.sheets) cellCount += Object.keys(sheet.cells).length

  const first = body.sheets[0]
  const preview: string[][] = []
  if (first) {
    for (let r = 0; r < Math.min(PREVIEW_ROWS, first.rows); r++) {
      const row: string[] = []
      for (let c = 0; c < Math.min(PREVIEW_COLS, first.cols); c++) {
        row.push(formatCell(first.cells[cellKey(r, c)]))
      }
      preview.push(row)
    }
  }
  const snippet = preview
    .flat()
    .filter(Boolean)
    .slice(0, 12)
    .join(' · ')
    .slice(0, 200)

  return {
    sheetNames: body.sheets.map((s) => s.name),
    cellCount,
    preview,
    snippet,
  }
}

/* ---------------- immutable sheet operations ---------------- */

function replaceSheet(
  body: SpreadsheetBody,
  index: number,
  sheet: SheetData,
): SpreadsheetBody {
  const sheets = body.sheets.slice()
  sheets[index] = sheet
  return { ...body, sheets }
}

export function setCell(
  body: SpreadsheetBody,
  sheetIndex: number,
  r: number,
  c: number,
  cell: CellData | null,
): SpreadsheetBody {
  const sheet = body.sheets[sheetIndex]
  const key = cellKey(r, c)
  const cells = { ...sheet.cells }
  if (cell === null) delete cells[key]
  else cells[key] = cell
  return replaceSheet(body, sheetIndex, { ...sheet, cells })
}

/** Apply a style patch to every cell in the rectangle (creating cells). */
export function patchStyleRange(
  body: SpreadsheetBody,
  sheetIndex: number,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  patch: Partial<CellStyle>,
): SpreadsheetBody {
  const sheet = body.sheets[sheetIndex]
  const cells = { ...sheet.cells }
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      const key = cellKey(r, c)
      const prev = cells[key] ?? {}
      const s: CellStyle = { ...prev.s, ...patch }
      // drop cleared style entries so empty styled cells can vanish again
      for (const k of Object.keys(s) as (keyof CellStyle)[]) {
        if (s[k] === undefined || s[k] === false) delete s[k]
      }
      const next: CellData = { ...prev }
      if (Object.keys(s).length) next.s = s
      else delete next.s
      if (Object.keys(next).length) cells[key] = next
      else delete cells[key]
    }
  }
  return replaceSheet(body, sheetIndex, { ...sheet, cells })
}

/** Clear cell CONTENTS in the rectangle; formatting stays (Excel Delete). */
export function clearRange(
  body: SpreadsheetBody,
  sheetIndex: number,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): SpreadsheetBody {
  const sheet = body.sheets[sheetIndex]
  const cells = { ...sheet.cells }
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      const key = cellKey(r, c)
      const prev = cells[key]
      if (!prev) continue
      if (prev.s) cells[key] = { s: prev.s }
      else delete cells[key]
    }
  }
  return replaceSheet(body, sheetIndex, { ...sheet, cells })
}

export function resizeCol(
  body: SpreadsheetBody,
  sheetIndex: number,
  c: number,
  w: number,
): SpreadsheetBody {
  const sheet = body.sheets[sheetIndex]
  return replaceSheet(body, sheetIndex, {
    ...sheet,
    colW: { ...sheet.colW, [c]: Math.max(MIN_COL_W, Math.round(w)) },
  })
}

export function resizeRow(
  body: SpreadsheetBody,
  sheetIndex: number,
  r: number,
  h: number,
): SpreadsheetBody {
  const sheet = body.sheets[sheetIndex]
  return replaceSheet(body, sheetIndex, {
    ...sheet,
    rowH: { ...sheet.rowH, [r]: Math.max(MIN_ROW_H, Math.round(h)) },
  })
}

/* ---------------- formula reference shifting ---------------- */

/**
 * Rewrite A1-style references in a formula after a row/column insert or
 * delete: refs at/after the change point shift by delta; refs to a deleted
 * row/column become #REF!. String literals are left untouched.
 */
export function shiftFormulaRefs(
  formula: string,
  axis: 'row' | 'col',
  at: number,
  delta: 1 | -1,
): string {
  // split out string literals so refs inside "…" survive verbatim
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) => {
      if (i % 2 === 1) return part // quoted segment
      return part.replace(
        /(?<![A-Za-z0-9_$])(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g,
        (whole, d1: string, col: string, d2: string, row: string) => {
          const pos = axis === 'row' ? Number(row) - 1 : colIndex(col)
          if (pos < at) return whole
          if (delta === -1 && pos === at) return '#REF!'
          const next = pos + delta
          if (axis === 'row') return `${d1}${col}${d2}${next + 1}`
          return `${d1}${colName(next)}${d2}${row}`
        },
      )
    })
    .join('')
}

function remapIndexMap(
  map: Record<number, number>,
  at: number,
  delta: 1 | -1,
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [k, v] of Object.entries(map)) {
    const i = Number(k)
    if (i < at) out[i] = v
    else if (delta === 1) out[i + 1] = v
    else if (i > at) out[i - 1] = v // i === at is dropped on delete
  }
  return out
}

function remapSheetCells(
  sheet: SheetData,
  axis: 'row' | 'col',
  at: number,
  delta: 1 | -1,
): Record<string, CellData> {
  const cells: Record<string, CellData> = {}
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const { r, c } = parseKey(key)
    const pos = axis === 'row' ? r : c
    if (delta === -1 && pos === at) continue // deleted line
    let nr = r
    let nc = c
    if (pos >= at) {
      if (axis === 'row') nr = r + delta
      else nc = c + delta
    }
    const next: CellData = { ...cell }
    if (next.f !== undefined) next.f = shiftFormulaRefs(next.f, axis, at, delta)
    cells[cellKey(nr, nc)] = next
  }
  return cells
}

function shiftLines(
  body: SpreadsheetBody,
  sheetIndex: number,
  axis: 'row' | 'col',
  at: number,
  delta: 1 | -1,
): SpreadsheetBody {
  const sheet = body.sheets[sheetIndex]
  const next: SheetData = {
    ...sheet,
    rows: axis === 'row' ? Math.max(1, sheet.rows + delta) : sheet.rows,
    cols: axis === 'col' ? Math.max(1, sheet.cols + delta) : sheet.cols,
    cells: remapSheetCells(sheet, axis, at, delta),
    rowH: axis === 'row' ? remapIndexMap(sheet.rowH, at, delta) : sheet.rowH,
    colW: axis === 'col' ? remapIndexMap(sheet.colW, at, delta) : sheet.colW,
  }
  return replaceSheet(body, sheetIndex, next)
}

export const insertRow = (b: SpreadsheetBody, s: number, at: number) =>
  shiftLines(b, s, 'row', at, 1)
export const deleteRow = (b: SpreadsheetBody, s: number, at: number) =>
  b.sheets[s].rows > 1 ? shiftLines(b, s, 'row', at, -1) : b
export const insertCol = (b: SpreadsheetBody, s: number, at: number) =>
  shiftLines(b, s, 'col', at, 1)
export const deleteCol = (b: SpreadsheetBody, s: number, at: number) =>
  b.sheets[s].cols > 1 ? shiftLines(b, s, 'col', at, -1) : b

/* ---------------- sheet (tab) operations ---------------- */

export function addSheet(body: SpreadsheetBody): SpreadsheetBody {
  const base = `Sheet ${body.sheets.length + 1}`
  let name = base
  let n = body.sheets.length + 1
  while (body.sheets.some((s) => s.name === name)) name = `Sheet ${++n}`
  return { ...body, sheets: [...body.sheets, createSheet(name)] }
}

export function renameSheet(
  body: SpreadsheetBody,
  index: number,
  name: string,
): SpreadsheetBody {
  const trimmed = name.trim()
  if (!trimmed) return body
  const sheets = body.sheets.slice()
  sheets[index] = { ...sheets[index], name: trimmed }
  return { ...body, sheets }
}

export function deleteSheet(body: SpreadsheetBody, index: number): SpreadsheetBody {
  if (body.sheets.length <= 1) return body
  return { ...body, sheets: body.sheets.filter((_, i) => i !== index) }
}

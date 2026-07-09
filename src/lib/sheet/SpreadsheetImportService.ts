/**
 * SpreadsheetImportService: CSV/TSV/XLS/XLSX/ODS → SpreadsheetBody (the
 * canonical JSON format) via SheetJS. Loaded lazily (dynamic import from
 * ImportService) so SheetJS never enters the main bundle.
 *
 * The original file is always preserved as the source asset by the caller
 * (same contract as DOCX/ODT/RTF → RichTextDocument).
 */

import * as XLSX from 'xlsx'
import type {
  CellData,
  CellStyle,
  NumFmt,
  SheetData,
  SpreadsheetBody,
} from './sheetModel'
import { cellKey, MAX_COLS, MAX_ROWS, newSheetId } from './sheetModel'
import { withComputedCache } from './FormulaEngine'

export const SPREADSHEET_IMPORT_EXTS = ['csv', 'tsv', 'xls', 'xlsx', 'ods']

/** Column width: Excel "characters" → px (SheetJS wch heuristic). */
const wchToPx = (wch: number): number => Math.round(wch * 7 + 12)

/** Map an Excel number-format string onto our coarse NumFmt buckets. */
function numFmtOf(z: string | undefined): NumFmt | undefined {
  if (!z || z === 'General') return undefined
  if (z.includes('%')) return 'percent'
  if (/[€$£¥]|\[\$/.test(z)) return 'currency'
  if (/0\.0|#\.0|\.0+/.test(z)) return 'number'
  if (/^#?,?#*0$/.test(z.replace(/[^#0,.]/g, ''))) return 'integer'
  return undefined
}

function importCell(raw: XLSX.CellObject): CellData | null {
  const cell: CellData = {}

  if (typeof raw.f === 'string' && raw.f.length) {
    cell.f = raw.f
  }

  switch (raw.t) {
    case 'n':
      if (cell.f !== undefined) cell.c = raw.v as number
      else cell.v = raw.v as number
      break
    case 'b':
      if (cell.f !== undefined) cell.c = raw.v as boolean
      else cell.v = raw.v as boolean
      break
    case 'd': {
      // dates arrive as JS Dates when cellDates is on — store ISO text
      const iso =
        raw.v instanceof Date ? raw.v.toISOString().slice(0, 10) : String(raw.v)
      if (cell.f !== undefined) cell.c = iso
      else cell.v = iso
      break
    }
    case 's': {
      const s = String(raw.v ?? '')
      if (cell.f !== undefined) cell.c = s
      else if (s !== '') cell.v = s
      break
    }
    case 'e':
      if (cell.f !== undefined) cell.c = String(raw.w ?? '#ERROR!')
      else cell.v = String(raw.w ?? '#ERROR!')
      break
    case 'z':
    default:
      break
  }

  const fmt = numFmtOf(raw.z as string | undefined)
  if (fmt) {
    const s: CellStyle = { fmt }
    cell.s = s
  }

  if (cell.v === undefined && cell.f === undefined) return null
  return cell
}

function importWorksheet(name: string, ws: XLSX.WorkSheet): SheetData {
  const ref = ws['!ref']
  const range = ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }
  const rows = Math.min(Math.max(range.e.r + 1, 20), MAX_ROWS)
  const cols = Math.min(Math.max(range.e.c + 1, 8), MAX_COLS)

  const cells: Record<string, CellData> = {}
  for (const [addr, raw] of Object.entries(ws)) {
    if (addr.startsWith('!')) continue
    const pos = XLSX.utils.decode_cell(addr)
    if (pos.r >= rows || pos.c >= cols) continue // truncated beyond guardrails
    const cell = importCell(raw as XLSX.CellObject)
    if (cell) cells[cellKey(pos.r, pos.c)] = cell
  }

  const colW: Record<number, number> = {}
  ws['!cols']?.forEach((info, i) => {
    if (!info || i >= cols) return
    if (typeof info.wpx === 'number') colW[i] = Math.round(info.wpx)
    else if (typeof info.wch === 'number') colW[i] = wchToPx(info.wch)
  })

  const rowH: Record<number, number> = {}
  ws['!rows']?.forEach((info, i) => {
    if (!info || i >= rows) return
    if (typeof info.hpx === 'number') rowH[i] = Math.round(info.hpx)
  })

  return { id: newSheetId(), name, rows, cols, cells, colW, rowH }
}

/**
 * Parse a spreadsheet file into the canonical JSON body. Formula strings
 * are preserved where the format carries them (XLSX/ODS); every sheet is
 * evaluated once so cached computed values are fresh regardless.
 */
export async function importSpreadsheet(file: Blob): Promise<SpreadsheetBody> {
  const wb = XLSX.read(await file.arrayBuffer(), {
    cellFormula: true,
    cellNF: true,
    cellDates: true,
    dense: false,
  })
  if (!wb.SheetNames.length) throw new Error('No sheets found in this file')

  const sheets = wb.SheetNames.map((name) => {
    const sheet = importWorksheet(name, wb.Sheets[name])
    try {
      return withComputedCache(sheet)
    } catch {
      return sheet // formulas beyond the engine keep their imported cache
    }
  })
  return { version: 1, sheets }
}

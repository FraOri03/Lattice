/**
 * SpreadsheetExportService: SpreadsheetBody (canonical JSON) → CSV / XLSX /
 * JSON downloads. Loaded lazily with the rest of the sheet chunk so SheetJS
 * stays out of the main bundle.
 */

import * as XLSX from 'xlsx'
import type { SpreadsheetDocMeta } from '@/types/model'
import { storage } from '@/lib/storage/StorageProvider'
import { downloadBlob, downloadText, slugify } from '@/lib/download'
import type { NumFmt, SheetData, SpreadsheetBody } from './sheetModel'
import { cellKey, displayValueOf, normalizeBody } from './sheetModel'

export type SheetExportFormat = 'xlsx' | 'csv' | 'json'

export interface SheetExportFormatInfo {
  format: SheetExportFormat
  label: string
  note?: string
}

export const SHEET_EXPORT_FORMATS: SheetExportFormatInfo[] = [
  { format: 'xlsx', label: 'Excel (.xlsx)', note: 'values + formulas; cell colors are not written' },
  { format: 'csv', label: 'CSV (.csv)', note: 'active sheet only, computed values' },
  { format: 'json', label: 'JSON (.json)', note: 'the canonical Lattice body' },
]

const NUMFMT_TO_Z: Record<NumFmt, string | undefined> = {
  general: undefined,
  number: '#,##0.00',
  integer: '#,##0',
  date: 'yyyy-mm-dd',
  time: 'hh:mm:ss',
  datetime: 'yyyy-mm-dd hh:mm:ss',
  percent: '0.00%',
  currency: '#,##0.00 "€"',
}

function toWorksheet(sheet: SheetData): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}
  let maxR = 0
  let maxC = 0
  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      const cell = sheet.cells[cellKey(r, c)]
      if (!cell) continue
      const value = displayValueOf(cell)
      if (value === null && cell.f === undefined) continue
      maxR = Math.max(maxR, r)
      maxC = Math.max(maxC, c)
      const out: XLSX.CellObject = { t: 's', v: '' }
      if (typeof value === 'number') {
        out.t = 'n'
        out.v = value
      } else if (typeof value === 'boolean') {
        out.t = 'b'
        out.v = value
      } else {
        out.t = 's'
        out.v = value ?? ''
      }
      if (cell.f !== undefined) out.f = cell.f
      const z = cell.s?.fmt ? NUMFMT_TO_Z[cell.s.fmt] : undefined
      if (z) out.z = z
      ws[XLSX.utils.encode_cell({ r, c })] = out
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
  const cols: XLSX.ColInfo[] = []
  for (const [i, w] of Object.entries(sheet.colW)) cols[Number(i)] = { wpx: w }
  if (cols.length) ws['!cols'] = cols
  const rows: XLSX.RowInfo[] = []
  for (const [i, h] of Object.entries(sheet.rowH)) rows[Number(i)] = { hpx: h }
  if (rows.length) ws['!rows'] = rows
  return ws
}

async function loadBody(meta: SpreadsheetDocMeta): Promise<SpreadsheetBody> {
  return normalizeBody(await storage.getDocument(meta.id))
}

/**
 * Export a spreadsheet document. `activeSheet` selects the sheet for CSV
 * (which is single-sheet by nature); XLSX/JSON always carry the whole
 * workbook.
 */
export async function exportSpreadsheet(
  meta: SpreadsheetDocMeta,
  format: SheetExportFormat,
  activeSheet = 0,
): Promise<void> {
  const body = await loadBody(meta)
  const name = slugify(meta.title)

  switch (format) {
    case 'xlsx': {
      const wb = XLSX.utils.book_new()
      for (const sheet of body.sheets) {
        // XLSX sheet names: ≤31 chars, no : \ / ? * [ ]
        const safe = sheet.name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet'
        XLSX.utils.book_append_sheet(wb, toWorksheet(sheet), safe)
      }
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
      downloadBlob(
        `${name}.xlsx`,
        new Blob([out], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      )
      return
    }
    case 'csv': {
      const sheet = body.sheets[activeSheet] ?? body.sheets[0]
      const csv = XLSX.utils.sheet_to_csv(toWorksheet(sheet))
      downloadText(`${name}.csv`, csv, 'text/csv')
      return
    }
    case 'json': {
      downloadText(`${name}.json`, JSON.stringify(body, null, 2), 'application/json')
      return
    }
  }
}

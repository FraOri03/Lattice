import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { importSpreadsheet } from './SpreadsheetImportService'
import { cellKey } from './sheetModel'

/**
 * XLSX round-trip for formulas (#9: "compatibilità con import/export
 * XLSX, nei limiti del formato"). A formula must survive as a FORMULA,
 * not be flattened to its computed value — that is the whole point of
 * persisting `.f`. CSV cannot carry formulas at all, so it is out of
 * scope here by nature of the format.
 */

/**
 * Build a one-sheet XLSX blob with a literal and a formula cell. jsdom's
 * Blob lacks arrayBuffer(), so we hand importSpreadsheet the minimal
 * Blob-shaped object it actually uses.
 */
function xlsxBlob(): Blob {
  const ws: XLSX.WorkSheet = {
    A1: { t: 'n', v: 5 },
    A2: { t: 'n', v: 9 },
    B1: { t: 'n', v: 10, f: 'A1*2' }, // formula with a cached value
    '!ref': 'A1:B2',
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return { arrayBuffer: async () => out } as unknown as Blob
}

describe('XLSX import preserves formulas', () => {
  it('keeps the formula rather than flattening it to a value', async () => {
    const body = await importSpreadsheet(xlsxBlob())
    const sheet = body.sheets[0]
    const b1 = sheet.cells[cellKey(0, 1)]
    expect(b1.f).toBe('A1*2')
    // and the engine recomputes it from the imported inputs
    expect(b1.c).toBe(10)
  })

  it('keeps literal inputs intact', async () => {
    const body = await importSpreadsheet(xlsxBlob())
    const sheet = body.sheets[0]
    expect(sheet.cells[cellKey(0, 0)].v).toBe(5)
    expect(sheet.cells[cellKey(1, 0)].v).toBe(9)
  })
})

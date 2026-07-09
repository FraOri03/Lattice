import { useEffect, useMemo, useState } from 'react'
import { storage } from '@/lib/storage/StorageProvider'
import {
  cellKey,
  colName,
  DEFAULT_COL_W,
  formatValue,
  normalizeBody,
  type SpreadsheetBody,
} from '@/lib/sheet/sheetModel'
import { evaluateSheet } from '@/lib/sheet/FormulaEngine'

const MAX_MINI_ROWS = 100
const MAX_MINI_COLS = 26

/**
 * Read-only workbook preview for expanded board cards: loads the body
 * lazily from the StorageProvider, evaluates formulas, renders a plain
 * scrollable table (capped at 100×26) with a mini tab strip to flip
 * between sheets. Default export: lazy-loaded with the sheet chunk.
 */
export default function SheetMiniGrid({ sheetId }: { sheetId: string }) {
  const [body, setBody] = useState<SpreadsheetBody | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let alive = true
    setBody(null)
    setIndex(0)
    void storage
      .getDocument(sheetId)
      .then((raw) => {
        if (alive) setBody(normalizeBody(raw))
      })
      .catch(() => {
        if (alive) setBody(normalizeBody(undefined))
      })
    return () => {
      alive = false
    }
  }, [sheetId])

  const sheet = body?.sheets[Math.min(index, (body?.sheets.length ?? 1) - 1)]
  const computed = useMemo(
    () => (sheet ? evaluateSheet(sheet) : new Map()),
    [sheet],
  )

  if (!body || !sheet) return <div className="placeholder">Loading spreadsheet…</div>

  const rows = Math.min(sheet.rows, MAX_MINI_ROWS)
  const cols = Math.min(sheet.cols, MAX_MINI_COLS)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="nowheel min-h-0 flex-1 overflow-auto">
        <table className="sheet-mini">
          <thead>
            <tr>
              <th />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} style={{ minWidth: Math.min(sheet.colW[c] ?? DEFAULT_COL_W, 160) }}>
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th>{r + 1}</th>
                {Array.from({ length: cols }, (_, c) => {
                  const key = cellKey(r, c)
                  const cell = sheet.cells[key]
                  if (!cell) return <td key={c} />
                  const comp = cell.f !== undefined ? computed.get(key) : undefined
                  const value =
                    cell.f !== undefined
                      ? (comp?.error ?? comp?.value ?? null)
                      : (cell.v ?? null)
                  const s = cell.s
                  return (
                    <td
                      key={c}
                      style={{
                        fontWeight: s?.b ? 700 : undefined,
                        fontStyle: s?.i ? 'italic' : undefined,
                        color: comp?.error ? '#f24822' : s?.color,
                        background: s?.bg,
                        textAlign: s?.align ?? (typeof value === 'number' ? 'right' : 'left'),
                      }}
                    >
                      {comp?.error ?? formatValue(value, s?.fmt)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {body.sheets.length > 1 && (
        <div className="flex flex-none items-center gap-0.5 overflow-x-auto border-t border-bord bg-panel2 px-1 py-0.5">
          {body.sheets.map((s, i) => (
            <button
              key={s.id}
              className={`sheet-tab ${i === index ? 'is-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setIndex(i)
              }}
            >
              <span className="max-w-24 truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

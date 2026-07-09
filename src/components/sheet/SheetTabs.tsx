import { useMemo, useState } from 'react'
import { cellKey, displayValueOf } from '@/lib/sheet/sheetModel'
import { IcPlus, IcX } from '@/components/Icons'
import { rectOf, useSheetSession } from './SheetSession'

/** Sum / average / count of the numeric cells in the current selection. */
function SelectionStats() {
  const { sheet, selection, computed } = useSheetSession()
  const stats = useMemo(() => {
    const { r1, c1, r2, c2 } = rectOf(selection)
    if ((r2 - r1 + 1) * (c2 - c1 + 1) > 100_000) return null
    let sum = 0
    let count = 0
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const key = cellKey(r, c)
        const cell = sheet.cells[key]
        if (!cell) continue
        const v =
          cell.f !== undefined
            ? (computed.get(key)?.error ?? computed.get(key)?.value ?? null)
            : displayValueOf(cell)
        if (typeof v === 'number') {
          sum += v
          count++
        }
      }
    }
    return count > 1 ? { sum, avg: sum / count, count } : null
  }, [sheet.cells, selection, computed])

  if (!stats) return null
  const f = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n)
  return (
    <span className="flex-none px-2 text-[10.5px] text-muted">
      Sum {f(stats.sum)} · Avg {f(stats.avg)} · Count {stats.count}
    </span>
  )
}

/**
 * Bottom strip: one tab per sheet (click to switch, double-click to
 * rename, ✕ to delete), a + button, and Excel-style selection stats.
 */
export function SheetTabs() {
  const {
    body,
    sheetIndex,
    readOnly,
    setSheetIndex,
    addSheetTab,
    renameSheetTab,
    deleteSheetTab,
  } = useSheetSession()
  const [renaming, setRenaming] = useState<number | null>(null)

  return (
    <div className="flex flex-none items-center gap-0.5 overflow-x-auto border-t border-bord bg-panel2 px-1 py-0.5">
      {body.sheets.map((s, i) => (
        <div
          key={s.id}
          className={`sheet-tab ${i === sheetIndex ? 'is-active' : ''}`}
          onClick={() => setSheetIndex(i)}
          onDoubleClick={() => !readOnly && setRenaming(i)}
          title={readOnly ? s.name : `${s.name} — double-click to rename`}
        >
          {renaming === i ? (
            <input
              className="w-24 bg-transparent text-[11.5px] outline-none"
              defaultValue={s.name}
              autoFocus
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                renameSheetTab(i, e.target.value)
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <span className="max-w-32 truncate">{s.name}</span>
          )}
          {!readOnly && body.sheets.length > 1 && i === sheetIndex && renaming !== i && (
            <button
              className="icon-btn h-4 w-4"
              title="Delete sheet"
              onClick={(e) => {
                e.stopPropagation()
                const hasData = Object.keys(s.cells).length > 0
                if (!hasData || confirm(`Delete sheet "${s.name}" and its data?`))
                  deleteSheetTab(i)
              }}
            >
              <IcX size={9} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button className="icon-btn h-5 w-5 flex-none" title="Add sheet" onClick={addSheetTab}>
          <IcPlus size={11} />
        </button>
      )}
      <div className="min-w-2 flex-1" />
      <SelectionStats />
    </div>
  )
}

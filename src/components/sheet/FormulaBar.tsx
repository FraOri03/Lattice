import { useEffect, useRef, useState } from 'react'
import { cellKey, cellRef, editableTextOf } from '@/lib/sheet/sheetModel'
import { rectOf, useSheetSession } from './SheetSession'

/**
 * Excel-style formula bar: name box with the active cell/range reference
 * and an input mirroring the active cell's editable text (formulas keep
 * their leading '='). Enter commits, Escape reverts.
 */
export function FormulaBar() {
  const { sheet, selection, active, readOnly, commitInput, editing } = useSheetSession()
  const cell = sheet.cells[cellKey(active.r, active.c)]
  const cellText = editableTextOf(cell)

  const [draft, setDraft] = useState(cellText)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // follow the selection unless the user is typing here
  useEffect(() => {
    if (!focused) setDraft(cellText)
  }, [cellText, focused, active.r, active.c])

  const rect = rectOf(selection)
  const refLabel =
    rect.r1 === rect.r2 && rect.c1 === rect.c2
      ? cellRef(active.r, active.c)
      : `${cellRef(rect.r1, rect.c1)}:${cellRef(rect.r2, rect.c2)}`

  return (
    <div className="flex flex-none items-center gap-2 border-b border-bord bg-panel px-2 py-1">
      <span
        className="w-20 flex-none rounded border border-bord bg-panel2 px-1.5 py-0.5 text-center font-mono text-[11px] text-muted"
        title="Active cell"
      >
        {refLabel}
      </span>
      <span className="flex-none text-[11px] text-muted italic select-none">fx</span>
      <input
        ref={inputRef}
        className="min-w-0 flex-1 bg-transparent font-mono text-[12px] outline-none"
        value={editing ? '(editing in cell…)' : draft}
        disabled={readOnly || !!editing}
        placeholder="Type a value, or =SUM(A1:B3)"
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitInput(active, draft)
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(cellText)
            inputRef.current?.blur()
          }
        }}
      />
    </div>
  )
}

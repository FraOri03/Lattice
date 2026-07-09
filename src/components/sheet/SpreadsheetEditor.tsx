import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  cellKey,
  colName,
  DEFAULT_COL_W,
  DEFAULT_ROW_H,
  editableTextOf,
  formatValue,
  type CellData,
} from '@/lib/sheet/sheetModel'
import { rectOf, useSheetSession, type CellPos } from './SheetSession'

const HDR_W = 44
const HDR_H = 24
const OVERSCAN = 3

/** prefix sums: offsets[i] = top/left of line i; offsets[n] = total size */
function buildOffsets(
  count: number,
  sizes: Record<number, number>,
  fallback: number,
): number[] {
  const out = new Array<number>(count + 1)
  out[0] = 0
  for (let i = 0; i < count; i++) out[i + 1] = out[i] + (sizes[i] ?? fallback)
  return out
}

/** largest index i with offsets[i] <= px */
function lineAt(offsets: number[], px: number): number {
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= px) lo = mid
    else hi = mid - 1
  }
  return Math.min(lo, offsets.length - 2)
}

/** What a cell displays in the grid: live formula results beat the cache. */
function useDisplay() {
  const { computed } = useSheetSession()
  return useCallback(
    (cell: CellData | undefined, key: string): { text: string; error: boolean; num: boolean } => {
      if (!cell) return { text: '', error: false, num: false }
      let value: string | number | boolean | null
      if (cell.f !== undefined) {
        const comp = computed.get(key)
        value = comp ? (comp.error ?? comp.value) : null
        if (comp?.error) return { text: comp.error, error: true, num: false }
      } else {
        value = cell.v ?? null
      }
      return {
        text: formatValue(value, cell.s?.fmt),
        error: false,
        num: typeof value === 'number',
      }
    },
    [computed],
  )
}

/**
 * The editable grid: virtualized rows/columns, sticky headers, mouse+
 * keyboard selection, in-cell editing, row/column resizing, TSV
 * copy/cut/paste. All state comes from the SheetSession context.
 */
export function SpreadsheetEditor() {
  const session = useSheetSession()
  const {
    sheet,
    selection,
    active,
    editing,
    readOnly,
    select,
    startEdit,
    stopEdit,
    commitInput,
    clearSelection,
    applyStyle,
    setColWidth,
    setRowHeight,
    pasteMatrix,
  } = session
  const display = useDisplay()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const [view, setView] = useState({ w: 800, h: 500 })
  const dragging = useRef(false)

  const colOffsets = useMemo(
    () => buildOffsets(sheet.cols, sheet.colW, DEFAULT_COL_W),
    [sheet.cols, sheet.colW],
  )
  const rowOffsets = useMemo(
    () => buildOffsets(sheet.rows, sheet.rowH, DEFAULT_ROW_H),
    [sheet.rows, sheet.rowH],
  )
  const totalW = colOffsets[sheet.cols]
  const totalH = rowOffsets[sheet.rows]

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() =>
      setView({ w: el.clientWidth, h: el.clientHeight }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const up = () => {
      dragging.current = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const r0 = Math.max(0, lineAt(rowOffsets, scroll.top) - OVERSCAN)
  const r1 = Math.min(
    sheet.rows - 1,
    lineAt(rowOffsets, scroll.top + view.h) + OVERSCAN,
  )
  const c0 = Math.max(0, lineAt(colOffsets, scroll.left) - OVERSCAN)
  const c1 = Math.min(
    sheet.cols - 1,
    lineAt(colOffsets, scroll.left + view.w) + OVERSCAN,
  )
  const rect = rectOf(selection)

  /* ---------------- selection + editing ---------------- */

  const focusGrid = () => scrollRef.current?.focus()

  const cellMouseDown = (pos: CellPos, e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (editing) commitEdit()
    if (e.shiftKey) select({ anchor: selection.anchor, focus: pos })
    else {
      select({ anchor: pos, focus: pos })
      dragging.current = true
    }
    focusGrid()
    e.preventDefault()
  }

  const cellMouseEnter = (pos: CellPos) => {
    if (dragging.current) select({ anchor: selection.anchor, focus: pos })
  }

  const editValue = useRef('')
  const commitEdit = useCallback(
    (move?: { dr: number; dc: number }) => {
      if (!editing) return
      commitInput(editing.pos, editValue.current)
      stopEdit()
      if (move) {
        const next = {
          r: Math.max(0, Math.min(editing.pos.r + move.dr, sheet.rows - 1)),
          c: Math.max(0, Math.min(editing.pos.c + move.dc, sheet.cols - 1)),
        }
        select({ anchor: next, focus: next })
      }
      focusGrid()
    },
    [editing, commitInput, stopEdit, select, sheet.rows, sheet.cols],
  )

  const beginEdit = (pos: CellPos, initial?: string) => {
    if (readOnly) return
    const cell = sheet.cells[cellKey(pos.r, pos.c)]
    const text = initial ?? editableTextOf(cell)
    editValue.current = text
    startEdit(pos, text)
  }

  /* ---------------- clipboard ---------------- */

  const copySelection = useCallback(() => {
    const { r1: a, c1: b, r2: y, c2: x } = rectOf(selection)
    const lines: string[] = []
    for (let r = a; r <= y; r++) {
      const row: string[] = []
      for (let c = b; c <= x; c++) row.push(editableTextOf(sheet.cells[cellKey(r, c)]))
      lines.push(row.join('\t'))
    }
    void navigator.clipboard?.writeText(lines.join('\n')).catch(() => {})
  }, [selection, sheet.cells])

  const onPaste = (e: React.ClipboardEvent) => {
    if (editing || readOnly) return
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    e.preventDefault()
    const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
    pasteMatrix(rows)
  }

  /* ---------------- keyboard ---------------- */

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return // the in-cell input owns the keyboard
    const move = (dr: number, dc: number, extend: boolean) => {
      const base = extend ? selection.focus : selection.anchor
      const next = {
        r: Math.max(0, Math.min(base.r + dr, sheet.rows - 1)),
        c: Math.max(0, Math.min(base.c + dc, sheet.cols - 1)),
      }
      select(extend ? { anchor: selection.anchor, focus: next } : { anchor: next, focus: next })
      scrollCellIntoView(next)
      e.preventDefault()
    }
    switch (e.key) {
      case 'ArrowUp':
        return move(-1, 0, e.shiftKey)
      case 'ArrowDown':
        return move(1, 0, e.shiftKey)
      case 'ArrowLeft':
        return move(0, -1, e.shiftKey)
      case 'ArrowRight':
        return move(0, 1, e.shiftKey)
      case 'Tab':
        return move(0, e.shiftKey ? -1 : 1, false)
      case 'Enter':
      case 'F2':
        if (!readOnly) beginEdit(active)
        e.preventDefault()
        return
      case 'Delete':
      case 'Backspace':
        if (!readOnly) clearSelection()
        e.preventDefault()
        return
      case 'Home':
        return move(0, -sheet.cols, e.shiftKey)
      case 'End':
        return move(0, sheet.cols, e.shiftKey)
      default:
        break
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'c') {
        copySelection()
        e.preventDefault()
        return
      }
      if (k === 'x' && !readOnly) {
        copySelection()
        clearSelection()
        e.preventDefault()
        return
      }
      if (k === 'b' && !readOnly) {
        applyStyle({ b: !sheet.cells[cellKey(active.r, active.c)]?.s?.b })
        e.preventDefault()
        return
      }
      if (k === 'i' && !readOnly) {
        applyStyle({ i: !sheet.cells[cellKey(active.r, active.c)]?.s?.i })
        e.preventDefault()
        return
      }
      return // let the browser keep Ctrl+V (onPaste) etc.
    }
    // start editing by typing (printable single character)
    if (!readOnly && e.key.length === 1) {
      beginEdit(active, e.key)
      e.preventDefault()
    }
  }

  const scrollCellIntoView = (pos: CellPos) => {
    const el = scrollRef.current
    if (!el) return
    const x0 = colOffsets[pos.c]
    const x1 = colOffsets[pos.c + 1]
    const y0 = rowOffsets[pos.r]
    const y1 = rowOffsets[pos.r + 1]
    if (y0 < el.scrollTop) el.scrollTop = y0
    else if (y1 > el.scrollTop + el.clientHeight - HDR_H)
      el.scrollTop = y1 - el.clientHeight + HDR_H
    if (x0 < el.scrollLeft) el.scrollLeft = x0
    else if (x1 > el.scrollLeft + el.clientWidth - HDR_W)
      el.scrollLeft = x1 - el.clientWidth + HDR_W
  }

  /* ---------------- resizing ---------------- */

  const startResize = (
    e: React.MouseEvent,
    axis: 'col' | 'row',
    index: number,
  ) => {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    const startPx = axis === 'col' ? e.clientX : e.clientY
    const startSize =
      axis === 'col'
        ? (sheet.colW[index] ?? DEFAULT_COL_W)
        : (sheet.rowH[index] ?? DEFAULT_ROW_H)
    const onMove = (ev: MouseEvent) => {
      const delta = (axis === 'col' ? ev.clientX : ev.clientY) - startPx
      if (axis === 'col') setColWidth(index, startSize + delta)
      else setRowHeight(index, startSize + delta)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /* ---------------- render ---------------- */

  const colHdrs = []
  for (let c = c0; c <= c1; c++) {
    const hl = c >= rect.c1 && c <= rect.c2
    colHdrs.push(
      <div
        key={c}
        className={`sheet-hdr ${hl ? 'is-hl' : ''}`}
        style={{ left: colOffsets[c], width: colOffsets[c + 1] - colOffsets[c], height: HDR_H }}
        onMouseDown={(e) => {
          cellMouseDown({ r: 0, c }, e)
          select({ anchor: { r: 0, c }, focus: { r: sheet.rows - 1, c } })
          dragging.current = false
        }}
        title={`Column ${colName(c)}`}
      >
        {colName(c)}
        <div className="sheet-rz-x" onMouseDown={(e) => startResize(e, 'col', c)} />
      </div>,
    )
  }

  const rowHdrs = []
  for (let r = r0; r <= r1; r++) {
    const hl = r >= rect.r1 && r <= rect.r2
    rowHdrs.push(
      <div
        key={r}
        className={`sheet-hdr ${hl ? 'is-hl' : ''}`}
        style={{ top: rowOffsets[r], height: rowOffsets[r + 1] - rowOffsets[r], width: HDR_W }}
        onMouseDown={(e) => {
          cellMouseDown({ r, c: 0 }, e)
          select({ anchor: { r, c: 0 }, focus: { r, c: sheet.cols - 1 } })
          dragging.current = false
        }}
        title={`Row ${r + 1}`}
      >
        {r + 1}
        <div className="sheet-rz-y" onMouseDown={(e) => startResize(e, 'row', r)} />
      </div>,
    )
  }

  const cells = []
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const key = cellKey(r, c)
      const cell = sheet.cells[key]
      const { text, error, num } = display(cell, key)
      const inSel = r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2
      const isActive = r === active.r && c === active.c
      const s = cell?.s
      const style: CSSProperties = {
        left: colOffsets[c],
        top: rowOffsets[r],
        width: colOffsets[c + 1] - colOffsets[c],
        height: rowOffsets[r + 1] - rowOffsets[r],
        textAlign: s?.align ?? (num ? 'right' : 'left'),
      }
      if (s?.b) style.fontWeight = 700
      if (s?.i) style.fontStyle = 'italic'
      if (s?.color) style.color = s.color
      if (s?.bg) style.background = s.bg
      cells.push(
        <div
          key={key}
          className={`sheet-cell ${inSel ? 'is-sel' : ''} ${isActive ? 'is-active' : ''} ${error ? 'is-err' : ''}`}
          style={style}
          onMouseDown={(e) => cellMouseDown({ r, c }, e)}
          onMouseEnter={() => cellMouseEnter({ r, c })}
          onDoubleClick={() => beginEdit({ r, c })}
        >
          {text}
        </div>,
      )
    }
  }

  return (
    <div
      ref={scrollRef}
      className="sheet-scroll nodrag nowheel"
      tabIndex={0}
      onScroll={(e) =>
        setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })
      }
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    >
      <div
        className="sheet-canvas"
        style={{
          display: 'grid',
          gridTemplateColumns: `${HDR_W}px ${totalW}px`,
          gridTemplateRows: `${HDR_H}px ${totalH}px`,
        }}
      >
        <div
          className="sheet-corner"
          onClick={() =>
            select({
              anchor: { r: 0, c: 0 },
              focus: { r: sheet.rows - 1, c: sheet.cols - 1 },
            })
          }
          title="Select all"
        />
        <div className="sheet-hdr-strip-x" style={{ width: totalW, height: HDR_H }}>
          {colHdrs}
        </div>
        <div className="sheet-hdr-strip-y" style={{ width: HDR_W, height: totalH }}>
          {rowHdrs}
        </div>
        <div className="sheet-cells" style={{ width: totalW, height: totalH }}>
          {cells}
          {editing && (
            <input
              key={`${editing.pos.r}:${editing.pos.c}`}
              className="sheet-cell-input"
              style={{
                left: colOffsets[editing.pos.c],
                top: rowOffsets[editing.pos.r],
                width: Math.max(
                  colOffsets[editing.pos.c + 1] - colOffsets[editing.pos.c],
                  120,
                ),
                height: rowOffsets[editing.pos.r + 1] - rowOffsets[editing.pos.r],
              }}
              defaultValue={editing.initial}
              autoFocus
              onFocus={(e) => {
                editValue.current = e.target.value
                e.target.setSelectionRange(e.target.value.length, e.target.value.length)
              }}
              onChange={(e) => {
                editValue.current = e.target.value
              }}
              onBlur={() => commitEdit()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitEdit({ dr: 1, dc: 0 })
                } else if (e.key === 'Tab') {
                  e.preventDefault()
                  commitEdit({ dr: 0, dc: e.shiftKey ? -1 : 1 })
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  stopEdit()
                  focusGrid()
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

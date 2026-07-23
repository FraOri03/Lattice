import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import type { SpreadsheetDocMeta } from '@/types/model'
import {
  addSheet,
  cellKey,
  clearRange,
  deleteCol,
  deleteRow,
  deleteSheet,
  editableTextOf,
  insertCol,
  insertRow,
  normalizeBody,
  parseCellInput,
  patchStyleRange,
  renameSheet,
  resizeCol,
  resizeRow,
  setCell,
  type CellData,
  type CellStyle,
  type SheetData,
  type SpreadsheetBody,
} from '@/lib/sheet/sheetModel'
import {
  evaluateSheet,
  translateFormula,
  withComputedCache,
  type ComputedCell,
} from '@/lib/sheet/FormulaEngine'
import { computeFill } from '@/lib/sheet/fill'
import { computeBorders, type BorderKind } from '@/lib/sheet/borders'
import {
  findReplaceInRange,
  removeDuplicateRows,
  sortRows,
  usedRange,
  type FindReplaceOptions,
} from '@/lib/sheet/dataOps'
import { awareness } from '@/lib/crdt/AwarenessService'

export interface CellPos {
  r: number
  c: number
}

export interface Selection {
  anchor: CellPos
  focus: CellPos
}

export interface Rect {
  r1: number
  c1: number
  r2: number
  c2: number
}

export const rectOf = (sel: Selection): Rect => ({
  r1: Math.min(sel.anchor.r, sel.focus.r),
  c1: Math.min(sel.anchor.c, sel.focus.c),
  r2: Math.max(sel.anchor.r, sel.focus.r),
  c2: Math.max(sel.anchor.c, sel.focus.c),
})

export interface SheetSessionValue {
  sheetId: string
  meta: SpreadsheetDocMeta
  body: SpreadsheetBody
  /** active sheet (tab) */
  sheet: SheetData
  sheetIndex: number
  /** formula results for the active sheet, keyed "row:col" */
  computed: Map<string, ComputedCell>
  selection: Selection
  /** the active cell = selection anchor */
  active: CellPos
  editing: { pos: CellPos; initial: string } | null
  readOnly: boolean

  select: (sel: Selection) => void
  startEdit: (pos: CellPos, initial: string) => void
  stopEdit: () => void
  /** Parse raw user input and write it into a cell (style preserved). */
  commitInput: (pos: CellPos, raw: string) => void
  applyStyle: (patch: Partial<CellStyle>) => void
  clearSelection: () => void
  insertRowAt: (at: number) => void
  deleteRowAt: (at: number) => void
  insertColAt: (at: number) => void
  deleteColAt: (at: number) => void
  setColWidth: (c: number, w: number) => void
  setRowHeight: (r: number, h: number) => void
  setSheetIndex: (i: number) => void
  addSheetTab: () => void
  renameSheetTab: (i: number, name: string) => void
  deleteSheetTab: (i: number) => void
  /** rectangle of raw editable texts → cells starting at the active cell */
  /**
   * Write a block of text cells at the selection. `origin` is the top-left
   * of the block as it was COPIED: when present, formulas are translated
   * by the paste offset so relative references follow the copy. It is
   * omitted for text pasted from outside the app, which has no coordinates
   * to translate against.
   */
  pasteMatrix: (rows: string[][], origin?: { r: number; c: number }) => void
  /**
   * Fill-handle drag: tile `source` into `target` (which extends source
   * along one axis), translating formulas by how far each cell moved.
   */
  fillRange: (source: Rect, target: Rect) => void
  /** Copy the selection to the clipboard (TSV) and remember its origin. */
  copySelection: () => void
  /** Copy the selection, then clear it (cut). */
  cutSelection: () => void
  /**
   * The copy origin for `text` if it matches this session's last copy, so a
   * paste of our own block translates formulas; undefined for foreign text.
   */
  pasteOriginFor: (text: string) => { r: number; c: number } | undefined
  /**
   * Data operations over the selection. With a single cell selected they
   * act on the sheet's used range instead, since sorting one cell is
   * meaningless. Formulas travel with the rows they belong to.
   */
  sortSelection: (dir: 'asc' | 'desc') => void
  /** Drop duplicate rows; returns how many were removed. */
  removeDuplicates: () => number
  /** Replace text across the selection; returns how many cells changed. */
  findReplace: (find: string, replace: string, opts?: FindReplaceOptions) => number
  /** Draw borders over the selection ('all' | 'outline' | 'none'). */
  applyBorders: (kind: BorderKind) => void
}

const SheetSessionContext = createContext<SheetSessionValue | null>(null)

export function useSheetSession(): SheetSessionValue {
  const ctx = useContext(SheetSessionContext)
  if (!ctx) throw new Error('useSheetSession outside SheetSessionProvider')
  return ctx
}

const SAVE_DEBOUNCE_MS = 700

/**
 * Owns one editing session over a spreadsheet document: the lazily loaded
 * body, active sheet/tab, selection, in-cell editing state and the formula
 * results. Mutations update local state immediately and debounce-persist
 * through the store (which refreshes the digested meta). The workspace,
 * toolbar, formula bar, tabs, grid and inspector all consume this context.
 */
export function SheetSessionProvider({
  sheetId,
  readOnly = false,
  children,
}: {
  sheetId: string
  readOnly?: boolean
  children: ReactNode
}) {
  const meta = useStore((s) => s.sheetDocs[sheetId])
  const persistSheetBody = useStore((s) => s.persistSheetBody)

  const [body, setBody] = useState<SpreadsheetBody | null>(null)
  const [sheetIndex, setSheetIndexRaw] = useState(0)
  const [selection, setSelection] = useState<Selection>({
    anchor: { r: 0, c: 0 },
    focus: { r: 0, c: 0 },
  })
  const [editing, setEditing] = useState<{ pos: CellPos; initial: string } | null>(null)

  const saveTimer = useRef<number | undefined>(undefined)
  const pending = useRef<SpreadsheetBody | null>(null)
  /** top-left + text of the last in-app copy, shared by grid and toolbar */
  const copyOrigin = useRef<{ r: number; c: number; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    setBody(null)
    pending.current = null
    setSheetIndexRaw(0)
    setSelection({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } })
    setEditing(null)
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

  // presence: peers see which sheet + cell everyone is on (Phase 8)
  useEffect(() => {
    if (!body) return
    const sheetName = body.sheets[sheetIndex]?.name ?? ''
    awareness.setSheetCell({
      sheetId,
      sheetName,
      r: selection.anchor.r,
      c: selection.anchor.c,
    })
  }, [sheetId, body, sheetIndex, selection])
  useEffect(() => () => awareness.clearSheetCell(), [sheetId])

  const flush = useCallback(() => {
    if (pending.current === null) return
    window.clearTimeout(saveTimer.current)
    // refresh every sheet's computed cache so digests/exports stay honest
    const toSave: SpreadsheetBody = {
      ...pending.current,
      sheets: pending.current.sheets.map((s) => {
        try {
          return withComputedCache(s)
        } catch {
          return s
        }
      }),
    }
    pending.current = null
    persistSheetBody(sheetId, toSave)
  }, [persistSheetBody, sheetId])

  // flush unsaved edits when the session unmounts or the doc switches
  useEffect(() => flush, [flush])

  const updateBody = useCallback(
    (mut: (b: SpreadsheetBody) => SpreadsheetBody) => {
      if (readOnly) return
      setBody((prev) => {
        if (!prev) return prev
        const next = mut(prev)
        if (next === prev) return prev
        pending.current = next
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS)
        return next
      })
    },
    [flush, readOnly],
  )

  const safeIndex = body ? Math.min(sheetIndex, body.sheets.length - 1) : 0
  const sheet = body?.sheets[safeIndex]

  const computed = useMemo(
    () => (sheet ? evaluateSheet(sheet) : new Map<string, ComputedCell>()),
    [sheet],
  )

  const clampPos = useCallback(
    (pos: CellPos): CellPos => {
      if (!sheet) return { r: 0, c: 0 }
      return {
        r: Math.max(0, Math.min(pos.r, sheet.rows - 1)),
        c: Math.max(0, Math.min(pos.c, sheet.cols - 1)),
      }
    },
    [sheet],
  )

  const select = useCallback(
    (sel: Selection) =>
      setSelection({ anchor: clampPos(sel.anchor), focus: clampPos(sel.focus) }),
    [clampPos],
  )

  const setSheetIndex = useCallback((i: number) => {
    setSheetIndexRaw(i)
    setSelection({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } })
    setEditing(null)
  }, [])

  const value = useMemo<SheetSessionValue | null>(() => {
    if (!meta || !body || !sheet) return null
    const si = safeIndex

    const commitInput = (pos: CellPos, raw: string) => {
      updateBody((b) => {
        const prev = b.sheets[si].cells[cellKey(pos.r, pos.c)]
        const parsed = parseCellInput(raw)
        let cell: CellData | null
        if (!parsed) cell = prev?.s ? { s: prev.s } : null
        else cell = prev?.s ? { ...parsed, s: prev.s } : parsed
        return setCell(b, si, pos.r, pos.c, cell)
      })
    }

    /**
     * What a data operation acts on: the selection when it spans more than
     * one cell, otherwise the sheet's used range — sorting a single cell
     * would be a no-op, and "sort my table" is the obvious intent.
     */
    const dataTarget = () => {
      const sel = rectOf(selection)
      const single = sel.r1 === sel.r2 && sel.c1 === sel.c2
      const target = single ? usedRange(sheet.cells) : sel
      if (!target) return null
      const byCol = Math.min(Math.max(selection.anchor.c, target.c1), target.c2)
      return { rect: target, byCol, bounds: { rows: sheet.rows, cols: sheet.cols } }
    }

    /** Apply computed cell writes as one body update. */
    const applyWrites = (writes: { r: number; c: number; cell: CellData | null }[]) => {
      if (!writes.length) return
      updateBody((b) => {
        let next = b
        for (const w of writes) next = setCell(next, si, w.r, w.c, w.cell)
        return next
      })
    }

    const api: SheetSessionValue = {
      sheetId,
      meta,
      body,
      sheet,
      sheetIndex: si,
      computed,
      selection,
      active: selection.anchor,
      editing,
      readOnly,
      select,
      startEdit: (pos, initial) => {
        if (readOnly) return
        setSelection({ anchor: pos, focus: pos })
        setEditing({ pos, initial })
      },
      stopEdit: () => setEditing(null),
      commitInput,
      applyStyle: (patch) => {
        const { r1, c1, r2, c2 } = rectOf(selection)
        updateBody((b) => patchStyleRange(b, si, r1, c1, r2, c2, patch))
      },
      clearSelection: () => {
        const { r1, c1, r2, c2 } = rectOf(selection)
        updateBody((b) => clearRange(b, si, r1, c1, r2, c2))
      },
      insertRowAt: (at) => updateBody((b) => insertRow(b, si, at)),
      deleteRowAt: (at) => updateBody((b) => deleteRow(b, si, at)),
      insertColAt: (at) => updateBody((b) => insertCol(b, si, at)),
      deleteColAt: (at) => updateBody((b) => deleteCol(b, si, at)),
      setColWidth: (c, w) => updateBody((b) => resizeCol(b, si, c, w)),
      setRowHeight: (r, h) => updateBody((b) => resizeRow(b, si, r, h)),
      setSheetIndex,
      addSheetTab: () => {
        updateBody((b) => addSheet(b))
        setSheetIndexRaw(body.sheets.length) // jump to the new tab
      },
      renameSheetTab: (i, name) => updateBody((b) => renameSheet(b, i, name)),
      deleteSheetTab: (i) => {
        updateBody((b) => deleteSheet(b, i))
        setSheetIndexRaw((cur) => Math.max(0, cur > i ? cur - 1 : Math.min(cur, body.sheets.length - 2)))
      },
      pasteMatrix: (rows, origin) => {
        const start = selection.anchor
        // how far the block travelled; relative references follow it
        const dRow = origin ? start.r - origin.r : 0
        const dCol = origin ? start.c - origin.c : 0
        updateBody((b) => {
          let next = b
          for (let dr = 0; dr < rows.length; dr++) {
            for (let dc = 0; dc < rows[dr].length; dc++) {
              const r = start.r + dr
              const c = start.c + dc
              if (r >= next.sheets[si].rows || c >= next.sheets[si].cols) continue
              const prev = next.sheets[si].cells[cellKey(r, c)]
              let parsed = parseCellInput(rows[dr][dc])
              if (parsed?.f !== undefined && (dRow || dCol)) {
                parsed = {
                  ...parsed,
                  f: translateFormula(parsed.f, dRow, dCol, {
                    rows: next.sheets[si].rows,
                    cols: next.sheets[si].cols,
                  }),
                }
              }
              let cell: CellData | null
              if (!parsed) cell = prev?.s ? { s: prev.s } : null
              else cell = prev?.s ? { ...parsed, s: prev.s } : parsed
              next = setCell(next, si, r, c, cell)
            }
          }
          return next
        })
        const end = clampPos({
          r: start.r + rows.length - 1,
          c: start.c + Math.max(...rows.map((r) => r.length), 1) - 1,
        })
        setSelection({ anchor: start, focus: end })
      },
      fillRange: (source, target) => {
        const sheetNow = body.sheets[si]
        const src = {
          r1: Math.min(source.r1, source.r2),
          c1: Math.min(source.c1, source.c2),
          r2: Math.max(source.r1, source.r2),
          c2: Math.max(source.c1, source.c2),
        }
        const tgt = {
          r1: Math.max(0, Math.min(target.r1, target.r2)),
          c1: Math.max(0, Math.min(target.c1, target.c2)),
          r2: Math.min(sheetNow.rows - 1, Math.max(target.r1, target.r2)),
          c2: Math.min(sheetNow.cols - 1, Math.max(target.c1, target.c2)),
        }
        const writes = computeFill(sheetNow.cells, src, tgt, {
          rows: sheetNow.rows,
          cols: sheetNow.cols,
        })
        if (!writes.length) return
        updateBody((b) => {
          let next = b
          for (const w of writes) {
            const prev = next.sheets[si].cells[cellKey(w.r, w.c)]
            // keep the target cell's own styling; only the content fills
            let cell = w.cell
            if (cell && prev?.s) cell = { ...cell, s: prev.s }
            else if (!cell && prev?.s) cell = { s: prev.s }
            next = setCell(next, si, w.r, w.c, cell)
          }
          return next
        })
        setSelection({
          anchor: { r: tgt.r1, c: tgt.c1 },
          focus: { r: tgt.r2, c: tgt.c2 },
        })
      },
      copySelection: () => {
        const r = rectOf(selection)
        const lines: string[] = []
        for (let row = r.r1; row <= r.r2; row++) {
          const cols: string[] = []
          for (let col = r.c1; col <= r.c2; col++) {
            cols.push(editableTextOf(sheet.cells[cellKey(row, col)]))
          }
          lines.push(cols.join('\t'))
        }
        const text = lines.join('\n')
        copyOrigin.current = { r: r.r1, c: r.c1, text }
        void navigator.clipboard?.writeText(text).catch(() => {})
      },
      cutSelection: () => {
        api.copySelection()
        api.clearSelection()
      },
      pasteOriginFor: (text) => {
        const o = copyOrigin.current
        return o && o.text === text ? { r: o.r, c: o.c } : undefined
      },
      sortSelection: (dir) => {
        const target = dataTarget()
        if (!target) return
        const writes = sortRows(sheet.cells, target.rect, target.byCol, dir, target.bounds)
        applyWrites(writes)
      },
      removeDuplicates: () => {
        const target = dataTarget()
        if (!target) return 0
        const { writes, removed } = removeDuplicateRows(
          sheet.cells,
          target.rect,
          target.bounds,
        )
        if (removed) applyWrites(writes)
        return removed
      },
      applyBorders: (kind) => {
        const r = rectOf(selection)
        const patches = computeBorders(r, kind)
        updateBody((b) => {
          let next = b
          for (const p of patches) {
            const prev = next.sheets[si].cells[cellKey(p.r, p.c)]
            const style = { ...(prev?.s ?? {}) }
            if (p.bd) style.bd = p.bd
            else delete style.bd
            const hasStyle = Object.keys(style).length > 0
            // a border-only cell still needs a record to carry the style
            const cell = prev
              ? { ...prev, s: hasStyle ? style : undefined }
              : hasStyle
                ? { s: style }
                : null
            next = setCell(next, si, p.r, p.c, cell)
          }
          return next
        })
      },
      findReplace: (find, replace, opts) => {
        const target = dataTarget()
        if (!target) return 0
        const { writes, count } = findReplaceInRange(
          sheet.cells,
          target.rect,
          find,
          replace,
          opts,
        )
        if (count) applyWrites(writes)
        return count
      },
    }
    return api
  }, [
    meta,
    body,
    sheet,
    safeIndex,
    sheetId,
    computed,
    selection,
    editing,
    readOnly,
    select,
    setSheetIndex,
    updateBody,
    clampPos,
  ])

  if (!value) {
    return <div className="placeholder">Loading spreadsheet…</div>
  }
  return (
    <SheetSessionContext.Provider value={value}>{children}</SheetSessionContext.Provider>
  )
}

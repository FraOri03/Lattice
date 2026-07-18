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

    return {
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
    }
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

import { describe, expect, it } from 'vitest'
import type { CommentThread } from '@/types/collab'
import {
  cellKey,
  createBody,
  displayValueOf,
  insertRow,
  setCell,
  type SpreadsheetBody,
} from './sheetModel'

/**
 * Pins how a cell comment behaves when rows shift underneath it.
 *
 * Lattice anchors sheet comments positionally (`anchor.cell = {r, c}`,
 * see CommentThread in types/collab), while the sheet itself is a
 * positional model too: cells are keyed "row:col" and rows carry no
 * stable id. `insertRow` therefore remaps cell data, row heights and
 * formula references — but comment threads live in a different store
 * (collabStore.comments), which nothing in the shift path touches.
 *
 * The consequence is documented by the tests below and is a real defect:
 * inserting a row above a commented cell moves the data down and leaves
 * the comment pointing at whatever now occupies the old coordinates. The
 * tests assert today's behaviour rather than the desired behaviour, so
 * the suite stays green and honest; the "desired" case is marked `todo`
 * and cannot be satisfied without stable row ids in the data model.
 */

const sheetWith = (r: number, c: number, value: string): SpreadsheetBody =>
  setCell(createBody(), 0, r, c, { v: value })

const threadOnCell = (r: number, c: number, body: string): CommentThread => ({
  id: 'cmt_1',
  projectId: 'proj_1',
  targetType: 'sheet',
  targetId: 'sheet_doc_1',
  anchor: { cell: { r, c, sheetName: 'Sheet 1' } },
  authorId: 'u1',
  authorName: 'Ada',
  body,
  mentions: [],
  createdAt: 1,
  updatedAt: 1,
  resolved: false,
  replies: [],
})

describe('cell comment metadata', () => {
  it('carries the target and cell coordinates a thread needs to be found', () => {
    const thread = threadOnCell(4, 2, 'Check this figure')
    expect(thread.targetType).toBe('sheet')
    expect(thread.targetId).toBe('sheet_doc_1')
    expect(thread.anchor?.cell).toEqual({ r: 4, c: 2, sheetName: 'Sheet 1' })
  })

  it('survives the JSON round-trip every persistence path performs', () => {
    // comments reach peers as CRDT/JSON payloads; an anchor lost in
    // serialization silently becomes a document-level comment
    const thread = threadOnCell(4, 2, 'Check this figure')
    const round = JSON.parse(JSON.stringify(thread)) as CommentThread
    expect(round.anchor?.cell).toEqual({ r: 4, c: 2, sheetName: 'Sheet 1' })
    expect(round.resolved).toBe(false)
  })
})

describe('row insertion vs. cell comment anchors', () => {
  it('moves the cell data down by one row', () => {
    const before = sheetWith(4, 2, 'Revenue Q3')
    const after = insertRow(before, 0, 0)

    expect(displayValueOf(after.sheets[0].cells[cellKey(5, 2)])).toBe('Revenue Q3')
    expect(after.sheets[0].cells[cellKey(4, 2)]).toBeUndefined()
  })

  it('leaves the comment anchor on the old coordinates — the data and the thread part ways', () => {
    /**
     * This is the defect, asserted as-is. The comment was written about
     * the value now at row 5, but still points at row 4. Nothing crashes;
     * the thread just silently annotates the wrong cell.
     */
    const before = sheetWith(4, 2, 'Revenue Q3')
    const thread = threadOnCell(4, 2, 'Check this figure')

    const after = insertRow(before, 0, 0)

    expect(thread.anchor?.cell?.r).toBe(4)
    const commented = after.sheets[0].cells[cellKey(thread.anchor!.cell!.r, 2)]
    expect(displayValueOf(commented)).not.toBe('Revenue Q3')
    // and the value it was written about has drifted out from under it
    expect(displayValueOf(after.sheets[0].cells[cellKey(5, 2)])).toBe('Revenue Q3')
  })

  it('keeps the sheet id stable across row shifts', () => {
    // the one stable identifier the model does provide: whatever fix
    // lands, "which sheet" never needs re-deriving — only "which row"
    const before = sheetWith(4, 2, 'Revenue Q3')
    const after = insertRow(before, 0, 0)
    expect(after.sheets[0].id).toBe(before.sheets[0].id)
  })

  it.todo(
    'follows the row it was written about (needs stable row ids in SheetData)',
  )
})

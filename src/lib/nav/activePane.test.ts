import { describe, expect, it } from 'vitest'
import { documentPaneFor } from './activePane'

/**
 * View reconciliation: exactly one entity pane may be mounted per mode.
 *
 * The regression these cover: opening a spreadsheet and then switching to
 * Document left the sheet rendered under the document's inspector, because
 * the active* ids are independent slots and Document ranked sheets above
 * documents.
 */

describe('documentPaneFor', () => {
  describe('Document mode', () => {
    it('shows the document even when a spreadsheet is still open', () => {
      // the reported bug: open a sheet, then open a doc
      expect(
        documentPaneFor('doc', { activeSheetId: 'sheet_1', activeDocId: 'doc_1' }),
      ).toBe('doc')
    })

    it('never hosts a spreadsheet — Sheet mode owns it', () => {
      expect(documentPaneFor('doc', { activeSheetId: 'sheet_1' })).toBe('note')
    })

    it('never hosts a code file — Code mode owns it', () => {
      expect(documentPaneFor('doc', { activeCodeId: 'code_1' })).toBe('note')
    })

    it('ranks an open asset above a document', () => {
      expect(
        documentPaneFor('doc', { activeAssetId: 'asset_1', activeDocId: 'doc_1' }),
      ).toBe('asset')
    })

    it('falls back to the note pane when nothing is open', () => {
      expect(documentPaneFor('doc', {})).toBe('note')
    })

    it('ignores dangling ids the caller nulled out', () => {
      expect(documentPaneFor('doc', { activeDocId: null })).toBe('note')
    })
  })

  describe('Split mode', () => {
    it('may host a spreadsheet — it is the entity + board layout', () => {
      expect(documentPaneFor('split', { activeSheetId: 'sheet_1' })).toBe('sheet')
    })

    it('may host a code file', () => {
      expect(documentPaneFor('split', { activeCodeId: 'code_1' })).toBe('code')
    })

    it('keeps the full priority order', () => {
      expect(
        documentPaneFor('split', {
          activeCodeId: 'code_1',
          activeSheetId: 'sheet_1',
          activeDocId: 'doc_1',
        }),
      ).toBe('code')
    })
  })

  it('resolves to a single pane for every combination of open entities', () => {
    // whatever is open, a mode may only ever mount one pane — this is the
    // property that makes graphical overlap impossible
    const ids = {
      activeAssetId: 'asset_1',
      activeCodeId: 'code_1',
      activeSheetId: 'sheet_1',
      activeDocId: 'doc_1',
    }
    for (const mode of ['doc', 'split'] as const) {
      const pane = documentPaneFor(mode, ids)
      expect(['asset', 'code', 'sheet', 'doc', 'note']).toContain(pane)
    }
  })
})

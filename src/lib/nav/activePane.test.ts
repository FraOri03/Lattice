import { describe, expect, it } from 'vitest'
import { documentPaneFor } from './activePane'
import type { EntityTab } from '@/lib/tabs/tabSession'

/**
 * View reconciliation: exactly one entity pane may be mounted per mode.
 *
 * The regression these were written for — open a spreadsheet, switch to
 * Document, and find the sheet rendered under the document's inspector —
 * came from ranking six independent slots. Since 11.3 one entity is open at
 * a time, so the ranking is gone and what is left to assert is the hosting
 * rule: the Document column mounts only the kinds it owns.
 */

const tab = (kind: EntityTab['kind'], id = `${kind}_1`): EntityTab => ({ kind, id })

describe('documentPaneFor', () => {
  describe('Document mode', () => {
    it('mounts an open document', () => {
      expect(documentPaneFor('doc', tab('doc'))).toBe('doc')
    })

    it('mounts an open asset', () => {
      expect(documentPaneFor('doc', tab('asset'))).toBe('asset')
    })

    it('never hosts a spreadsheet — Sheet mode owns it', () => {
      expect(documentPaneFor('doc', tab('sheet'))).toBe('note')
    })

    it('never hosts a code file — Code mode owns it', () => {
      expect(documentPaneFor('doc', tab('code'))).toBe('note')
    })

    it('never hosts a deck — Presentation mode owns it', () => {
      expect(documentPaneFor('doc', tab('present'))).toBe('note')
    })

    it('falls back to the note pane when nothing is open', () => {
      expect(documentPaneFor('doc', null)).toBe('note')
    })
  })

  describe('other sections', () => {
    // Split is a LAYOUT now, not a section: each pane renders a real
    // section, so there is no mode that has to host everything.
    it('never mounts an entity pane outside the Document section', () => {
      for (const mode of ['board', 'sheet', 'code', 'graph', 'presentation', 'photo'] as const) {
        expect(documentPaneFor(mode, tab('doc'))).toBe('note')
      }
    })
  })

  it('resolves to a single pane for every kind that can be open', () => {
    // whatever is open, a section mounts one pane — the property that makes
    // graphical overlap impossible
    for (const kind of ['note', 'doc', 'sheet', 'code', 'present', 'asset'] as const) {
      expect(['asset', 'code', 'sheet', 'doc', 'note']).toContain(
        documentPaneFor('doc', tab(kind)),
      )
    }
  })
})

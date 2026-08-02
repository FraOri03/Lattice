import type { ViewMode } from '@/types/model'
import type { EntityTab } from '@/lib/tabs/tabSession'

/**
 * Which entity the Document column renders.
 *
 * This function was born to referee six independent `active*Id` slots: they
 * each remembered the last entity of their kind, several were set at once,
 * and ranking them wrong is what once left a spreadsheet on screen after a
 * switch to Document mode while App.tsx docked the *document* inspector
 * beside it. Since Phase 11.3 exactly one entity is open, so there is
 * nothing left to rank — the ordering is gone with the ambiguity.
 *
 * What survives is the rule that is genuinely about sections: the Document
 * column hosts only the kinds it owns. Code files, spreadsheets and decks
 * have their own sections, which render them with their own inspectors, so
 * Document must not host them even when one is the open entity. (Split is a
 * LAYOUT, not a section: each pane renders a real section, so it needs no
 * special case here.)
 */
export type DocumentPane = 'asset' | 'code' | 'sheet' | 'doc' | 'note'

/** Entity kinds the Document column may host, and the pane each maps to. */
const HOSTED: Partial<Record<EntityTab['kind'], DocumentPane>> = {
  asset: 'asset',
  doc: 'doc',
  note: 'note',
}

/**
 * The single pane the Document column shows. Callers pass an entity they
 * have already validated (a dangling id must arrive as null), so the result
 * always corresponds to something renderable. Falls back to 'note', which
 * covers both the open note and the "nothing open" empty state.
 *
 * `mode` is accepted so callers read declaratively at the call site and so a
 * future section with different hosting rules has somewhere to hook in.
 */
export function documentPaneFor(mode: ViewMode, open: EntityTab | null): DocumentPane {
  if (mode !== 'doc' || !open) return 'note'
  return HOSTED[open.kind] ?? 'note'
}

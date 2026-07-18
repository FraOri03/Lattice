import type { ViewMode } from '@/types/model'

/**
 * Which entity the Document column renders.
 *
 * The store keeps one active* id per entity kind, and they are independent:
 * each remembers the last entity opened of that kind, so several are
 * normally set at once. Deciding what to render from those ids alone is
 * what used to leave a spreadsheet on screen after switching to Document
 * mode — DocumentView ranked sheets above documents, and setViewMode never
 * reconciled the ids, so `viewMode: 'doc'` still resolved to the sheet
 * while App.tsx docked the *document* inspector next to it.
 *
 * The rule is therefore positional, not stateful: a mode may only host the
 * entity kinds it owns. Split is the "entity + board" layout and may host
 * anything; the full-page Document mode hosts only document-like entities,
 * because code files and spreadsheets have dedicated modes ('code' and
 * 'sheet') that already render them with their own inspectors.
 *
 * Keeping the ids untouched is deliberate: switching modes preserves which
 * entity each mode had open, and nothing can overlap because exactly one
 * pane is ever mounted.
 */
export type DocumentPane = 'asset' | 'code' | 'sheet' | 'doc' | 'note'

export interface ActiveEntityIds {
  activeAssetId?: string | null
  activeCodeId?: string | null
  activeSheetId?: string | null
  activeDocId?: string | null
}

/** Entity panes the Document column may render, highest priority first. */
const PANE_ORDER: { pane: DocumentPane; key: keyof ActiveEntityIds }[] = [
  { pane: 'asset', key: 'activeAssetId' },
  { pane: 'code', key: 'activeCodeId' },
  { pane: 'sheet', key: 'activeSheetId' },
  { pane: 'doc', key: 'activeDocId' },
]

/** Panes owned by a dedicated full-page mode, so Document must not host them. */
const OWNED_BY_OTHER_MODE: DocumentPane[] = ['code', 'sheet']

function canHost(mode: ViewMode, pane: DocumentPane): boolean {
  if (mode === 'split') return true
  return !OWNED_BY_OTHER_MODE.includes(pane)
}

/**
 * The single pane the Document column shows for a mode. Callers pass ids
 * they have already validated (a dangling id must arrive as null), so the
 * result always corresponds to an entity that can actually be rendered.
 * Falls back to 'note', which covers both the active note and the
 * "nothing open" empty state.
 */
export function documentPaneFor(mode: ViewMode, ids: ActiveEntityIds): DocumentPane {
  for (const { pane, key } of PANE_ORDER) {
    if (ids[key] && canHost(mode, pane)) return pane
  }
  return 'note'
}

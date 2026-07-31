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
 * The rule is therefore positional, not stateful: a section may only host
 * the entity kinds it owns. The Document section hosts document-like
 * entities only, because code files and spreadsheets have dedicated
 * sections ('code' and 'sheet') that already render them with their own
 * inspectors. (Split is a LAYOUT, not a section: each of its two panes
 * renders a real section, so it needs no special case here.)
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

/** Panes owned by a dedicated section, so Document must not host them. */
const OWNED_BY_OTHER_SECTION: DocumentPane[] = ['code', 'sheet']

function canHost(pane: DocumentPane): boolean {
  return !OWNED_BY_OTHER_SECTION.includes(pane)
}

/**
 * The single pane the Document column shows. Callers pass ids they have
 * already validated (a dangling id must arrive as null), so the result
 * always corresponds to an entity that can actually be rendered. Falls back
 * to 'note', which covers both the active note and the "nothing open"
 * empty state.
 *
 * `mode` is accepted so callers read declaratively at the call site and so
 * a future section with different hosting rules has somewhere to hook in.
 */
export function documentPaneFor(mode: ViewMode, ids: ActiveEntityIds): DocumentPane {
  if (mode !== 'doc') return 'note'
  for (const { pane, key } of PANE_ORDER) {
    if (ids[key] && canHost(pane)) return pane
  }
  return 'note'
}

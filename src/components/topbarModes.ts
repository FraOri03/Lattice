import type { ViewMode } from '@/types/model'

/**
 * The single source of truth for the primary top-navigation order. Graph is
 * placed immediately after Board (Phase 9.5). TopBar renders these in order
 * (adding icons); tests assert the ordering here without a DOM.
 *
 * Note: Document's internal ViewMode value is 'doc' (persisted + hundreds of
 * call sites) while its visible label is "Document".
 */
export interface ModeMeta {
  mode: ViewMode
  label: string
}

export const MODE_METAS: ModeMeta[] = [
  { mode: 'board', label: 'Board' },
  { mode: 'graph', label: 'Graph' },
  { mode: 'split', label: 'Split' },
  { mode: 'doc', label: 'Document' },
  { mode: 'sheet', label: 'Sheet' },
  { mode: 'presentation', label: 'Presentation' },
  { mode: 'code', label: 'Code' },
]

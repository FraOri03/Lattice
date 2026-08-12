import type { NavEntityKind } from '@/lib/nav/navUrl'

/**
 * What an entity is called, and which project it belongs to (Phase 11.3.3).
 *
 * Two surfaces need this same answer — Home resolving recents, and the tab
 * strip naming what is open — and the titles live on six different maps with
 * three different field names (`title`, `name`, and code's `title` +
 * `extension`). One map of that knowledge, so the two can never drift into
 * calling the same file different things.
 */

/**
 * The store slices a lookup reads. Structural, so the store state fits.
 *
 * `starred` (15.2) and `deletedAt`/`deletedBy` (15.6) are declared here rather
 * than only where the shelves and the trash read them: every one of these
 * entities carries the fields in the model now, and a source shape that hid
 * them would force each reader to cast its way back to the truth.
 */
interface Trashable {
  starred?: boolean
  deletedAt?: number
  deletedBy?: string
}
export interface EntitySources {
  notes: Record<string, { title: string; projectId?: string } & Trashable>
  docs: Record<string, { title: string; projectId?: string } & Trashable>
  sheetDocs: Record<string, { title: string; projectId?: string } & Trashable>
  presentDocs: Record<string, { title: string; projectId?: string } & Trashable>
  codeDocs: Record<string, { title: string; extension: string; projectId?: string } & Trashable>
  assets: Record<string, { name: string; projectId?: string; size?: number } & Trashable>
  boards: Record<string, { name: string; projectId?: string } & Trashable>
  projects: Record<string, { name: string }>
}

export interface EntityDescription {
  title: string
  projectId?: string
}

const SLICE = {
  note: 'notes',
  doc: 'docs',
  sheet: 'sheetDocs',
  present: 'presentDocs',
  code: 'codeDocs',
  asset: 'assets',
  board: 'boards',
} as const satisfies Record<NavEntityKind | 'board', keyof EntitySources>

/** The record, or null when it is missing or in the trash. */
function live(
  src: EntitySources,
  kind: NavEntityKind | 'board',
  id: string,
): { deletedAt?: number } | null {
  const rec = (src[SLICE[kind]] as Record<string, { deletedAt?: number }>)[id]
  return rec && !rec.deletedAt ? rec : null
}

/**
 * Null when the entity is gone — purged, in the trash, or never held by this
 * browser.
 *
 * Trashed records answer null on purpose (15.6). This is the one place recents,
 * the tab strip and the Starred shelf all resolve a name through, so a single
 * check keeps a deleted file out of every list that is not the trash — which
 * builds its own view precisely because it must see what this hides.
 */
export function describeEntity(
  kind: NavEntityKind | 'board',
  id: string,
  src: EntitySources,
): EntityDescription | null {
  if (live(src, kind, id) === null) return null
  switch (kind) {
    case 'note':
      return src.notes[id] ?? null
    case 'doc':
      return src.docs[id] ?? null
    case 'sheet':
      return src.sheetDocs[id] ?? null
    case 'present':
      return src.presentDocs[id] ?? null
    case 'code': {
      const c = src.codeDocs[id]
      // a code file is known by its filename, extension included
      return c ? { title: `${c.title}.${c.extension}`, projectId: c.projectId } : null
    }
    case 'asset': {
      const a = src.assets[id]
      return a ? { title: a.name, projectId: a.projectId } : null
    }
    case 'board': {
      const b = src.boards[id]
      return b ? { title: b.name, projectId: b.projectId } : null
    }
  }
}

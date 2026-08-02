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

/** The store slices a lookup reads. Structural, so the store state fits. */
export interface EntitySources {
  notes: Record<string, { title: string; projectId?: string }>
  docs: Record<string, { title: string; projectId?: string }>
  sheetDocs: Record<string, { title: string; projectId?: string }>
  presentDocs: Record<string, { title: string; projectId?: string }>
  codeDocs: Record<string, { title: string; extension: string; projectId?: string }>
  assets: Record<string, { name: string; projectId?: string }>
  boards: Record<string, { name: string; projectId?: string }>
  projects: Record<string, { name: string }>
}

export interface EntityDescription {
  title: string
  projectId?: string
}

/** Null when the entity is gone — deleted, or never held by this browser. */
export function describeEntity(
  kind: NavEntityKind | 'board',
  id: string,
  src: EntitySources,
): EntityDescription | null {
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

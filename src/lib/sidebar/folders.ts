import type { Folder, FolderCategory } from '@/types/model'
import {
  ASSET_DRAG_MIME,
  CODE_DRAG_MIME,
  DOC_DRAG_MIME,
  NOTE_DRAG_MIME,
  PRESENT_DRAG_MIME,
  SHEET_DRAG_MIME,
  BOARD_DRAG_MIME,
} from '@/lib/dnd'

/**
 * Sidebar folders: grouping INSIDE a category, never across categories.
 *
 * Membership lives on the item (`folderId`), mirroring how `projectId`
 * already works, so a vault written before folders existed is already
 * valid — every item simply reads as unfiled. That also makes deletion
 * cheap and non-destructive: dropping a folder clears a pointer, it never
 * touches the items themselves.
 *
 * Pure and store-free so the grouping and deletion rules stay testable.
 */

/** The drag MIME each category's items already publish from the sidebar. */
export const DRAG_MIME_FOR_CATEGORY: Record<FolderCategory, string> = {
  boards: BOARD_DRAG_MIME,
  docs: DOC_DRAG_MIME,
  sheets: SHEET_DRAG_MIME,
  presentations: PRESENT_DRAG_MIME,
  code: CODE_DRAG_MIME,
  notes: NOTE_DRAG_MIME,
  assets: ASSET_DRAG_MIME,
}

/** Minimal shape the grouping needs from an item. */
export interface FoldableItem {
  id: string
  folderId?: string
}

export interface FolderGroup<T> {
  folder: Folder
  items: T[]
}

export interface GroupedCategory<T> {
  groups: FolderGroup<T>[]
  /** items in no folder, or whose folder no longer exists */
  unfiled: T[]
}

/** Folders of one category in the active project, in display order. */
export function foldersOf(
  folders: Record<string, Folder>,
  category: FolderCategory,
  projectId?: string,
): Folder[] {
  return Object.values(folders)
    .filter((f) => f.category === category && (!projectId || f.projectId === projectId))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/**
 * Split a category's items into its folders plus the unfiled remainder.
 * Items pointing at a missing folder fall back to unfiled rather than
 * disappearing — a dangling id must never hide a file.
 */
export function groupByFolder<T extends FoldableItem>(
  items: readonly T[],
  folders: readonly Folder[],
): GroupedCategory<T> {
  const known = new Map(folders.map((f) => [f.id, [] as T[]]))
  const unfiled: T[] = []
  for (const item of items) {
    const bucket = item.folderId ? known.get(item.folderId) : undefined
    if (bucket) bucket.push(item)
    else unfiled.push(item)
  }
  return {
    groups: folders.map((folder) => ({ folder, items: known.get(folder.id) ?? [] })),
    unfiled,
  }
}

/** Next order value so a new folder lands at the end of its category. */
export function nextFolderOrder(existing: readonly Folder[]): number {
  return existing.reduce((max, f) => Math.max(max, f.order), -1) + 1
}

/**
 * A name that does not collide inside the same category: "Drafts",
 * "Drafts 2", "Drafts 3"… Folders are user-facing labels, so silently
 * allowing two identical ones would make the tree unreadable.
 */
export function uniqueFolderName(name: string, siblings: readonly Folder[]): string {
  const taken = new Set(siblings.map((f) => f.name.trim().toLowerCase()))
  const base = name.trim() || 'New folder'
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/** Ids of the items filed under a folder. */
export function itemsInFolder<T extends FoldableItem>(
  items: readonly T[],
  folderId: string,
): T[] {
  return items.filter((i) => i.folderId === folderId)
}

/**
 * Clear `folderId` on every record that pointed at the deleted folders.
 * Returns a NEW map only when something changed, so callers can skip a
 * pointless state update.
 */
export function unfileFrom<T extends FoldableItem>(
  records: Record<string, T>,
  folderIds: readonly string[],
): Record<string, T> {
  const drop = new Set(folderIds)
  let changed = false
  const out: Record<string, T> = {}
  for (const [id, rec] of Object.entries(records)) {
    if (rec.folderId && drop.has(rec.folderId)) {
      const { folderId: _gone, ...rest } = rec
      out[id] = rest as T
      changed = true
    } else {
      out[id] = rec
    }
  }
  return changed ? out : records
}

/** Move one item into a folder, or out of every folder when null. */
export function fileInto<T extends FoldableItem>(
  records: Record<string, T>,
  itemId: string,
  folderId: string | null,
): Record<string, T> {
  const rec = records[itemId]
  if (!rec) return records
  if ((rec.folderId ?? null) === folderId) return records
  if (folderId === null) {
    const { folderId: _gone, ...rest } = rec
    return { ...records, [itemId]: rest as T }
  }
  return { ...records, [itemId]: { ...rec, folderId } }
}

import type { Board, BoardNode } from '@/types/model'
import { isSectionNode } from '@/lib/board/sections'
import type { AutoGroup, FoldableItem } from './folders'

/**
 * Automatic grouping of the asset library by the board SECTION that uses a
 * file — the sidebar mirror of the frames on the canvas.
 *
 * Nothing is stored: membership is read back from the board every time,
 * because the board is already the single source of truth for it. A card
 * carries `data.assetId` and lives inside a section through React Flow's
 * `parentId`, so "which files does KEYFRAME 8 use" is one hop away and can
 * never drift out of sync the way a second copy of the relationship would.
 *
 * Two consequences worth naming:
 *  - a file used by cards in two sections appears under BOTH. The grouping
 *    answers "who uses this", and one asset genuinely backing twenty cards
 *    is the normal case here (see lib/assets/assetRefs), so collapsing it
 *    to a single arbitrary section would hide real usage.
 *  - a file no section uses is not grouped at all; the caller keeps it in
 *    its flat list. An automatic grouping must never make a file harder to
 *    find than it was before.
 *
 * Pure and store-free so the ordering and membership rules stay testable.
 */

/** Fallback for a section the user never named. */
const UNTITLED = 'Section'

/** Canvas reading order: top to bottom, then left to right. */
function byCanvasOrder(a: BoardNode, b: BoardNode): number {
  return a.position.y - b.position.y || a.position.x - b.position.x
}

/**
 * One group per section that uses at least one of `assets`, in canvas
 * reading order, boards in the order given. Items inside a group keep the
 * caller's ordering, so the sidebar sort is the same inside and outside a
 * group.
 */
export function assetSectionGroups<T extends FoldableItem>(
  assets: readonly T[],
  boards: readonly Board[],
): AutoGroup<T>[] {
  if (!assets.length) return []
  const groups: AutoGroup<T>[] = []

  for (const board of boards) {
    // sections cannot nest (a section is never attached to a section), so
    // a card's parentId IS its section — no chain to walk up
    const sections = board.nodes.filter(isSectionNode).sort(byCanvasOrder)
    if (!sections.length) continue

    const usedBy = new Map<string, Set<string>>()
    for (const node of board.nodes) {
      const assetId = node.data?.assetId
      if (!assetId || !node.parentId) continue
      const bucket = usedBy.get(node.parentId)
      if (bucket) bucket.add(assetId)
      else usedBy.set(node.parentId, new Set([assetId]))
    }

    for (const section of sections) {
      const ids = usedBy.get(section.id)
      if (!ids) continue
      const items = assets.filter((a) => ids.has(a.id))
      if (!items.length) continue
      groups.push({
        id: section.id,
        label: section.data.section?.title.trim() || UNTITLED,
        hint: `Used by cards in this section on ${board.name}`,
        items,
      })
    }
  }

  return groups
}

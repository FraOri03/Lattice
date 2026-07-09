import type { XYPosition } from '@xyflow/react'
import type { BoardNode } from '@/types/model'

/**
 * Helpers for Figma-like board sections. Sections are nodes of type
 * 'section'; cards inside reference them through React Flow's parentId,
 * which makes dragging a section move its cards natively. These helpers
 * keep the two invariants React Flow needs:
 *   1. a parent node appears before its children in the nodes array
 *   2. child positions are relative to the parent
 */

export function isSectionNode(n: BoardNode): boolean {
  return n.type === 'section'
}

/** Absolute canvas position of a node (child positions are parent-relative). */
export function absolutePositionOf(node: BoardNode, nodes: BoardNode[]): XYPosition {
  if (!node.parentId) return node.position
  const parent = nodes.find((n) => n.id === node.parentId)
  if (!parent) return node.position
  return {
    x: parent.position.x + node.position.x,
    y: parent.position.y + node.position.y,
  }
}

/** Stable sort: all sections first (so parents precede children), cards after. */
export function orderSectionsFirst(nodes: BoardNode[]): BoardNode[] {
  const sections = nodes.filter(isSectionNode)
  const cards = nodes.filter((n) => !isSectionNode(n))
  return [...sections, ...cards]
}

/** Rebuild every section's digested childCardIds from the parentId graph. */
export function refreshSectionChildren(nodes: BoardNode[]): BoardNode[] {
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parentId) {
      const list = childrenOf.get(n.parentId) ?? []
      list.push(n.id)
      childrenOf.set(n.parentId, list)
    }
  }
  return nodes.map((n) => {
    if (!isSectionNode(n) || !n.data.section) return n
    const ids = childrenOf.get(n.id) ?? []
    const prev = n.data.section.childCardIds
    if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return n
    return {
      ...n,
      data: { ...n.data, section: { ...n.data.section, childCardIds: ids } },
    }
  })
}

/** The section (if any) whose bounds contain the given absolute point. */
export function sectionAtPoint(
  nodes: BoardNode[],
  point: XYPosition,
): BoardNode | undefined {
  // later sections win (drawn on top of earlier ones)
  let hit: BoardNode | undefined
  for (const n of nodes) {
    if (!isSectionNode(n) || n.data.section?.collapsed) continue
    const w = n.width ?? n.measured?.width ?? 0
    const h = n.height ?? n.measured?.height ?? 0
    if (
      point.x >= n.position.x &&
      point.x <= n.position.x + w &&
      point.y >= n.position.y &&
      point.y <= n.position.y + h
    ) {
      hit = n
    }
  }
  return hit
}

/** Center point of a node in absolute canvas coordinates. */
export function centerOf(node: BoardNode, nodes: BoardNode[]): XYPosition {
  const abs = absolutePositionOf(node, nodes)
  const w = node.width ?? node.measured?.width ?? 0
  const h = node.height ?? node.measured?.height ?? 0
  return { x: abs.x + w / 2, y: abs.y + h / 2 }
}

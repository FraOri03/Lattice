/**
 * Board ↔ toolbar events.
 *
 * The bottom toolbar and the canvas are siblings under React Flow's `Panel`,
 * so they talk through window events rather than prop-drilling through the
 * ReactFlow tree — the same idiom `CommentAreas` already uses for its
 * "zoom to area" requests.
 *
 * These keep the keyboard-first insertion path (A11Y-1) alive now that the
 * separate "Add card" menu is gone: `A` opens the toolbar's Create menu, and
 * every insert hands the new card back so the canvas can focus and announce it.
 */

/** Fired by the board's `A` shortcut → the toolbar opens its Create menu. */
export const OPEN_CREATE_MENU_EVENT = 'lattice:open-create-menu'

/** Fired by the toolbar after inserting a card → the canvas focuses it. */
export const CARD_INSERTED_EVENT = 'lattice:card-inserted'

export interface CardInsertedDetail {
  id: string
  label: string
}

export function announceCardInserted(id: string, label: string): void {
  window.dispatchEvent(
    new CustomEvent<CardInsertedDetail>(CARD_INSERTED_EVENT, {
      detail: { id, label },
    }),
  )
}

/**
 * Focus a board card by id, resolving it from the document rather than from a
 * container ref — the toolbar lives in a React Flow `Panel`, a different part
 * of the tree, so a ref captured by the canvas is not reliable here.
 * Returns whether focus actually landed, so callers can retry while React Flow
 * finishes mounting the new node.
 */
export function focusBoardCard(id: string): boolean {
  const esc = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape
  const selector = esc ? esc(id) : id.replace(/["\\]/g, '\\$&')
  const el = document.querySelector<HTMLElement>(
    `.react-flow__node[data-id="${selector}"]`,
  )
  el?.focus()
  return !!el && document.activeElement === el
}

import type { BoardNode, CardData } from '@/types/model'

/**
 * Pure keyboard logic for the board canvas (A11Y-1). Kept free of React and
 * React Flow so the behaviour — including the "never fire inside an editor"
 * guard — is unit-testable without mounting the canvas.
 */

/**
 * True when a key event originates inside a text-entry surface where board
 * shortcuts must NOT fire: native inputs, contenteditable (Tiptap), Monaco's
 * textarea, and the spreadsheet grid. Anything that swallows typing is off
 * limits so arrow/Delete/letters keep doing what the editor expects.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { closest?: (s: string) => unknown }) | null
  if (!el || typeof el !== 'object') return false
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  if (typeof el.closest === 'function') {
    // Monaco editor, spreadsheet grid, or anything opting out explicitly
    if (el.closest('.monaco-editor')) return true
    if (el.closest('.sheet-scroll')) return true
    if (el.closest('[data-editable-surface]')) return true
  }
  return false
}

export const MOVE_STEP = 10
export const MOVE_STEP_LARGE = 50
export const MOVE_STEP_PRECISE = 1

export interface BoardKeyEvent {
  key: string
  shift?: boolean
  alt?: boolean
  ctrl?: boolean
  meta?: boolean
}

/** Step size for an arrow move: Shift = coarse, Alt = precise, else default. */
export function moveStepFor(e: BoardKeyEvent): number {
  if (e.shift) return MOVE_STEP_LARGE
  if (e.alt) return MOVE_STEP_PRECISE
  return MOVE_STEP
}

const ARROW_DELTA: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
}

export type BoardKeyAction =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'open' }
  | { kind: 'delete' }
  | { kind: 'duplicate' }
  | { kind: 'link-start' }
  | { kind: 'link-confirm' }
  | { kind: 'cancel' }
  | { kind: 'add-menu' }

export interface BoardKeyContext {
  /** a card currently has keyboard focus */
  hasActive: boolean
  /** keyboard link mode is picking a target */
  linking: boolean
  /** the current role cannot edit the board */
  readOnly: boolean
  /** the event came from inside an editor/input */
  editable: boolean
}

/**
 * Map a key event to a board action. Returns null when the key should pass
 * through (native Tab focus traversal, typing inside an editor, unhandled
 * keys). Movement/deletion/linking/adding are refused for read-only roles;
 * focus-only actions (open) still work so viewers can navigate.
 */
export function resolveBoardKey(
  e: BoardKeyEvent,
  ctx: BoardKeyContext,
): BoardKeyAction | null {
  if (ctx.editable) return null
  const noMods = !e.ctrl && !e.meta && !e.alt

  // Escape unwinds transient state first (link mode, then selection).
  if (e.key === 'Escape') return { kind: 'cancel' }

  // While linking, keys only confirm or (via Escape above) cancel; Tab still
  // moves focus natively so the user can reach the target card.
  if (ctx.linking) {
    if (e.key === 'Enter' || e.key === 'l' || e.key === 'L') {
      return { kind: 'link-confirm' }
    }
    return null
  }

  // "Add card" menu — reachable whenever the board region has focus.
  if ((e.key === 'a' || e.key === 'A') && noMods && !ctx.readOnly) {
    return { kind: 'add-menu' }
  }

  // Delete acts on the current selection, so it does not require a single
  // focused card — but it still refuses read-only roles and editor focus.
  if ((e.key === 'Delete' || e.key === 'Backspace') && !ctx.readOnly) {
    return { kind: 'delete' }
  }

  // Duplicate (Ctrl/Cmd+D) also acts on the selection. The copy shares the
  // original's entity, so this never re-stores a file.
  if ((e.key === 'd' || e.key === 'D') && (e.ctrl || e.meta) && !e.alt && !ctx.readOnly) {
    return { kind: 'duplicate' }
  }

  if (!ctx.hasActive) return null

  if ((e.key === 'l' || e.key === 'L') && noMods && !ctx.readOnly) {
    return { kind: 'link-start' }
  }

  if (e.key === 'Enter') return { kind: 'open' }

  const delta = ARROW_DELTA[e.key]
  if (delta && !ctx.readOnly) {
    const step = moveStepFor(e)
    return { kind: 'move', dx: delta.x * step, dy: delta.y * step }
  }

  return null
}

const TYPE_NOUN: Record<CardData['type'], string> = {
  note: 'note',
  image: 'image',
  video: 'video',
  link: 'link',
  file: 'file',
  embed3d: '3D embed',
  asset: 'asset',
  richdoc: 'document',
  code: 'code file',
  sheet: 'spreadsheet',
  presentation: 'presentation',
  section: 'section',
  webembed: 'web embed',
  photo: 'photo scene',
}

/** Human noun for a card type, e.g. "document". */
export function cardTypeNoun(type: CardData['type']): string {
  return TYPE_NOUN[type] ?? 'card'
}

/**
 * Accessible name for a node. `title` (resolved from the vault by the caller,
 * which owns entity lookups) is appended when present so the label reads
 * "Document card: Roadmap" rather than a bare type.
 */
export function cardAccessibleName(node: BoardNode, title?: string): string {
  const noun = cardTypeNoun(node.data.type)
  const named = title?.trim() || (typeof node.data.title === 'string' ? node.data.title : '')
  const base = node.data.type === 'section' ? noun : `${noun} card`
  return named ? `${base}: ${named}` : base
}

/** Spatial nearest neighbour of `fromId` in a cardinal direction (link mode
 *  fallback / optional arrow targeting). Uses node centres in flow space. */
export function nearestInDirection(
  nodes: BoardNode[],
  fromId: string,
  dir: 'up' | 'down' | 'left' | 'right',
): string | null {
  const from = nodes.find((n) => n.id === fromId)
  if (!from) return null
  const fc = nodeCenter(from)
  let best: { id: string; score: number } | null = null
  for (const n of nodes) {
    if (n.id === fromId || n.type === 'section') continue
    const c = nodeCenter(n)
    const dx = c.x - fc.x
    const dy = c.y - fc.y
    const aligned =
      dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy
    if (aligned <= 0) continue // not in that direction
    const off = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    const score = aligned + off * 2 // prefer aligned, then close
    if (!best || score < best.score) best = { id: n.id, score }
  }
  return best?.id ?? null
}

function nodeCenter(n: BoardNode): { x: number; y: number } {
  const w = n.width ?? n.measured?.width ?? 200
  const h = n.height ?? n.measured?.height ?? 140
  return { x: n.position.x + w / 2, y: n.position.y + h / 2 }
}

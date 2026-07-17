import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { announce } from '@/lib/a11y/announcer'
import {
  cardAccessibleName,
  cardTypeNoun,
  isEditableTarget,
  resolveBoardKey,
} from '@/lib/board/keyboardNav'
import type { BoardNode } from '@/types/model'

/**
 * Board keyboard controller (A11Y-1). React Flow keeps nodes Tab-focusable
 * but its own key handling is turned off (`disableKeyboardA11y`), so this
 * hook fully owns arrow-move / open / delete / link / add from a single
 * container-level handler. All decision logic lives in the pure
 * `keyboardNav` module; here we translate actions into store mutations,
 * focus moves and live-region announcements.
 */

function nodeById(id: string): BoardNode | undefined {
  const s = useStore.getState()
  return s.boards[s.activeBoardId]?.nodes.find((n) => n.id === id)
}

/** Resolve a card's entity title from the vault (for rich announcements). */
function entityTitle(node: BoardNode): string | undefined {
  const s = useStore.getState()
  const d = node.data
  if (d.noteId) return s.notes[d.noteId]?.title
  if (d.docId) return s.docs[d.docId]?.title
  if (d.codeId) return s.codeDocs[d.codeId]?.title
  if (d.sheetId) return s.sheetDocs[d.sheetId]?.title
  if (d.presentId) return s.presentDocs[d.presentId]?.title
  if (d.assetId) return s.assets[d.assetId]?.name
  if (d.section) return d.section.title
  return typeof d.title === 'string' ? d.title : undefined
}

function nameFor(node: BoardNode): string {
  return cardAccessibleName(node, entityTitle(node))
}

/** Open a card's underlying entity in its workspace; false when it has none. */
function openEntity(node: BoardNode): boolean {
  const s = useStore.getState()
  const d = node.data
  if (d.noteId) return s.openNote(d.noteId), true
  if (d.docId) return s.openDoc(d.docId), true
  if (d.codeId) return s.openCode(d.codeId), true
  if (d.sheetId) return s.openSheet(d.sheetId), true
  if (d.presentId) return s.openPresent(d.presentId), true
  if (d.assetId) return s.openAsset(d.assetId), true
  return false
}

function cssId(id: string): string {
  const esc = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape
  return esc ? esc(id) : id.replace(/["\\]/g, '\\$&')
}

export interface BoardKeyboard {
  onKeyDown: (e: React.KeyboardEvent) => void
  /** id of the card a keyboard link is being drawn from (null when idle) */
  linkSourceId: string | null
  /** focus a card's DOM node by id (used after inserts/creation) */
  focusCard: (id: string) => void
}

export function useBoardKeyboard({
  containerRef,
  readOnly,
  onOpenAddMenu,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  readOnly: boolean
  onOpenAddMenu: () => void
}): BoardKeyboard {
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null)
  const linkRef = useRef<string | null>(null)
  linkRef.current = linkSourceId
  const activeIdRef = useRef<string | null>(null)

  const focusCard = useCallback(
    (id: string) => {
      const el = containerRef.current?.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${cssId(id)}"]`,
      )
      el?.focus()
    },
    [containerRef],
  )

  // Focus tracking: whichever card owns DOM focus is the "active" card that
  // arrow-move / open / delete / link act on. Focusing a card also selects it
  // (so the inspector + resizer follow) and announces its name.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null
      const node = target?.closest?.('.react-flow__node') as HTMLElement | null
      const id = node?.getAttribute('data-id') ?? null
      if (id && id !== activeIdRef.current) {
        activeIdRef.current = id
        useStore.getState().selectCard(id)
        const n = nodeById(id)
        if (n) announce(nameFor(n))
      }
    }
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null
      if (next && el.contains(next)) return
      activeIdRef.current = null
    }
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('focusout', onFocusOut)
    return () => {
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('focusout', onFocusOut)
    }
  }, [containerRef])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const action = resolveBoardKey(
        { key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey },
        {
          hasActive: !!activeIdRef.current,
          linking: !!linkRef.current,
          readOnly,
          editable: isEditableTarget(e.target),
        },
      )
      if (!action) return
      const s = useStore.getState()
      const activeId = activeIdRef.current

      switch (action.kind) {
        case 'add-menu':
          e.preventDefault()
          onOpenAddMenu()
          break

        case 'cancel':
          if (linkRef.current) {
            e.preventDefault()
            setLinkSourceId(null)
            announce('Link cancelled')
          }
          break

        case 'move': {
          if (!activeId) break
          e.preventDefault()
          s.nudgeCards([activeId], action.dx, action.dy)
          const n = nodeById(activeId)
          if (n) {
            announce(
              `${cardTypeNoun(n.data.type)} moved to ${Math.round(n.position.x)}, ${Math.round(
                n.position.y,
              )}`,
            )
          }
          break
        }

        case 'open': {
          if (!activeId) break
          const n = nodeById(activeId)
          if (n && openEntity(n)) {
            e.preventDefault()
            announce(`Opened ${nameFor(n)}`)
          }
          break
        }

        case 'delete': {
          // Delete acts on the current selection; fall back to the focused card.
          const board = s.boards[s.activeBoardId]
          const selectedIds = board.nodes.filter((n) => n.selected).map((n) => n.id)
          const ids = selectedIds.length ? selectedIds : activeId ? [activeId] : []
          if (!ids.length) break
          e.preventDefault()
          const label =
            ids.length === 1
              ? (() => {
                  const n = nodeById(ids[0])
                  return n ? nameFor(n) : 'card'
                })()
              : `${ids.length} cards`
          for (const id of ids) s.deleteCard(id)
          activeIdRef.current = null
          if (linkRef.current && ids.includes(linkRef.current)) setLinkSourceId(null)
          announce(`Deleted ${label}`)
          // nodes are gone: return focus to the board so Tab keeps working
          containerRef.current?.focus?.()
          break
        }

        case 'link-start': {
          if (!activeId) break
          e.preventDefault()
          setLinkSourceId(activeId)
          const n = nodeById(activeId)
          announce(
            `Linking from ${n ? nameFor(n) : 'card'}. Tab to another card and press Enter to connect, or Escape to cancel.`,
          )
          break
        }

        case 'link-confirm': {
          e.preventDefault()
          const src = linkRef.current
          const tgt = activeIdRef.current
          if (src && tgt && src !== tgt) {
            s.onConnect({ source: src, target: tgt, sourceHandle: null, targetHandle: null })
            const a = nodeById(src)
            const b = nodeById(tgt)
            announce(
              `Connected ${a ? nameFor(a) : 'card'} to ${b ? nameFor(b) : 'card'}`,
            )
          } else {
            announce('Move focus to a different card to connect to it.')
          }
          setLinkSourceId(null)
          break
        }
      }
    },
    [readOnly, onOpenAddMenu, containerRef],
  )

  return { onKeyDown, linkSourceId, focusCard }
}

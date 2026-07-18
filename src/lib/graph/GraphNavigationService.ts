/**
 * GraphNavigationService — opens a graph node in its real, native Lattice
 * workspace. Graph is a browser, not a container: activating a node always
 * hands the user off to the Board / Document / Sheet / Presentation / Code /
 * asset surface that actually owns the entity.
 */
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import type { LatticeGraphNode } from './graphTypes'

export type GraphNavResult =
  | { kind: 'opened'; mode: string }
  | { kind: 'focus-local' } // e.g. a tag — has no workspace, focus it instead
  | { kind: 'external'; url: string }
  | { kind: 'none'; reason: string }

/** Kinds that the Split (document + board) layout can host. */
const SPLITTABLE = new Set(['note', 'document', 'code', 'asset', 'pdf', 'image', 'video', 'audio', 'model-3d'])

/**
 * Open the entity behind a node. `split` requests the side-by-side layout
 * where the entity kind supports it; otherwise the native full-page mode is
 * used.
 */
export function navigateToNode(
  node: LatticeGraphNode,
  opts: { split?: boolean } = {},
): GraphNavResult {
  const s = useStore.getState()
  const id = node.entityId
  const finishSplit = () => {
    // Split is a layout now: open the second pane (Board) next to the editor
    // entity we just opened. `openSplit` runs AFTER the open* call, which set
    // the section without touching the layout.
    if (opts.split && SPLITTABLE.has(node.kind)) {
      useWorkspaceLayoutStore.getState().openSplit({ secondary: 'board' })
    }
  }

  switch (node.kind) {
    case 'note':
      s.openNote(id)
      finishSplit()
      return { kind: 'opened', mode: opts.split ? 'split' : 'doc' }
    case 'document':
      s.openDoc(id)
      finishSplit()
      return { kind: 'opened', mode: opts.split ? 'split' : 'doc' }
    case 'spreadsheet':
      s.openSheet(id)
      return { kind: 'opened', mode: 'sheet' }
    case 'presentation':
      s.openPresent(id)
      return { kind: 'opened', mode: 'presentation' }
    case 'code':
      s.openCode(id)
      finishSplit()
      return { kind: 'opened', mode: opts.split ? 'split' : 'code' }
    case 'board':
      // a board node has no editor entity to pair with, so it always opens
      // full — the split layout pairs an EDITOR with the board, not vice versa
      s.setActiveBoard(id)
      s.setViewMode('board')
      return { kind: 'opened', mode: 'board' }
    case 'asset':
    case 'pdf':
    case 'image':
    case 'video':
    case 'audio':
    case 'model-3d':
      s.openAsset(id)
      finishSplit()
      return { kind: 'opened', mode: opts.split ? 'split' : 'doc' }
    case 'section':
    case 'web-embed': {
      const boardId = (node.metadata?.boardId as string | undefined) ?? null
      if (boardId && s.boards[boardId]) {
        s.setActiveBoard(boardId)
        s.setViewMode('board')
        return { kind: 'opened', mode: 'board' }
      }
      const url = node.metadata?.url as string | undefined
      if (url) return { kind: 'external', url }
      return { kind: 'none', reason: 'This item lives on a board that is no longer available.' }
    }
    case 'tag':
      return { kind: 'focus-local' }
    case 'github-file':
      return { kind: 'none', reason: 'Open GitHub sync from the Code workspace to view this repository.' }
    case 'project':
      return { kind: 'none', reason: 'This is the current project.' }
    default:
      return { kind: 'none', reason: 'This node type has no dedicated workspace.' }
  }
}

import type { PresencePeer } from '@/types/collab'
import { presenceService } from '@/lib/collab/PresenceService'

/**
 * AwarenessService — the single entry point editors and the board use to
 * publish CRDT-era awareness: transient drag geometry, spreadsheet cell,
 * code line. It rides the existing presence heartbeat (PresenceService),
 * which every transport already carries: BroadcastChannel between tabs,
 * Liveblocks presence across devices.
 *
 * Deliberately thin: keeping one presence document per session (instead
 * of a parallel Yjs Awareness instance) means the top bar, board layer
 * and panels all read the same PresencePeer shape from collabStore, no
 * matter which transport delivered it.
 */
export const awareness = {
  /** Publish live drag geometry; peers draw the manipulation outline. */
  setDragging(
    boardId: string,
    nodes: Record<string, { x: number; y: number; w?: number; h?: number }>,
  ): void {
    presenceService.setDragging({ boardId, nodes })
  },

  /** Drag finished (the committed CRDT op follows separately). */
  clearDragging(): void {
    presenceService.clearDragging()
  },

  setSheetCell(cell: PresencePeer['sheetCell']): void {
    presenceService.setSheetCell(cell)
  },

  clearSheetCell(): void {
    presenceService.setSheetCell(undefined)
  },

  setCodeLine(line: PresencePeer['codeLine']): void {
    presenceService.setCodeLine(line)
  },

  clearCodeLine(): void {
    presenceService.setCodeLine(undefined)
  },
}

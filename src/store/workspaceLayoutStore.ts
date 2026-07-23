import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SplitDirection } from '@/types/workspace'
import type { ViewMode } from '@/types/model'

/**
 * Workspace layout store (call-and-toolbar IA refactor).
 *
 * Owns ONLY the pane geometry that used to be smuggled inside `ViewMode` as
 * the `split` value: whether a second pane is open, its direction and size
 * ratio, and what the second pane shows (the Board or the Graph). The active
 * SECTION and the single open entity still live in the main `useStore`; this
 * store is deliberately small so the two never duplicate each other.
 *
 * Graph is a view, not a section: it can occupy the single primary pane
 * (that is still `viewMode === 'graph'` in the main store) or the secondary
 * pane here (`secondaryContent === 'graph'`), which is what makes the
 * "editor on the left, graph on the right" layout possible.
 */

export type SecondaryContent = 'board' | 'graph'

/** Primary pane keeps at least this fraction; the secondary gets the rest. */
export const MIN_RATIO = 0.2
export const MAX_RATIO = 0.8

export function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return 0.5
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r))
}

interface WorkspaceLayoutState {
  /** Is the second pane open (the "split" layout). */
  split: boolean
  direction: SplitDirection
  /** Fraction of space given to the PRIMARY pane, clamped to [MIN,MAX]. */
  ratio: number
  /** What the secondary pane renders while split is open. */
  secondaryContent: SecondaryContent
  /**
   * The section the graph view is overlaying, so leaving Graph returns to where
   * the user was — and so the SectionSwitcher can keep naming that section
   * while the graph is on screen.
   */
  graphReturnMode: ViewMode

  setGraphReturnMode: (mode: ViewMode) => void
  openSplit: (opts?: { secondary?: SecondaryContent; direction?: SplitDirection }) => void
  closeSplit: () => void
  toggleSplit: (opts?: { secondary?: SecondaryContent }) => void
  setRatio: (ratio: number) => void
  setDirection: (direction: SplitDirection) => void
  setSecondaryContent: (secondaryContent: SecondaryContent) => void
}

export const useWorkspaceLayoutStore = create<WorkspaceLayoutState>()(
  persist(
    (set) => ({
      split: false,
      direction: 'horizontal',
      ratio: 0.5,
      secondaryContent: 'board',
      graphReturnMode: 'board',

      setGraphReturnMode: (graphReturnMode) =>
        set({ graphReturnMode: graphReturnMode === 'graph' ? 'board' : graphReturnMode }),

      openSplit: (opts) =>
        set((s) => ({
          split: true,
          // keep the current secondary choice when already open (idempotent)
          secondaryContent: opts?.secondary ?? s.secondaryContent,
          direction: opts?.direction ?? s.direction,
        })),

      closeSplit: () => set({ split: false }),

      toggleSplit: (opts) =>
        set((s) =>
          s.split
            ? { split: false }
            : { split: true, secondaryContent: opts?.secondary ?? s.secondaryContent },
        ),

      setRatio: (ratio) => set({ ratio: clampRatio(ratio) }),
      setDirection: (direction) => set({ direction }),
      setSecondaryContent: (secondaryContent) => set({ secondaryContent }),
    }),
    {
      name: 'lattice-workspace-layout',
      version: 1,
      partialize: (s) => ({
        direction: s.direction,
        ratio: s.ratio,
        secondaryContent: s.secondaryContent,
        // `split` is intentionally NOT persisted: reopening the app lands in a
        // single pane, matching how a legacy persisted `split` viewMode also
        // degrades to a single section (see useStore migrate v3).
      }),
    },
  ),
)

/** Non-hook access for services/tests. */
export const workspaceLayout = {
  getState: useWorkspaceLayoutStore.getState,
  setState: useWorkspaceLayoutStore.setState,
}

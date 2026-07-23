import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Presentation state for the call island only — never the call session itself,
 * which lives in <CallProvider> with the LiveKit room. Keeping the two apart
 * means a re-render of the island can never disturb a live connection.
 */

/**
 * How much room the call takes:
 *  - `bar`   compact strip: status + controls (the default)
 *  - `panel` adds the participant filmstrip
 *  - `stage` enlarges the focused participant / screen share above the strip
 *
 * `stage` is opt-in: the workspace stays the subject unless the user asks for
 * a bigger picture.
 */
export type CallSize = 'bar' | 'panel' | 'stage'

interface CallUiState {
  size: CallSize
  /** participant identity to enlarge on the stage; null = pick automatically */
  focusedIdentity: string | null

  setSize: (size: CallSize) => void
  /** bar ⇄ panel, leaving `stage` via the enlarge control */
  toggleExpanded: () => void
  /** panel ⇄ stage */
  toggleStage: () => void
  focus: (identity: string | null) => void
}

export const useCallUiStore = create<CallUiState>()(
  persist(
    (set) => ({
      size: 'bar',
      focusedIdentity: null,

      setSize: (size) => set({ size }),
      toggleExpanded: () =>
        set((s) => ({ size: s.size === 'bar' ? 'panel' : 'bar' })),
      toggleStage: () =>
        set((s) => ({ size: s.size === 'stage' ? 'panel' : 'stage' })),
      focus: (focusedIdentity) => set({ focusedIdentity }),
    }),
    {
      name: 'lattice-call-ui',
      version: 2,
      // v1 stored a boolean `expanded`; map it onto the size scale
      migrate: (persisted, version) => {
        const s = persisted as Partial<CallUiState> & { expanded?: boolean }
        if (version < 2) {
          s.size = s.expanded ? 'panel' : 'bar'
          delete s.expanded
          s.focusedIdentity = null
        }
        return s as CallUiState
      },
      partialize: (s) => ({ size: s.size, focusedIdentity: s.focusedIdentity }),
    },
  ),
)

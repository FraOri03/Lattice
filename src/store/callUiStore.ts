import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Presentation state for the call island only — never the call session itself,
 * which lives in <CallProvider> with the LiveKit room. Keeping the two apart
 * means a re-render of the island can never disturb a live connection.
 */
interface CallUiState {
  /** expanded shows the participant filmstrip; collapsed is the compact bar */
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  toggleExpanded: () => void
}

export const useCallUiStore = create<CallUiState>()(
  persist(
    (set) => ({
      expanded: false,
      setExpanded: (expanded) => set({ expanded }),
      toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
    }),
    { name: 'lattice-call-ui', version: 1 },
  ),
)

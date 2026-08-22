import { create } from 'zustand'

/**
 * How many generations are running — and nothing else.
 *
 * A deliberately tiny store, separate from `jobsStore`, and the reason is
 * the bundle rather than tidiness. The toolbar tab is mounted on every page
 * load and has to show that something is running; `jobsStore` pulls the
 * whole seam in behind it, and the seam is a lazy chunk (#11's budget, and
 * 22.7 makes it a rule). A leaf with one number in it can be eager without
 * dragging anything, so the tab imports this and the store publishes to it.
 *
 * One writer: `jobsStore` sets it whenever its entries change. Nothing else
 * may, because a count kept in two places is a count that disagrees with
 * itself the first time a job ends while the panel is shut.
 */
interface AiActivityState {
  running: number
  setRunning: (running: number) => void
}

export const useAiActivity = create<AiActivityState>()((set) => ({
  running: 0,
  setRunning: (running) => set({ running }),
}))

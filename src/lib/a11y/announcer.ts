import { create } from 'zustand'

/**
 * A single app-wide polite live region (rendered by <LiveRegion/>). UI code
 * and keyboard controllers call `announce(...)` after an action that isn't
 * self-evident to a screen-reader user — a card moved, a link was made, a
 * status changed. The nonce guarantees the DOM text differs even when the
 * same message repeats, so assistive tech re-reads it.
 */
interface A11yState {
  message: string
  nonce: number
  announce: (message: string) => void
}

export const useAnnouncer = create<A11yState>()((set) => ({
  message: '',
  nonce: 0,
  announce: (message) => set((s) => ({ message, nonce: s.nonce + 1 })),
}))

/** Imperative announce for services/controllers outside React. */
export function announce(message: string): void {
  useAnnouncer.getState().announce(message)
}

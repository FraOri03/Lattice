import { create } from 'zustand'
import type { SyncConflict, SyncState, SyncStatus } from '@/types/model'

/**
 * Small observable store for cloud sync status — read by the TopBar
 * indicator and the profile menu, written by the SyncEngine.
 */
interface SyncStore extends SyncState {
  setStatus: (status: SyncStatus, error?: string | null) => void
  setProvider: (provider: SyncState['provider']) => void
  setPending: (pendingChanges: number) => void
  markSynced: (at: number) => void
  addConflicts: (conflicts: SyncConflict[]) => void
  clearConflicts: () => void
}

export const useSyncStore = create<SyncStore>()((set) => ({
  provider: 'none',
  status: 'disabled',
  lastSyncAt: null,
  pendingChanges: 0,
  conflicts: [],
  error: null,

  setStatus: (status, error = null) => set({ status, error }),
  setProvider: (provider) => set({ provider }),
  setPending: (pendingChanges) => set({ pendingChanges }),
  markSynced: (at) =>
    set({ lastSyncAt: at, status: 'synced', error: null, pendingChanges: 0 }),
  addConflicts: (conflicts) =>
    set((s) => ({ conflicts: [...conflicts, ...s.conflicts].slice(0, 20) })),
  clearConflicts: () => set({ conflicts: [] }),
}))

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
  setDriveUsage: (driveUsage: SyncState['driveUsage']) => void
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
  driveUsage: null,

  setStatus: (status, error = null) => set({ status, error }),
  // a mirror that is gone has no measurement either — never leave a stale
  // Drive total on screen after a disconnect
  setProvider: (provider) =>
    set(provider === 'none' ? { provider, driveUsage: null } : { provider }),
  setPending: (pendingChanges) => set({ pendingChanges }),
  setDriveUsage: (driveUsage) => set({ driveUsage }),
  markSynced: (at) =>
    set({ lastSyncAt: at, status: 'synced', error: null, pendingChanges: 0 }),
  addConflicts: (conflicts) =>
    set((s) => ({ conflicts: [...conflicts, ...s.conflicts].slice(0, 20) })),
  clearConflicts: () => set({ conflicts: [] }),
}))

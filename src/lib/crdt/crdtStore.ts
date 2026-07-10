import { create } from 'zustand'
import type { CollabRole, RealtimeStatus } from '@/types/collab'

/**
 * Ephemeral CRDT/realtime state surfaced in the UI (never persisted).
 *
 * `status` is the honest connection state of the production realtime
 * provider. When no backend is configured the status stays 'unconfigured'
 * and the UI shows setup instructions — a remote connection is never
 * simulated.
 */

interface CrdtState {
  status: RealtimeStatus
  /** human-readable detail: error message or setup hint */
  detail: string | null
  /** project whose rooms are currently attached */
  attachedProjectId: string | null
  /**
   * bumped on every attach/detach — editors key their collaboration
   * bindings on this so they rebind to the right awareness source
   */
  attachEpoch: number
  /** role the backend acknowledged for this user (server-side truth) */
  serverRole: CollabRole | null
  /** local CRDT updates not yet acknowledged by the backend */
  pendingUpdates: number
  lastSyncAt: number | null

  setStatus: (status: RealtimeStatus, detail?: string | null) => void
  setAttached: (projectId: string | null) => void
  setServerRole: (role: CollabRole | null) => void
  setPendingUpdates: (n: number) => void
  bumpPendingUpdates: () => void
  markSynced: () => void
}

export const useCrdtStore = create<CrdtState>()((set) => ({
  status: 'unconfigured',
  detail: null,
  attachedProjectId: null,
  attachEpoch: 0,
  serverRole: null,
  pendingUpdates: 0,
  lastSyncAt: null,

  setStatus: (status, detail = null) => set({ status, detail }),
  setAttached: (attachedProjectId) =>
    set((s) =>
      s.attachedProjectId === attachedProjectId
        ? {}
        : { attachedProjectId, attachEpoch: s.attachEpoch + 1 },
    ),
  setServerRole: (serverRole) => set({ serverRole }),
  setPendingUpdates: (pendingUpdates) => set({ pendingUpdates }),
  bumpPendingUpdates: () =>
    set((s) => ({ pendingUpdates: s.pendingUpdates + 1 })),
  markSynced: () => set({ pendingUpdates: 0, lastSyncAt: Date.now() }),
}))

/** Setup steps shown when VITE_REALTIME_BACKEND is not configured. */
export const REALTIME_SETUP_INSTRUCTIONS = [
  'Create a free Liveblocks project at liveblocks.io and copy its secret key.',
  'On Vercel: Project → Settings → Environment Variables → set LIVEBLOCKS_SECRET_KEY (server-side, no VITE_ prefix).',
  'Set VITE_REALTIME_BACKEND=liveblocks for the same environments.',
  'Redeploy — VITE_* variables are baked into the client bundle at build time.',
  'Sign in with Google: the realtime backend verifies your Google identity server-side.',
] as const

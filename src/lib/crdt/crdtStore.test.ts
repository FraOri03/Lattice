import { beforeEach, describe, expect, it } from 'vitest'
import type { RealtimeStatus } from '@/types/collab'
import { REALTIME_SETUP_INSTRUCTIONS, useCrdtStore } from './crdtStore'

/**
 * Guards the realtime status the UI reports. The rule this store exists to
 * enforce is honesty: an unconfigured build must never look connected, and
 * a dropped connection must never keep showing "Live".
 *
 * `attachEpoch` is load-bearing beyond cosmetics — editors key their
 * collaboration bindings on it, so a missed or spurious bump either leaves
 * an editor bound to a dead awareness source or needlessly rebinds it.
 */

const initial = useCrdtStore.getState()

beforeEach(() => {
  useCrdtStore.setState(initial, true)
})

describe('honest defaults', () => {
  it('starts unconfigured, unattached and roleless', () => {
    const s = useCrdtStore.getState()
    expect(s.status).toBe('unconfigured')
    expect(s.attachedProjectId).toBeNull()
    expect(s.serverRole).toBeNull()
    expect(s.pendingUpdates).toBe(0)
    expect(s.lastSyncAt).toBeNull()
  })

  it('ships setup instructions that name both required variables', () => {
    // the chip shows these verbatim when no backend is configured; if the
    // variable names drift, the instructions silently become wrong
    const text = REALTIME_SETUP_INSTRUCTIONS.join(' ')
    expect(text).toContain('LIVEBLOCKS_SECRET_KEY')
    expect(text).toContain('VITE_REALTIME_BACKEND=liveblocks')
    // the secret must never be described as a client-side variable
    expect(text).not.toContain('VITE_LIVEBLOCKS')
  })
})

describe('status transitions', () => {
  it('carries every status the provider can report, with its detail', () => {
    const states: RealtimeStatus[] = [
      'connecting',
      'connected',
      'reconnecting',
      'offline',
      'unauthorized',
      'error',
      'inactive',
      'no-account',
      'unconfigured',
    ]
    for (const status of states) {
      useCrdtStore.getState().setStatus(status, `detail:${status}`)
      expect(useCrdtStore.getState().status).toBe(status)
      expect(useCrdtStore.getState().detail).toBe(`detail:${status}`)
    }
  })

  it('clears a stale detail when a status arrives without one', () => {
    // otherwise "Realtime connection lost." survives into the connected
    // state and the tooltip contradicts the dot
    useCrdtStore.getState().setStatus('offline', 'Realtime connection lost.')
    useCrdtStore.getState().setStatus('connected')
    expect(useCrdtStore.getState().detail).toBeNull()
  })
})

describe('attach epoch', () => {
  it('bumps once per real change of project', () => {
    const start = useCrdtStore.getState().attachEpoch
    useCrdtStore.getState().setAttached('proj_a')
    expect(useCrdtStore.getState().attachEpoch).toBe(start + 1)
    useCrdtStore.getState().setAttached('proj_b')
    expect(useCrdtStore.getState().attachEpoch).toBe(start + 2)
    useCrdtStore.getState().setAttached(null)
    expect(useCrdtStore.getState().attachEpoch).toBe(start + 3)
    expect(useCrdtStore.getState().attachedProjectId).toBeNull()
  })

  it('does not bump when the same project re-attaches', () => {
    // re-entering the same room (a reconnect) must not rebind every editor
    useCrdtStore.getState().setAttached('proj_a')
    const epoch = useCrdtStore.getState().attachEpoch
    useCrdtStore.getState().setAttached('proj_a')
    useCrdtStore.getState().setAttached('proj_a')
    expect(useCrdtStore.getState().attachEpoch).toBe(epoch)
  })
})

describe('pending updates', () => {
  it('counts unacknowledged local updates and clears them on sync', () => {
    const s = () => useCrdtStore.getState()
    s().bumpPendingUpdates()
    s().bumpPendingUpdates()
    expect(s().pendingUpdates).toBe(2)

    s().markSynced()
    expect(s().pendingUpdates).toBe(0)
    expect(s().lastSyncAt).toBeGreaterThan(0)
  })

  it('keeps the queue while offline so the chip can report it', () => {
    const s = () => useCrdtStore.getState()
    s().setStatus('offline')
    s().bumpPendingUpdates()
    expect(s().pendingUpdates).toBe(1)
    expect(s().status).toBe('offline')
  })
})

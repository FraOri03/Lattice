import { describe, expect, it } from 'vitest'
import { deriveCollabMode } from './collabPresentation'

/**
 * Collaboration honesty (issue #9 / COL-1). The presentation of realtime
 * vs Drive vs local presence is derived from provider-capability signals in
 * one place; these lock the three tiers so no surface can imply live remote
 * collaboration that isn't actually configured.
 */

describe('deriveCollabMode', () => {
  it('reports realtime only when a backend is configured AND a Google identity is present', () => {
    const m = deriveCollabMode({
      hasRealtimeBackend: true,
      googleSignedIn: true,
      driveConnected: true,
    })
    expect(m.tier).toBe('realtime')
    expect(m.isRealtime).toBe(true)
    expect(m.presenceScope).toBe('live')
    expect(m.description).toMatch(/live across devices/i)
  })

  it('degrades to Drive polling when realtime is off but Drive is connected', () => {
    const m = deriveCollabMode({
      hasRealtimeBackend: false,
      googleSignedIn: true,
      driveConnected: true,
    })
    expect(m.tier).toBe('drive')
    expect(m.isRealtime).toBe(false)
    expect(m.scopeLabel).toBe('same Google Drive')
    expect(m.description).toMatch(/no live cross-device presence/i)
  })

  it('backend configured but NOT signed in with Google is not realtime', () => {
    const m = deriveCollabMode({
      hasRealtimeBackend: true,
      googleSignedIn: false,
      driveConnected: false,
    })
    expect(m.tier).toBe('local')
    expect(m.isRealtime).toBe(false)
  })

  it('falls back to same-browser tabs when neither realtime nor Drive is available', () => {
    const m = deriveCollabMode({
      hasRealtimeBackend: false,
      googleSignedIn: false,
      driveConnected: false,
    })
    expect(m.tier).toBe('local')
    expect(m.isRealtime).toBe(false)
    expect(m.presenceScope).toBe('same browser')
    expect(m.scopeLabel).toBe('tabs of this browser')
    expect(m.description).toMatch(/tabs of this browser only/i)
  })
})

import { describe, expect, it } from 'vitest'
import {
  INVITE_TTL_MS,
  canChangeRole,
  canResend,
  canRevoke,
  effectiveStatus,
  isLive,
  redact,
} from './invitations'
import type { ProjectInvite } from '@/types/collab'

/**
 * The rules 18.1 gives an invitation, and the one they exist to stop: an
 * offer that outlives the reason it was made.
 */

const NOW = Date.UTC(2026, 7, 14, 12, 0, 0)

const invite = (patch: Partial<ProjectInvite> = {}): ProjectInvite => ({
  id: 'inv_1',
  projectId: 'p1',
  email: 'ada@example.com',
  role: 'editor',
  tokenHash: 'a'.repeat(64),
  createdAt: NOW,
  invitedBy: 'usr_owner',
  invitedByName: 'Owner',
  status: 'pending',
  expiresAt: NOW + INVITE_TTL_MS,
  updatedAt: NOW,
  ...patch,
})

describe('the clock decides, not the column', () => {
  it('leaves a live invitation pending', () => {
    expect(effectiveStatus(invite(), NOW)).toBe('pending')
    expect(isLive(invite(), NOW)).toBe(true)
  })

  it('reports a passed deadline as expired even though storage still says pending', () => {
    const stale = invite({ expiresAt: NOW - 1 })
    expect(stale.status).toBe('pending')
    expect(effectiveStatus(stale, NOW)).toBe('expired')
    expect(isLive(stale, NOW)).toBe(false)
  })

  it('expires ON the deadline rather than after it', () => {
    // a boundary that admits the last millisecond is a boundary nobody can
    // reason about; the deadline is the moment it stops working
    expect(effectiveStatus(invite({ expiresAt: NOW }), NOW)).toBe('expired')
  })

  it('never re-opens a settled invitation', () => {
    for (const status of ['accepted', 'declined', 'revoked'] as const) {
      const settled = invite({ status, expiresAt: NOW + INVITE_TTL_MS })
      expect(effectiveStatus(settled, NOW)).toBe(status)
      expect(isLive(settled, NOW)).toBe(false)
    }
  })
})

describe('what may still be done to it', () => {
  it('allows a role change only before acceptance', () => {
    expect(canChangeRole(invite(), NOW)).toBe(true)
    expect(canChangeRole(invite({ status: 'accepted' }), NOW)).toBe(false)
  })

  it('refuses a role change on an invitation that quietly expired', () => {
    expect(canChangeRole(invite({ expiresAt: NOW - 1 }), NOW)).toBe(false)
  })

  it('lets an expired invitation be revoked and resent, but not an accepted one', () => {
    const expired = invite({ expiresAt: NOW - 1 })
    expect(canRevoke(expired, NOW)).toBe(true)
    expect(canResend(expired, NOW)).toBe(true)
    expect(canRevoke(invite({ status: 'accepted' }), NOW)).toBe(false)
    expect(canResend(invite({ status: 'declined' }), NOW)).toBe(false)
  })
})

describe('redact', () => {
  it('drops the token', () => {
    const withToken = invite({ token: 'the-secret-token' })
    const safe = redact(withToken, NOW)
    expect(safe.token).toBeUndefined()
    expect('token' in safe).toBe(false)
    expect(safe.tokenHash).toBe(withToken.tokenHash)
  })

  it('reports the effective status, so a caller is never told pending about an expired offer', () => {
    expect(redact(invite({ expiresAt: NOW - 1 }), NOW).status).toBe('expired')
  })

  it('leaves the rest of the record alone', () => {
    const safe = redact(invite(), NOW)
    expect(safe).toMatchObject({
      id: 'inv_1',
      projectId: 'p1',
      email: 'ada@example.com',
      role: 'editor',
      invitedByName: 'Owner',
      expiresAt: NOW + INVITE_TTL_MS,
    })
  })
})

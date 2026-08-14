import { beforeEach, describe, expect, it } from 'vitest'
import { useCollabStore } from './collabStore'
import { inviteService } from './InviteService'
import { INVITE_TTL_MS } from './invitations'
import type { ProjectInvite } from '@/types/collab'

/**
 * The other half of #90.
 *
 * The server refuses an invitation accepted by the wrong address, but the
 * local and Drive tiers have no server — and that is exactly where the hole
 * was: `accept()` added whoever was signed in, so an invitation sent to one
 * address granted membership to another. These lock the two rules that
 * replaced it: the address has to match, and a SERVER-backed invitation is
 * never granted here at all.
 */

const NOW = Date.now()

function signedInAs(email: string): void {
  localStorage.setItem(
    'lattice-account',
    JSON.stringify({ id: 'usr_me', name: 'Me', email, avatarUrl: '' }),
  )
}

const invite = (over: Partial<ProjectInvite> = {}): ProjectInvite => ({
  id: 'inv_1',
  projectId: 'p1',
  email: 'grace@example.com',
  role: 'editor',
  // empty digest = no server record behind it, which is what makes this the
  // local tier rather than a server invitation seen from a browser
  tokenHash: '',
  token: 'tok_local',
  createdAt: NOW,
  invitedBy: 'usr_owner',
  invitedByName: 'Owner',
  status: 'pending',
  expiresAt: NOW + INVITE_TTL_MS,
  updatedAt: NOW,
  ...over,
})

const membersOf = (projectId: string) =>
  useCollabStore.getState().members[projectId] ?? []

beforeEach(() => {
  localStorage.clear()
  useCollabStore.setState({ members: {}, invites: { p1: [invite()] } })
})

describe('the local tier', () => {
  it('lets the invited address in', async () => {
    signedInAs('grace@example.com')
    const outcome = await inviteService.accept(invite())

    expect(outcome.ok).toBe(true)
    expect(membersOf('p1').map((m) => m.email)).toContain('grace@example.com')
    expect(inviteService.invitesOf('p1')[0].status).toBe('accepted')
  })

  it('REFUSES a different address, and names the one that was invited', async () => {
    signedInAs('mallory@example.com')
    const outcome = await inviteService.accept(invite())

    expect(outcome.ok).toBe(false)
    expect(outcome.address).toBe('grace@example.com')
    expect(membersOf('p1')).toEqual([])
    expect(inviteService.invitesOf('p1')[0].status).toBe('pending')
  })

  it('never records the invited address as the member when someone else accepts', async () => {
    // the precise old behaviour: `email: identity.email || invite.email`
    // meant an identity with no address inherited the invited one
    signedInAs('')
    const outcome = await inviteService.accept(invite())

    expect(outcome.ok).toBe(false)
    expect(membersOf('p1')).toEqual([])
  })

  it('compares addresses case-insensitively', async () => {
    signedInAs('GRACE@Example.com')
    expect((await inviteService.accept(invite())).ok).toBe(true)
  })

  it('refuses an invitation whose deadline passed', async () => {
    signedInAs('grace@example.com')
    const outcome = await inviteService.accept(invite({ expiresAt: NOW - 1 }))

    expect(outcome.ok).toBe(false)
    expect(membersOf('p1')).toEqual([])
  })

  it('refuses one that is already settled', async () => {
    signedInAs('grace@example.com')
    expect((await inviteService.accept(invite({ status: 'revoked' }))).ok).toBe(false)
    expect((await inviteService.accept(invite({ status: 'accepted' }))).ok).toBe(false)
  })
})

describe('a server-backed invitation', () => {
  it('is never granted locally, even by the address it was sent to', async () => {
    // no server is reachable from this test, and the point is that the
    // answer is still "no" rather than falling back to a local grant: only
    // the server can say whether an address has been proved
    signedInAs('grace@example.com')
    const outcome = await inviteService.accept(
      invite({ tokenHash: 'a'.repeat(64) }),
      'tok_server',
    )

    expect(outcome.ok).toBe(false)
    expect(membersOf('p1')).toEqual([])
  })

  it('refuses when its link was not presented at all', async () => {
    signedInAs('grace@example.com')
    const outcome = await inviteService.accept(invite({ tokenHash: 'a'.repeat(64) }))

    expect(outcome.ok).toBe(false)
    expect(outcome.address).toBe('grace@example.com')
    expect(membersOf('p1')).toEqual([])
  })
})

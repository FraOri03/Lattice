import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollabStore } from './collabStore'
import { inviteService } from './InviteService'
import { INVITE_TTL_MS } from './invitations'
import { sessionClient } from '@/lib/auth/sessionClient'
import { serverAcl } from './ServerAclService'
import type { ProjectInvite } from '@/types/collab'

/**
 * Revoking, and the refusal that used to disappear.
 *
 * `revoke()` returned `void`, and the branch where the SERVER said no fell
 * off the end of the function without touching the store or telling anyone.
 * The row stayed on screen, the invitation stayed live, and the × looked
 * exactly like a button that was never wired up — which is how it was
 * reported. These lock the three outcomes apart: taken, refused, and taken
 * here but not there.
 */

const NOW = Date.now()

const invite = (over: Partial<ProjectInvite> = {}): ProjectInvite => ({
  id: 'inv_1',
  projectId: 'p1',
  email: 'grace@example.com',
  role: 'editor',
  tokenHash: 'digest',
  createdAt: NOW,
  invitedBy: 'usr_owner',
  invitedByName: 'Owner',
  status: 'pending',
  expiresAt: NOW + INVITE_TTL_MS,
  updatedAt: NOW,
  ...over,
})

/** A reply from `/api/invitations`, as `sessionClient.post` hands it back. */
function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const statusOf = (id: string) =>
  inviteService.invitesOf('p1').find((i) => i.id === id)?.status

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    'lattice-account',
    JSON.stringify({ id: 'usr_me', name: 'Me', email: 'me@example.com', avatarUrl: '' }),
  )
  useCollabStore.setState({ members: {}, invites: { p1: [invite()] }, notifications: [] })
  vi.spyOn(serverAcl, 'setRole').mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('when the server refuses', () => {
  it('says so instead of returning silently', async () => {
    vi.spyOn(sessionClient, 'post').mockResolvedValue(
      reply(403, { error: 'A viewer cannot manage invitations.' }),
    )

    const result = await inviteService.revoke('p1', 'inv_1')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('A viewer cannot manage invitations.')
  })

  it('leaves the invitation exactly as it was', async () => {
    vi.spyOn(sessionClient, 'post').mockResolvedValue(
      reply(403, { error: 'Not a member of this project.' }),
    )

    await inviteService.revoke('p1', 'inv_1')

    // the offer is still live, which is the truth — pretending otherwise
    // would hide a live link behind a row that had vanished
    expect(statusOf('inv_1')).toBe('pending')
    expect(serverAcl.setRole).not.toHaveBeenCalled()
  })
})

describe('when it lands', () => {
  it('takes the server’s record and reports nothing to say', async () => {
    vi.spyOn(sessionClient, 'post').mockResolvedValue(
      reply(200, { invite: { ...invite(), status: 'revoked' } }),
    )

    const result = await inviteService.revoke('p1', 'inv_1')

    expect(result).toEqual({ ok: true })
    expect(statusOf('inv_1')).toBe('revoked')
  })

  it('carries back a reservation the ACL would not drop', async () => {
    vi.spyOn(sessionClient, 'post').mockResolvedValue(
      reply(200, { invite: { ...invite(), status: 'revoked' } }),
    )
    vi.mocked(serverAcl.setRole).mockResolvedValue({ ok: false, error: 'Forbidden.' })

    const result = await inviteService.revoke('p1', 'inv_1')

    // withdrawn, and still holding a role somewhere the screen cannot see
    expect(result.ok).toBe(true)
    expect(result.reservationError).toBe('Forbidden.')
    expect(statusOf('inv_1')).toBe('revoked')
  })
})

/**
 * Last on purpose: `serverAvailable` is sticky, so a 501 anywhere above
 * would stop every later case from reaching the server at all.
 */
describe('with no server behind it', () => {
  /** The Phase 7 tier: 501 means there is no database, and local is the answer. */
  it('withdraws it locally', async () => {
    vi.spyOn(sessionClient, 'post').mockResolvedValue(reply(501, { error: 'no db' }))

    const result = await inviteService.revoke('p1', 'inv_1')

    expect(result.ok).toBe(true)
    expect(statusOf('inv_1')).toBe('revoked')
  })
})

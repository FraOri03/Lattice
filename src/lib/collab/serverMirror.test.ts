import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollabStore } from './collabStore'
import { inviteService } from './InviteService'
import { membersService } from './MembersService'
import { serverAcl } from './ServerAclService'
import type { ProjectMember } from '@/types/collab'

/**
 * Every grant is written twice — the local list the UI reads, and the ACL
 * the endpoints enforce — and the second write used to be fired and
 * forgotten. These lock both directions of that silence.
 *
 * The refusals are real ones: `set-role` answers 404 for a project whose
 * realtime rooms do not exist yet (nothing has opened it with realtime
 * connected), and 403 for a caller the ACL does not rank high enough.
 */

const NO_ROOMS = 'This project has no realtime rooms yet.'

function signedInAs(id: string, email: string): void {
  localStorage.setItem(
    'lattice-account',
    JSON.stringify({ id, name: 'Me', email, avatarUrl: '' }),
  )
}

function member(
  patch: Partial<ProjectMember> & { userId: string; email: string },
): ProjectMember {
  return {
    name: '',
    avatarUrl: '',
    role: 'editor',
    joinedAt: 1,
    invitedBy: patch.userId,
    status: 'active',
    updatedAt: 1,
    ...patch,
  }
}

const notifications = () => useCollabStore.getState().notifications

beforeEach(() => {
  localStorage.clear()
  signedInAs('usr_me', 'me@example.com')
  useCollabStore.setState({ members: {}, invites: {}, notifications: [] })
})

describe('inviting', () => {
  it('reports the refusal to the sender instead of logging it', async () => {
    vi.spyOn(serverAcl, 'setRole').mockResolvedValue({ ok: false, error: NO_ROOMS })

    const result = await inviteService.create('p1', 'bob@example.com', 'editor')

    expect(result.ok).toBe(true) // the invitation itself was minted
    expect(result.reservationError).toBe(NO_ROOMS)
  })

  it('says nothing when the slot was reserved', async () => {
    vi.spyOn(serverAcl, 'setRole').mockResolvedValue({ ok: true })

    const result = await inviteService.create('p1', 'bob@example.com', 'editor')

    expect(result.reservationError).toBeUndefined()
  })
})

describe('revoking an invitation', () => {
  it('raises the reservation that outlived it', async () => {
    vi.spyOn(serverAcl, 'setRole').mockResolvedValueOnce({ ok: true })
    const created = await inviteService.create('p1', 'bob@example.com', 'editor')
    vi.mocked(serverAcl.setRole).mockResolvedValue({ ok: false, error: 'Forbidden.' })

    await inviteService.revoke('p1', created.invite!.id)

    // the offer is withdrawn on this device; the role in the ACL is not
    expect(serverAcl.setRole).toHaveBeenLastCalledWith('p1', 'bob@example.com', null)
    expect(notifications()[0]?.body).toContain('bob@example.com still holds a reserved role')
  })
})

describe('removing a member', () => {
  /** The direction that matters: gone from the screen, still able to write. */
  it('raises a removal the server would not take', async () => {
    useCollabStore
      .getState()
      .setMembers('p1', [
        member({ userId: 'usr_me', email: 'me@example.com', role: 'owner' }),
        member({ userId: 'usr_bob', email: 'bob@example.com', name: 'Bob' }),
      ])
    const setRole = vi
      .spyOn(serverAcl, 'setRole')
      .mockResolvedValue({ ok: false, error: 'Forbidden.' })

    expect(membersService.removeMember('p1', 'usr_bob')).toBe(true)
    await vi.waitFor(() => expect(setRole).toHaveBeenCalled())

    await vi.waitFor(() =>
      expect(notifications()[0]?.body).toContain('Bob still has access on the server'),
    )
  })

  it('stays quiet when the server took it', async () => {
    useCollabStore
      .getState()
      .setMembers('p1', [
        member({ userId: 'usr_me', email: 'me@example.com', role: 'owner' }),
        member({ userId: 'usr_bob', email: 'bob@example.com', name: 'Bob' }),
      ])
    const setRole = vi.spyOn(serverAcl, 'setRole').mockResolvedValue({ ok: true })

    membersService.removeMember('p1', 'usr_bob')
    await vi.waitFor(() => expect(setRole).toHaveBeenCalled())

    expect(notifications()).toHaveLength(0)
  })
})

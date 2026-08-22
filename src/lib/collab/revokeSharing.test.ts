import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store/useStore'
import { useCollabStore } from './collabStore'
import { inviteService } from './InviteService'
import { serverAcl } from './ServerAclService'
import { foreignGrants, revokeForeignAccess } from './revokeSharing'
import type { CollabRole, ProjectInvite, ProjectMember } from '@/types/collab'

/**
 * Taking a vault back to one address.
 *
 * The cases here are the ones a real vault actually holds: an owner row that
 * belongs to somebody else (the pre-16.2 bootstrap appointed whoever opened
 * the project first, per device), a nameless guest row with no address at
 * all, and a standing invitation to a mailbox nobody meant to keep.
 */

const KEEP = 'me@example.com'

function signedInAs(id: string, name: string, email: string): void {
  localStorage.setItem(
    'lattice-account',
    JSON.stringify({ id, name, email, avatarUrl: '' }),
  )
}

function member(partial: Partial<ProjectMember> & { userId: string }): ProjectMember {
  return {
    name: partial.userId,
    email: '',
    avatarUrl: '',
    role: 'editor' as CollabRole,
    joinedAt: 1,
    invitedBy: partial.userId,
    status: 'active',
    updatedAt: 1,
    ...partial,
  }
}

function invite(partial: Partial<ProjectInvite> & { id: string }): ProjectInvite {
  return {
    projectId: 'proj_a',
    email: 'someone@example.com',
    role: 'editor',
    tokenHash: 'hash',
    createdAt: 1,
    invitedBy: 'usr_me',
    invitedByName: 'Me',
    status: 'pending',
    expiresAt: Date.now() + 60_000,
    updatedAt: 1,
    ...partial,
  }
}

const activeOf = (projectId: string) =>
  (useCollabStore.getState().members[projectId] ?? []).filter(
    (m) => m.status === 'active',
  )

beforeEach(() => {
  localStorage.clear()
  signedInAs('usr_me', 'Me', KEEP)
  useCollabStore.setState({ members: {}, invites: {} })
  // no realtime backend in the unit environment, so the mirror is a no-op
  // unless a case says otherwise; spying keeps the assertion about intent
  vi.spyOn(serverAcl, 'setRole').mockResolvedValue({ ok: true })
  vi.spyOn(inviteService, 'refresh').mockResolvedValue(undefined)
})

describe('foreignGrants', () => {
  it('matches the kept address case-insensitively', () => {
    useCollabStore.getState().setMembers('proj_a', [
      member({ userId: 'usr_me', email: 'Me@Example.COM', role: 'owner' }),
      member({ userId: 'usr_other', email: 'other@example.com' }),
    ])
    expect(foreignGrants(KEEP).map((g) => g.label)).toEqual(['other@example.com'])
  })

  it('counts a membership with no address at all', () => {
    useCollabStore
      .getState()
      .setMembers('proj_a', [member({ userId: 'guest_1', name: 'Guest', role: 'owner' })])
    expect(foreignGrants(KEEP)).toMatchObject([{ label: 'Guest', owner: true }])
  })

  it('ignores rows already removed, and invitations already answered', () => {
    useCollabStore
      .getState()
      .setMembers('proj_a', [
        member({ userId: 'usr_other', email: 'other@example.com', status: 'removed' }),
      ])
    useCollabStore
      .getState()
      .setInvites('proj_a', [invite({ id: 'inv_1', status: 'accepted' })])
    expect(foreignGrants(KEEP)).toEqual([])
  })

  it('still finds records left behind by a project the vault no longer holds', () => {
    useCollabStore
      .getState()
      .setMembers('proj_gone', [member({ userId: 'usr_other', email: 'other@example.com' })])
    expect(foreignGrants(KEEP)).toMatchObject([
      { projectId: 'proj_gone', projectName: 'proj_gone' },
    ])
  })
})

describe('revokeForeignAccess', () => {
  it('tombstones the others and keeps me', async () => {
    useCollabStore.getState().setMembers('proj_a', [
      member({ userId: 'usr_me', email: KEEP, role: 'owner' }),
      member({ userId: 'usr_other', email: 'other@example.com' }),
    ])

    const report = await revokeForeignAccess(KEEP)

    expect(report).toMatchObject({ projects: 1, members: 1, invites: 0 })
    expect(activeOf('proj_a').map((m) => m.email)).toEqual([KEEP])
    // a deletion loses the union merge; a tombstone wins it
    const other = useCollabStore
      .getState()
      .members['proj_a'].find((m) => m.userId === 'usr_other')
    expect(other?.status).toBe('removed')
  })

  it('takes an owner slot that belonged to somebody else, and records it', async () => {
    const projectId = useStore.getState().createProject({ name: 'Acme' })
    useCollabStore
      .getState()
      .setMembers(projectId, [
        member({ userId: 'usr_other', email: 'other@example.com', role: 'owner' }),
      ])

    const report = await revokeForeignAccess(KEEP)

    expect(report.reclaimed).toEqual(['Acme'])
    expect(activeOf(projectId)).toMatchObject([
      { userId: 'usr_me', email: KEEP, role: 'owner' },
    ])
    // `ensureOwner` rebuilds the owner from `createdBy` wherever the member
    // list has not arrived yet, so leaving it foreign would undo this
    expect(useStore.getState().projects[projectId].createdBy).toMatchObject({
      userId: 'usr_me',
      email: KEEP,
    })
  })

  it('does not reshuffle Home: a repair is not an edit', async () => {
    const projectId = useStore.getState().createProject({ name: 'Acme' })
    const before = useStore.getState().projects[projectId].updatedAt
    useCollabStore
      .getState()
      .setMembers(projectId, [
        member({ userId: 'usr_other', email: 'other@example.com', role: 'owner' }),
      ])

    await revokeForeignAccess(KEEP)

    expect(useStore.getState().projects[projectId].updatedAt).toBe(before)
  })

  it('asks the server to drop every address it removed', async () => {
    useCollabStore.getState().setMembers('proj_a', [
      member({ userId: 'usr_me', email: KEEP, role: 'owner' }),
      member({ userId: 'usr_other', email: 'other@example.com' }),
      member({ userId: 'guest_1', name: 'Guest' }),
    ])

    await revokeForeignAccess(KEEP)

    // the guest row has no address, so there is nothing for the ACL to key on
    expect(serverAcl.setRole).toHaveBeenCalledTimes(1)
    expect(serverAcl.setRole).toHaveBeenCalledWith('proj_a', 'other@example.com', null)
  })

  it('reports a refusal instead of claiming the removal happened', async () => {
    vi.mocked(serverAcl.setRole).mockResolvedValue({
      ok: false,
      error: 'Only the owner may do that.',
    })
    useCollabStore
      .getState()
      .setMembers('proj_a', [
        member({ userId: 'usr_other', email: 'other@example.com', role: 'owner' }),
      ])

    const report = await revokeForeignAccess(KEEP)

    expect(report.refused).toHaveLength(1)
    expect(report.refused[0]).toContain('Only the owner may do that.')
  })

  it('withdraws open invitations to anybody else, and leaves mine alone', async () => {
    const revoke = vi.spyOn(inviteService, 'revoke').mockResolvedValue({ ok: true })
    useCollabStore
      .getState()
      .setInvites('proj_a', [
        invite({ id: 'inv_other', email: 'other@example.com' }),
        invite({ id: 'inv_me', email: KEEP }),
      ])

    const report = await revokeForeignAccess(KEEP)

    expect(report.invites).toBe(1)
    expect(revoke).toHaveBeenCalledExactlyOnceWith('proj_a', 'inv_other')
  })

  it('does nothing to a project that is already only mine', async () => {
    useCollabStore
      .getState()
      .setMembers('proj_a', [member({ userId: 'usr_me', email: KEEP, role: 'owner' })])

    const report = await revokeForeignAccess(KEEP)

    expect(report).toMatchObject({ projects: 0, members: 0, invites: 0 })
    expect(serverAcl.setRole).not.toHaveBeenCalled()
  })
})

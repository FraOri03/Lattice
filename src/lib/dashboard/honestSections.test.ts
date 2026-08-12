import { describe, expect, it } from 'vitest'
import { collectSentInvites, collectShared, type ProjectFacts } from './honestSections'
import type { ProjectInvite, ProjectMember } from '@/types/collab'

/**
 * What the two partially-answerable sections may claim (13.3).
 *
 * The cases that matter are the exclusions: a project you own is not shared
 * *with* you, and an invitation cannot wear a status nothing computes.
 */

const project = (id: string, name: string, extra: Partial<ProjectFacts> = {}): ProjectFacts => ({
  id,
  name,
  icon: '🗂️',
  updatedAt: 0,
  archived: false,
  ...extra,
})

const member = (userId: string, role: ProjectMember['role'], name: string): ProjectMember =>
  ({
    userId,
    name,
    email: `${userId}@example.com`,
    avatarUrl: '',
    role,
    joinedAt: 0,
    invitedBy: '',
    status: 'active',
    updatedAt: 0,
  }) as ProjectMember

describe('collectShared', () => {
  const projects = { p1: project('p1', 'Acme'), p2: project('p2', 'Mine') }

  it('lists a project someone else owns and this browser can see', () => {
    const groups = collectShared(
      projects,
      { p1: [member('giulia', 'owner', 'Giulia'), member('me', 'editor', 'Me')] },
      'me',
      'browser',
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].ownerName).toBe('Giulia')
    expect(groups[0].items[0]).toMatchObject({ name: 'Acme', role: 'editor', scope: 'browser' })
  })

  it('never lists a project you own — it is not shared *with* you', () => {
    expect(
      collectShared(projects, { p1: [member('me', 'owner', 'Me')] }, 'me', 'browser'),
    ).toEqual([])
  })

  it('ignores a project whose roster does not name you', () => {
    expect(
      collectShared(projects, { p1: [member('giulia', 'owner', 'Giulia')] }, 'me', 'browser'),
    ).toEqual([])
  })

  it('ignores a membership that is no longer active', () => {
    const removed = { ...member('me', 'editor', 'Me'), status: 'removed' } as ProjectMember
    expect(
      collectShared(projects, { p1: [member('g', 'owner', 'G'), removed] }, 'me', 'browser'),
    ).toEqual([])
  })

  it('keeps a row whose owner is unknown rather than dropping it', () => {
    // an owner-less roster is a real state; hiding the project would be the
    // page deciding you have no access to something you demonstrably do
    const groups = collectShared(
      projects,
      { p1: [member('me', 'viewer', 'Me')] },
      'me',
      'drive',
    )
    expect(groups[0].ownerName).toBeNull()
    expect(groups[0].items[0].role).toBe('viewer')
  })

  it('groups several projects under the same owner, newest first', () => {
    const groups = collectShared(
      {
        a: project('a', 'Older', { updatedAt: 1 }),
        b: project('b', 'Newer', { updatedAt: 9 }),
      },
      {
        a: [member('g', 'owner', 'Giulia'), member('me', 'editor', 'Me')],
        b: [member('g', 'owner', 'Giulia'), member('me', 'viewer', 'Me')],
      },
      'me',
      'browser',
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((i) => i.name)).toEqual(['Newer', 'Older'])
  })

  it('leaves archived projects out', () => {
    const groups = collectShared(
      { a: project('a', 'Gone', { archived: true }) },
      { a: [member('g', 'owner', 'G'), member('me', 'editor', 'Me')] },
      'me',
      'browser',
    )
    expect(groups).toEqual([])
  })
})

describe('collectSentInvites', () => {
  const invite = (id: string, status: ProjectInvite['status'], createdAt = 0): ProjectInvite =>
    ({
      id,
      projectId: 'p1',
      email: `${id}@example.com`,
      role: 'editor',
      token: 't',
      createdAt,
      invitedBy: 'me',
      invitedByName: 'Me',
      status,
      updatedAt: 0,
    }) as ProjectInvite

  it('folds invitations over the projects this device holds, newest first', () => {
    const out = collectSentInvites({ p1: project('p1', 'Acme') }, () => [
      invite('a', 'pending', 1),
      invite('b', 'accepted', 5),
    ])
    expect(out.map((i) => i.invite.id)).toEqual(['b', 'a'])
    expect(out[0].projectName).toBe('Acme')
  })

  it('shows pending, accepted and revoked — and nothing else', () => {
    // `expired` is in the type and nothing computes it: no `expiresAt` exists,
    // so a row wearing that badge would claim a check that never happened
    const out = collectSentInvites({ p1: project('p1', 'Acme') }, () => [
      invite('a', 'pending'),
      invite('b', 'accepted'),
      invite('c', 'revoked'),
      invite('d', 'expired'),
    ])
    expect(out.map((i) => i.invite.status)).toEqual(['pending', 'accepted', 'revoked'])
  })

  it('is empty when no project holds an invitation', () => {
    expect(collectSentInvites({ p1: project('p1', 'Acme') }, () => [])).toEqual([])
  })
})

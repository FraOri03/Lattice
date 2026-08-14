import { describe, expect, it } from 'vitest'
import {
  collectSentInvites,
  collectShared,
  type ProjectFacts,
  type ServerShared,
} from './honestSections'
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
      tokenHash: 'h',
      createdAt,
      invitedBy: 'me',
      invitedByName: 'Me',
      status,
      expiresAt: createdAt + 14 * 24 * 60 * 60 * 1000,
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

  it('shows every status the model can actually establish', () => {
    // `expired` and `declined` used to be excluded because nothing could have
    // checked them: there was no `expiresAt`, and a refusal had no value to be
    // recorded as. 18.1 (#88) gives both a real source, so both are shown.
    const out = collectSentInvites({ p1: project('p1', 'Acme') }, () => [
      invite('a', 'pending'),
      invite('b', 'accepted'),
      invite('c', 'revoked'),
      invite('d', 'expired'),
      invite('e', 'declined'),
    ])
    expect(out.map((i) => i.invite.status)).toEqual([
      'pending',
      'accepted',
      'revoked',
      'expired',
      'declined',
    ])
  })

  it('is empty when no project holds an invitation', () => {
    expect(collectSentInvites({ p1: project('p1', 'Acme') }, () => [])).toEqual([])
  })
})

describe('the server index (18.4)', () => {
  const me = 'usr_me'
  const server = (over: Partial<ServerShared> = {}): ServerShared => ({
    projectId: 'p9',
    role: 'viewer',
    ownerEmail: 'owner@example.com',
    claimed: false,
    ...over,
  })

  it('adds a project this device has never held', () => {
    const groups = collectShared({}, {}, me, 'browser', [server()])
    expect(groups).toHaveLength(1)
    expect(groups[0].ownerEmail).toBe('owner@example.com')
    expect(groups[0].items[0]).toMatchObject({
      projectId: 'p9',
      role: 'viewer',
      scope: 'server',
      name: null,
      updatedAt: 0,
    })
  })

  it('gives it no name rather than inventing one', () => {
    // titles live in Yjs and Drive; the database that knows the membership
    // has never seen one, and a placeholder would be a claim
    expect(collectShared({}, {}, me, 'browser', [server()])[0].items[0].name).toBeNull()
  })

  it('does not duplicate a project this device already lists', () => {
    const projects = { p1: project('p1', 'Acme') }
    const members = {
      p1: [
        member('usr_owner', 'owner', 'Owner'),
        member(me, 'editor', 'Me'),
      ],
    }
    const groups = collectShared(projects, members, me, 'browser', [
      server({ projectId: 'p1', role: 'viewer' }),
    ])

    const all = groups.flatMap((g) => g.items)
    expect(all).toHaveLength(1)
    // the local row wins: it has a name, an icon and a real timestamp
    expect(all[0]).toMatchObject({ projectId: 'p1', name: 'Acme', scope: 'browser' })
  })

  it('groups server rows by the owner they name', () => {
    const groups = collectShared({}, {}, me, 'browser', [
      server({ projectId: 'p1', ownerEmail: 'ada@example.com' }),
      server({ projectId: 'p2', ownerEmail: 'ada@example.com' }),
      server({ projectId: 'p3', ownerEmail: 'bob@example.com' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.items.length).sort()).toEqual([1, 2])
  })

  it('keeps a project with no recorded owner instead of dropping it', () => {
    const groups = collectShared({}, {}, me, 'browser', [server({ ownerEmail: '' })])
    expect(groups[0].ownerEmail).toBeNull()
    expect(groups[0].items).toHaveLength(1)
  })

  it('changes nothing when the server has nothing to add', () => {
    expect(collectShared({}, {}, me, 'browser', [])).toEqual([])
  })
})

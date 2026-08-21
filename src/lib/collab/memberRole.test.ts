import { describe, expect, it } from 'vitest'
import { roleInProject } from './memberRole'
import type { CollabRole, MemberStatus, ProjectMember } from '@/types/collab'

/**
 * The default that used to hand OWNER to anybody holding a project.
 *
 * The failure it produced was silent on both sides: the local UI unlocked
 * every control, and the realtime endpoint refused every write with "<you>
 * is not a member of this project (server check)". Nothing on screen
 * connected the two.
 */

const me = { userId: 'usr_me', email: 'me@example.com' }

function member(
  patch: Partial<ProjectMember> & { userId: string },
): ProjectMember {
  return {
    name: '',
    email: '',
    avatarUrl: '',
    role: 'editor' as CollabRole,
    joinedAt: 1,
    invitedBy: patch.userId,
    status: 'active' as MemberStatus,
    updatedAt: 1,
    ...patch,
  }
}

describe('roleInProject', () => {
  it('is the row that names you, whatever it says', () => {
    expect(
      roleInProject([member({ userId: 'usr_me', email: me.email, role: 'commenter' })], me),
    ).toBe('commenter')
  })

  it('matches on the address as well as the id', () => {
    // one Google account holds a pre-16.1 legacy id on a migrated browser and
    // a canonical one everywhere else — the id alone would demote them
    expect(
      roleInProject([member({ userId: 'acc_g-sub-1', email: 'ME@example.com', role: 'admin' })], me),
    ).toBe('admin')
  })

  it('gives a project nobody is recorded on to the local user', () => {
    expect(roleInProject([], me)).toBe('owner')
    expect(roleInProject(undefined, me)).toBe('owner')
  })

  it('still gives it away when the only rows are nameless local identities', () => {
    // the pre-16.2 bootstrap appointed whichever identity opened the project
    // first on each device; a guest row with no address grants nobody anything
    expect(
      roleInProject([member({ userId: 'guest_1', name: 'Guest', role: 'owner' })], me),
    ).toBe('owner')
  })

  it('makes you a viewer when somebody with a real address holds it', () => {
    expect(
      roleInProject([member({ userId: 'usr_ada', email: 'ada@example.com', role: 'owner' })], me),
    ).toBe('viewer')
  })

  it('ignores rows that were removed — a tombstone is not a member', () => {
    expect(
      roleInProject(
        [member({ userId: 'usr_ada', email: 'ada@example.com', role: 'owner', status: 'removed' })],
        me,
      ),
    ).toBe('owner')
  })

  it('reads your own removal as the removal it is', () => {
    expect(
      roleInProject(
        [
          member({ userId: 'usr_ada', email: 'ada@example.com', role: 'owner' }),
          member({ userId: 'usr_me', email: me.email, role: 'editor', status: 'removed' }),
        ],
        me,
      ),
    ).toBe('viewer')
  })
})

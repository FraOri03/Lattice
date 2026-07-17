import { describe, expect, it } from 'vitest'
import type { CollabRole } from '@/types/collab'
import { can, isReadOnly } from './permissions'
import {
  collabRoomId,
  contentRoomId,
  parseRoomId,
  permissionsForRole,
  roleWritesCollab,
  roleWritesContent,
  roomIdsForProject,
} from './roleAccess'

/**
 * Guards the realtime security boundary. `roleAccess` is imported VERBATIM
 * by both the browser and the serverless endpoints (api/realtime/*), so a
 * regression here does not merely break the UI — it hands a tampered
 * client scopes the server would then honour.
 *
 * Two invariants matter most:
 *  - room ids are derived from the project id alone, so two projects can
 *    never share presence, comments or CRDT content;
 *  - the content/collab room split is what makes "commenter" mean
 *    something: writable comments, unwritable documents.
 */

const ALL_ROLES: CollabRole[] = ['owner', 'admin', 'editor', 'commenter', 'viewer']

describe('room id derivation', () => {
  it('is deterministic: the same project always yields the same rooms', () => {
    expect(contentRoomId('proj_abc')).toBe(contentRoomId('proj_abc'))
    expect(collabRoomId('proj_abc')).toBe(collabRoomId('proj_abc'))
    // pinned literally: changing the scheme silently orphans every
    // existing room's Yjs content and ACL metadata
    expect(contentRoomId('proj_abc')).toBe('lattice:proj:proj_abc')
    expect(collabRoomId('proj_abc')).toBe('lattice:proj:proj_abc:collab')
  })

  it('isolates different projects across both rooms', () => {
    const a = roomIdsForProject('proj_a')
    const b = roomIdsForProject('proj_b')
    expect(a).toHaveLength(2)
    for (const room of a) expect(b).not.toContain(room)
  })

  it('never collides the content room with the collab room', () => {
    expect(contentRoomId('x')).not.toBe(collabRoomId('x'))
    for (const id of ['proj_a', 'proj_abc123', 'proj_m4k2x1a9q']) {
      expect(contentRoomId(id)).not.toBe(collabRoomId(id))
    }
  })

  it('refuses to parse a project segment containing a colon', () => {
    /**
     * The room id scheme is only injective while project ids carry no
     * colon: `contentRoomId('p:collab')` would otherwise spell the same
     * string as `collabRoomId('p')`. Two things keep that unreachable —
     * ids come from nid('proj') ("proj_" + base36, see useStore), and
     * the parser below refuses the ambiguous shape outright, so a
     * hand-crafted room id is rejected server-side rather than resolved
     * to the wrong project. This test pins the second guarantee, which
     * is the one that does not depend on how ids happen to be minted.
     */
    expect(contentRoomId('p:collab')).toBe(collabRoomId('p'))
    expect(parseRoomId(contentRoomId('p:collab'))).not.toEqual({
      projectId: 'p:collab',
      kind: 'content',
    })
    expect(parseRoomId('lattice:proj:a:b')).toBeNull()
  })

  it('round-trips through parseRoomId', () => {
    expect(parseRoomId(contentRoomId('proj_1'))).toEqual({
      projectId: 'proj_1',
      kind: 'content',
    })
    expect(parseRoomId(collabRoomId('proj_1'))).toEqual({
      projectId: 'proj_1',
      kind: 'collab',
    })
  })

  it('rejects room ids that are not ours', () => {
    // the auth endpoint feeds client-supplied strings straight into this
    // parser; anything it accepts becomes a room the server will scope
    const hostile = [
      '',
      'lattice:proj:',
      'lattice:proj',
      'proj_1',
      'lattice:proj:a:b',
      'lattice:proj:a:collab:extra',
      'other:proj:a',
      'lattice:proj:a:collab ',
      ' lattice:proj:a',
      'LATTICE:proj:a',
      '../../etc/passwd',
      'lattice:proj:a\nlattice:proj:b',
    ]
    for (const room of hostile) expect(parseRoomId(room)).toBeNull()
  })
})

describe('permissions per role', () => {
  it('grants content writes to owner, admin and editor only', () => {
    for (const role of ALL_ROLES) {
      const writes = ['owner', 'admin', 'editor'].includes(role)
      expect(roleWritesContent(role)).toBe(writes)
      expect(permissionsForRole(role, 'content')).toEqual(
        writes ? ['room:write'] : ['room:read', 'room:presence:write'],
      )
    }
  })

  it('lets a commenter write the collab room but not the content room', () => {
    // this pair is the entire definition of the commenter role
    expect(permissionsForRole('commenter', 'collab')).toEqual(['room:write'])
    expect(permissionsForRole('commenter', 'content')).toEqual([
      'room:read',
      'room:presence:write',
    ])
    expect(roleWritesCollab('commenter')).toBe(true)
    expect(roleWritesContent('commenter')).toBe(false)
  })

  it('gives a viewer presence but no writes anywhere', () => {
    for (const kind of ['content', 'collab'] as const) {
      const perms = permissionsForRole('viewer', kind)
      expect(perms).toContain('room:presence:write')
      expect(perms).not.toContain('room:write')
    }
    expect(roleWritesContent('viewer')).toBe(false)
    expect(roleWritesCollab('viewer')).toBe(false)
  })

  it('never returns room:write alongside read-only scopes', () => {
    // Liveblocks unions the scopes it is handed; a list carrying both
    // would quietly promote a viewer to a writer
    for (const role of ALL_ROLES) {
      for (const kind of ['content', 'collab'] as const) {
        const perms = permissionsForRole(role, kind)
        if (perms.includes('room:write')) expect(perms).toEqual(['room:write'])
      }
    }
  })
})

describe('capability matrix agrees with room scopes', () => {
  /**
   * The UI gates on permissions.ts while the server gates on
   * roleAccess.ts. If the two ever disagree, a role either sees buttons
   * the backend rejects, or is denied something it is entitled to.
   */
  it('matches content.edit against content-room write scope', () => {
    for (const role of ALL_ROLES) {
      expect(can(role, 'content.edit')).toBe(roleWritesContent(role))
      expect(isReadOnly(role)).toBe(!roleWritesContent(role))
    }
  })

  it('matches comments.add against collab-room write scope', () => {
    for (const role of ALL_ROLES) {
      expect(can(role, 'comments.add')).toBe(roleWritesCollab(role))
    }
  })
})

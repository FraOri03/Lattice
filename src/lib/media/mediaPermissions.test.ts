import { describe, expect, it } from 'vitest'
import { mediaCapabilitiesFor, publishableSources } from './mediaPermissions'
import { roleWritesContent } from '../collab/roleAccess'
import { can } from '../collab/permissions'
import type { CollabRole } from '../../types/collab'

const ROLES: CollabRole[] = ['owner', 'admin', 'editor', 'commenter', 'viewer']

describe('media capability matrix', () => {
  it('lets every project member join and use mic + camera', () => {
    for (const role of ROLES) {
      const caps = mediaCapabilitiesFor(role)
      expect(caps.join).toBe(true)
      expect(caps.audio).toBe(true)
      expect(caps.video).toBe(true)
    }
  })

  it('grants nothing to a missing role (non-members)', () => {
    for (const role of [null, undefined]) {
      expect(mediaCapabilitiesFor(role)).toEqual({
        join: false,
        audio: false,
        video: false,
        screenShare: false,
        moderate: false,
      })
    }
    expect(publishableSources(null)).toEqual([])
  })

  it('ties screen share to the content-writing roles', () => {
    // the documented rationale: broadcasting content requires being able to
    // contribute content — so the two predicates must agree, for every role
    for (const role of ROLES) {
      expect(mediaCapabilitiesFor(role).screenShare).toBe(roleWritesContent(role))
    }
  })

  it('ties moderation to members.manage', () => {
    for (const role of ROLES) {
      expect(mediaCapabilitiesFor(role).moderate).toBe(can(role, 'members.manage'))
    }
  })

  it('gives a viewer no unauthorised capability', () => {
    const viewer = mediaCapabilitiesFor('viewer')
    expect(viewer.screenShare).toBe(false)
    expect(viewer.moderate).toBe(false)
    expect(publishableSources('viewer')).toEqual(['microphone', 'camera'])
  })

  it('gives a commenter no screen share (cannot contribute content)', () => {
    expect(mediaCapabilitiesFor('commenter').screenShare).toBe(false)
    expect(publishableSources('commenter')).toEqual(['microphone', 'camera'])
  })

  it('lets editors and above publish a screen share', () => {
    for (const role of ['owner', 'admin', 'editor'] as CollabRole[]) {
      expect(publishableSources(role)).toEqual([
        'microphone',
        'camera',
        'screen_share',
        'screen_share_audio',
      ])
    }
  })

  it('returns a copy, so a caller cannot mutate the matrix', () => {
    const caps = mediaCapabilitiesFor('viewer')
    caps.screenShare = true
    expect(mediaCapabilitiesFor('viewer').screenShare).toBe(false)
  })
})

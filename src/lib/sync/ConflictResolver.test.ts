import { describe, expect, it } from 'vitest'
import {
  hasUnpushedBody,
  isConflict,
  resolveVersions,
  type VersionedEntity,
} from './ConflictResolver'

/**
 * The rules the Drive sync decides overwrites with.
 *
 * `hasUnpushedBody` is the one with teeth: it guards the `.conflict-` backup,
 * and the backup is the only thing standing between "newest wins" and losing
 * an edit that exists on exactly one device.
 */

const at = (updatedAt: number): VersionedEntity => ({ id: 'e1', updatedAt })

describe('resolveVersions', () => {
  it('gives it to the newer side', () => {
    expect(resolveVersions(at(2), at(1))).toBe('local')
    expect(resolveVersions(at(1), at(2))).toBe('remote')
  })

  it('does nothing when the two agree', () => {
    expect(resolveVersions(at(5), at(5))).toBe('none')
    expect(resolveVersions(undefined, undefined)).toBe('none')
  })

  it('takes whichever side exists when only one does', () => {
    expect(resolveVersions(undefined, at(1))).toBe('remote')
    expect(resolveVersions(at(1), undefined)).toBe('local')
  })
})

describe('isConflict', () => {
  it('is true only when both sides moved since the last sync', () => {
    expect(isConflict(at(20), at(30), 10)).toBe(true)
    expect(isConflict(at(5), at(30), 10)).toBe(false)
    expect(isConflict(at(20), at(5), 10)).toBe(false)
  })

  it('is false before there has ever been a sync to diverge from', () => {
    expect(isConflict(at(20), at(30), null)).toBe(false)
  })
})

describe('hasUnpushedBody', () => {
  it('is true when the local copy is newer than what reached Drive', () => {
    // edited at 30, last uploaded at 10: those edits are on this device only
    expect(hasUnpushedBody(30, 10)).toBe(true)
  })

  it('is false once that same version has been pushed', () => {
    expect(hasUnpushedBody(30, 30)).toBe(false)
  })

  it('is true for a body this device has never pushed at all', () => {
    // `bodyPush` has no entry, so the caller passes 0 — and a local body with
    // no upload behind it is precisely the copy that must not be overwritten
    expect(hasUnpushedBody(30, 0)).toBe(true)
  })

  it('is false for an entity that arrived from the server', () => {
    // nothing local to lose: the caller passes 0 for an id this device has
    // never held, and 0 > 0 is false
    expect(hasUnpushedBody(0, 0)).toBe(false)
  })

  /**
   * The regression. The check used to be
   * `isConflict({updatedAt: bodyPush}, {updatedAt: remote}, lastSyncAt)`,
   * which is true when the body WAS pushed after the last sync — i.e. when
   * Drive already has it and the backup is pointless — and false in the case
   * below, where it is the only thing preventing data loss.
   */
  it('answers the opposite of "has this body been pushed recently"', () => {
    const lastSyncAt = 100
    const localUpdatedAt = 150 // edited after the last sync, never pushed
    const pushedUpdatedAt = 50 // the version Drive holds, from before it

    expect(hasUnpushedBody(localUpdatedAt, pushedUpdatedAt)).toBe(true)
    // what the old condition computed, for the very same state
    expect(isConflict(at(pushedUpdatedAt), at(200), lastSyncAt)).toBe(false)
  })
})

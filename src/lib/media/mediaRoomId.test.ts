import { describe, expect, it } from 'vitest'
import { isValidProjectId, mediaRoomId, parseMediaRoomId } from './mediaRoomId'

describe('mediaRoomId', () => {
  it('is deterministic for a project', () => {
    expect(mediaRoomId('proj_default')).toBe('lattice-project-proj_default')
    expect(mediaRoomId('proj_default')).toBe(mediaRoomId('proj_default'))
  })

  it('gives different projects different rooms', () => {
    expect(mediaRoomId('proj_a')).not.toBe(mediaRoomId('proj_b'))
  })

  it('does not collide with the Liveblocks room namespace', () => {
    // Liveblocks rooms are `lattice:proj:<id>` — media must not overlap
    expect(mediaRoomId('proj_a')).not.toContain('lattice:proj:')
  })

  it('rejects ids that could escape the namespace', () => {
    for (const bad of ['', 'has space', 'a/b', 'a:b', '../etc', 'x'.repeat(65)]) {
      expect(() => mediaRoomId(bad)).toThrow()
      expect(isValidProjectId(bad)).toBe(false)
    }
  })

  it('round-trips through parseMediaRoomId', () => {
    expect(parseMediaRoomId(mediaRoomId('proj_x1'))).toBe('proj_x1')
  })

  it('returns null for foreign room ids', () => {
    expect(parseMediaRoomId('lattice:proj:proj_x')).toBeNull()
    expect(parseMediaRoomId('other-room')).toBeNull()
    expect(parseMediaRoomId('lattice-project-')).toBeNull()
    expect(parseMediaRoomId('lattice-project-bad id')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  navKey,
  parseNav,
  resolveNav,
  serializeNav,
  type NavSnapshot,
  type NavState,
} from './navUrl'

/**
 * URL/history serialization + validation (issue #10). Round-trips, dedup
 * keys, popstate restoration and — critically — safe degradation of invalid
 * project / board / entity ids.
 */

const snapshot = (): NavSnapshot => ({
  hasProject: (id) => id === 'proj_a' || id === 'proj_b',
  fallbackProjectId: 'proj_a',
  boardBelongsTo: (bid, pid) => bid === 'board_a1' && pid === 'proj_a',
  firstBoardOf: (pid) => (pid === 'proj_a' ? 'board_a1' : 'board_b1'),
  entityExists: (kind, id, pid) =>
    pid === 'proj_a' && kind === 'doc' && id === 'doc_1',
})

describe('serialize / parse round-trip', () => {
  it('round-trips a full nav state', () => {
    const nav: NavState = {
      projectId: 'proj_a',
      mode: 'doc',
      boardId: 'board_a1',
      entity: { kind: 'doc', id: 'doc_1' },
    }
    const search = serializeNav(nav)
    expect(search).toContain('p=proj_a')
    expect(search).toContain('m=doc')
    expect(search).toContain('e=doc.doc_1')
    const raw = parseNav(search)
    expect(raw).toEqual({
      projectId: 'proj_a',
      mode: 'doc',
      boardId: 'board_a1',
      entityKind: 'doc',
      entityId: 'doc_1',
    })
  })

  it('serializes empty state to an empty string', () => {
    expect(serializeNav(null)).toBe('')
    expect(serializeNav({ projectId: '', mode: 'board' })).toBe('')
  })

  it('navKey is stable and distinguishes places', () => {
    const a: NavState = { projectId: 'p', mode: 'board', boardId: 'b1' }
    const b: NavState = { projectId: 'p', mode: 'board', boardId: 'b2' }
    expect(navKey(a)).toBe(navKey({ ...a }))
    expect(navKey(a)).not.toBe(navKey(b))
  })
})

describe('resolveNav — validation and safe degradation', () => {
  it('keeps a fully valid nav', () => {
    const nav = resolveNav(
      { projectId: 'proj_a', mode: 'doc', boardId: 'board_a1', entityKind: 'doc', entityId: 'doc_1' },
      snapshot(),
    )
    expect(nav).toEqual({
      projectId: 'proj_a',
      mode: 'doc',
      boardId: 'board_a1',
      entity: { kind: 'doc', id: 'doc_1' },
    })
  })

  it('falls back to the current project when the project id is unknown', () => {
    const nav = resolveNav({ projectId: 'nope', mode: 'board' }, snapshot())
    expect(nav.projectId).toBe('proj_a')
  })

  it('drops a missing entity (mode still opens, just empty)', () => {
    const nav = resolveNav(
      { projectId: 'proj_a', mode: 'doc', entityKind: 'doc', entityId: 'ghost' },
      snapshot(),
    )
    expect(nav.entity).toBeUndefined()
    expect(nav.mode).toBe('doc')
  })

  it('replaces a board that does not belong to the project', () => {
    const nav = resolveNav(
      { projectId: 'proj_a', mode: 'board', boardId: 'board_from_other_project' },
      snapshot(),
    )
    expect(nav.boardId).toBe('board_a1')
  })

  it('degrades an invalid mode to board', () => {
    const nav = resolveNav({ projectId: 'proj_a', mode: 'wat' }, snapshot())
    expect(nav.mode).toBe('board')
  })

  it('ignores an unknown entity kind', () => {
    const nav = resolveNav(
      { projectId: 'proj_a', mode: 'board', entityKind: 'bogus', entityId: 'x' },
      snapshot(),
    )
    expect(nav.entity).toBeUndefined()
  })
})

describe('popstate restoration path (parse → resolve)', () => {
  it('rebuilds a valid nav from a URL search string', () => {
    const nav = resolveNav(parseNav('?p=proj_a&m=doc&e=doc.doc_1'), snapshot())
    expect(nav.projectId).toBe('proj_a')
    expect(nav.mode).toBe('doc')
    expect(nav.entity).toEqual({ kind: 'doc', id: 'doc_1' })
  })

  it('handles an empty / malformed search safely', () => {
    const nav = resolveNav(parseNav(''), snapshot())
    expect(nav.projectId).toBe('proj_a')
    expect(nav.mode).toBe('board')
    expect(nav.entity).toBeUndefined()
  })
})

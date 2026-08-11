import { describe, expect, it } from 'vitest'
import {
  navKey,
  parseNav,
  resolveNav,
  serializeNav,
  type NavSnapshot,
  type NavState,
  type ResolvedNavigation,
} from './navUrl'

/**
 * URL/history serialization + validation (issue #10, extended by Phase 11.0).
 * Round-trips, dedup keys, popstate restoration, the dashboard/project surface
 * split and — critically — safe degradation of invalid project / board /
 * entity ids.
 */

const snapshot = (): NavSnapshot => ({
  hasProject: (id) => id === 'proj_a' || id === 'proj_b',
  boardBelongsTo: (bid, pid) => bid === 'board_a1' && pid === 'proj_a',
  firstBoardOf: (pid) => (pid === 'proj_a' ? 'board_a1' : 'board_b1'),
  entityExists: (kind, id, pid) =>
    pid === 'proj_a' && kind === 'doc' && id === 'doc_1',
})

/** Narrow a resolved navigation to the project surface (fails if it isn't). */
function project(nav: ResolvedNavigation): { surface: 'project' } & NavState {
  if (nav.surface !== 'project') {
    throw new Error(`expected the project surface, got "${nav.surface}"`)
  }
  return nav
}

const projectNav = (nav: NavState): ResolvedNavigation => ({
  surface: 'project',
  ...nav,
})

describe('serialize / parse round-trip', () => {
  it('round-trips a full nav state', () => {
    const nav = projectNav({
      projectId: 'proj_a',
      mode: 'doc',
      boardId: 'board_a1',
      entity: { kind: 'doc', id: 'doc_1' },
    })
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
    expect(serializeNav(projectNav({ projectId: '', mode: 'board' }))).toBe('')
  })

  it('round-trips the Photo section', () => {
    const search = serializeNav(projectNav({ projectId: 'proj_a', mode: 'photo' }))
    expect(search).toContain('m=photo')
    expect(project(resolveNav(parseNav(search), snapshot())).mode).toBe('photo')
  })

  it('navKey is stable and distinguishes places', () => {
    const a = projectNav({ projectId: 'p', mode: 'board', boardId: 'b1' })
    const b = projectNav({ projectId: 'p', mode: 'board', boardId: 'b2' })
    expect(navKey(a)).toBe(navKey({ ...a }))
    expect(navKey(a)).not.toBe(navKey(b))
  })
})

/**
 * Settings (14.1) is a screen over a surface, not a surface of its own, so it
 * has to survive on both and take the rest of the URL with it.
 */
describe('settings rides over the surface', () => {
  it('addresses a section on the otherwise empty dashboard URL', () => {
    const search = serializeNav({ surface: 'dashboard', settings: 'appearance' })
    expect(search).toBe('?s=appearance')
    expect(resolveNav(parseNav(search), snapshot())).toEqual({
      surface: 'dashboard',
      settings: 'appearance',
    })
  })

  it('keeps the project underneath when settings is open', () => {
    const search = serializeNav({
      ...projectNav({ projectId: 'proj_a', mode: 'doc', boardId: 'board_a1' }),
      settings: 'storage',
    })
    expect(search).toContain('p=proj_a')
    expect(search).toContain('s=storage')
    const nav = resolveNav(parseNav(search), snapshot())
    expect(project(nav).projectId).toBe('proj_a')
    expect(nav.settings).toBe('storage')
  })

  it('drops an unknown section instead of opening somewhere arbitrary', () => {
    expect(resolveNav(parseNav('?s=nowhere'), snapshot())).toEqual({ surface: 'dashboard' })
  })

  it('survives an unknown project, because settings is not the project', () => {
    const nav = resolveNav(parseNav('?p=ghost&s=account'), snapshot())
    expect(nav).toEqual({ surface: 'dashboard', settings: 'account' })
  })

  it('makes opening and closing settings a different place, so Back undoes it', () => {
    const shut = projectNav({ projectId: 'p', mode: 'board' })
    const open = { ...shut, settings: 'account' } as const
    expect(navKey(shut)).not.toBe(navKey(open))
    expect(navKey({ surface: 'dashboard' })).not.toBe(
      navKey({ surface: 'dashboard', settings: 'account' }),
    )
  })
})

describe('surfaces — dashboard vs project', () => {
  it('resolves the bare root URL to the dashboard', () => {
    expect(resolveNav(parseNav(''), snapshot())).toEqual({ surface: 'dashboard' })
  })

  it('resolves a valid project link to the project surface', () => {
    const nav = resolveNav(parseNav('?p=proj_a&m=board'), snapshot())
    expect(nav.surface).toBe('project')
    expect(project(nav).projectId).toBe('proj_a')
  })

  it('lands on the dashboard when the project id is unknown', () => {
    const nav = resolveNav({ projectId: 'ghost', mode: 'board' }, snapshot())
    expect(nav.surface).toBe('dashboard')
  })

  it('lands on the dashboard when nav params carry no project', () => {
    const nav = resolveNav(parseNav('?m=doc&e=doc.doc_1'), snapshot())
    expect(nav.surface).toBe('dashboard')
  })

  it('serializes the dashboard to the param-less root URL', () => {
    expect(serializeNav({ surface: 'dashboard' })).toBe('')
  })

  it('navKey tells the dashboard apart from any project', () => {
    const dash = navKey({ surface: 'dashboard' })
    expect(dash).toBe('dashboard')
    expect(dash).not.toBe(navKey(projectNav({ projectId: 'proj_a', mode: 'board' })))
    // and apart from "no state at all", so the two never dedup together
    expect(dash).not.toBe(navKey(null))
  })
})

describe('resolveNav — validation and safe degradation', () => {
  it('keeps a fully valid nav', () => {
    const nav = resolveNav(
      { projectId: 'proj_a', mode: 'doc', boardId: 'board_a1', entityKind: 'doc', entityId: 'doc_1' },
      snapshot(),
    )
    expect(nav).toEqual({
      surface: 'project',
      projectId: 'proj_a',
      mode: 'doc',
      boardId: 'board_a1',
      entity: { kind: 'doc', id: 'doc_1' },
    })
  })

  it('drops a missing entity (mode still opens, just empty)', () => {
    const nav = project(
      resolveNav(
        { projectId: 'proj_a', mode: 'doc', entityKind: 'doc', entityId: 'ghost' },
        snapshot(),
      ),
    )
    expect(nav.entity).toBeUndefined()
    expect(nav.mode).toBe('doc')
  })

  it('replaces a board that does not belong to the project', () => {
    const nav = project(
      resolveNav(
        { projectId: 'proj_a', mode: 'board', boardId: 'board_from_other_project' },
        snapshot(),
      ),
    )
    expect(nav.boardId).toBe('board_a1')
  })

  it('degrades an invalid mode to board', () => {
    const nav = project(resolveNav({ projectId: 'proj_a', mode: 'wat' }, snapshot()))
    expect(nav.mode).toBe('board')
  })

  it('ignores an unknown entity kind', () => {
    const nav = project(
      resolveNav(
        { projectId: 'proj_a', mode: 'board', entityKind: 'bogus', entityId: 'x' },
        snapshot(),
      ),
    )
    expect(nav.entity).toBeUndefined()
  })
})

describe('split layout — URL back-compatibility', () => {
  it('serializes the split layout as the legacy m=split token', () => {
    const search = serializeNav(
      projectNav({
        projectId: 'proj_a',
        mode: 'doc',
        split: true,
        boardId: 'board_a1',
        entity: { kind: 'doc', id: 'doc_1' },
      }),
    )
    expect(search).toContain('m=split')
    expect(search).not.toContain('m=doc')
  })

  it('resolves a legacy m=split link into the split flag + the entity section', () => {
    const nav = project(
      resolveNav(parseNav('?p=proj_a&m=split&b=board_a1&e=doc.doc_1'), snapshot()),
    )
    expect(nav.split).toBe(true)
    expect(nav.mode).toBe('doc') // section derived from the open entity
    expect(nav.entity).toEqual({ kind: 'doc', id: 'doc_1' })
  })

  it('resolves m=split with no entity to the Board, still split', () => {
    const nav = project(resolveNav(parseNav('?p=proj_a&m=split'), snapshot()))
    expect(nav.split).toBe(true)
    expect(nav.mode).toBe('board')
  })

  it('keeps graph as a mode (not a split)', () => {
    const nav = project(resolveNav(parseNav('?p=proj_a&m=graph'), snapshot()))
    expect(nav.mode).toBe('graph')
    expect(nav.split).toBeUndefined()
  })

  it('navKey distinguishes a split from its underlying section', () => {
    const single = projectNav({ projectId: 'p', mode: 'doc', boardId: 'b1' })
    const split = projectNav({ projectId: 'p', mode: 'doc', split: true, boardId: 'b1' })
    expect(navKey(single)).not.toBe(navKey(split))
  })
})

describe('popstate restoration path (parse → resolve)', () => {
  it('rebuilds a valid nav from a URL search string', () => {
    const nav = project(resolveNav(parseNav('?p=proj_a&m=doc&e=doc.doc_1'), snapshot()))
    expect(nav.projectId).toBe('proj_a')
    expect(nav.mode).toBe('doc')
    expect(nav.entity).toEqual({ kind: 'doc', id: 'doc_1' })
  })

  it('handles a malformed search safely (dashboard, never a crash)', () => {
    expect(resolveNav(parseNav('?p=&m=&e=.'), snapshot())).toEqual({
      surface: 'dashboard',
    })
  })
})

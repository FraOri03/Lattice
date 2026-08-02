import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store/useStore'
import { openRecent, resolveRecents, type RecentSources } from './resolveRecents'
import type { RecentEntry } from '@/types/model'
import { openIdOf } from '@/lib/tabs/openEntity'

/**
 * Recents resolution (Phase 11.2.3).
 *
 * `RecentEntry` holds no title and no project, so both have to be read back
 * from live state. These lock down what happens when that read comes up
 * empty — a deleted entity, or one written before projects had ids — and the
 * order `openRecent` has to use, which is the part that silently breaks.
 */

const sources: RecentSources = {
  notes: { n1: { title: 'Field notes', projectId: 'p1' }, n0: { title: 'Orphan' } },
  docs: { d1: { title: 'Spec', projectId: 'p2' } },
  sheetDocs: {},
  presentDocs: {},
  codeDocs: { c1: { title: 'main', extension: 'ts', projectId: 'p1' } },
  assets: {},
  boards: { b1: { name: 'Main board', projectId: 'p1' } },
  projects: { p1: { name: 'Alpha' }, p2: { name: 'Beta' } },
}

const entry = (kind: RecentEntry['kind'], id: string, at = 1): RecentEntry => ({ kind, id, at })

describe('resolveRecents', () => {
  it('drops entries whose entity is gone', () => {
    const out = resolveRecents([entry('note', 'deleted'), entry('note', 'n1')], sources)
    expect(out.map((r) => r.id)).toEqual(['n1'])
  })

  it('names a code file with its extension', () => {
    const [code] = resolveRecents([entry('code', 'c1')], sources)
    expect(code.title).toBe('main.ts')
  })

  it('attributes each entry to its project', () => {
    const out = resolveRecents([entry('note', 'n1'), entry('doc', 'd1')], sources)
    expect(out.map((r) => [r.projectId, r.projectName])).toEqual([
      ['p1', 'Alpha'],
      ['p2', 'Beta'],
    ])
  })

  it('keeps only the asked-for project when one is given', () => {
    const out = resolveRecents([entry('note', 'n1'), entry('doc', 'd1')], sources, {
      projectId: 'p2',
    })
    expect(out.map((r) => r.id)).toEqual(['d1'])
  })

  it('drops unattributable entries when the caller needs a project', () => {
    const recents = [entry('note', 'n0'), entry('note', 'n1')]
    expect(resolveRecents(recents, sources).map((r) => r.id)).toEqual(['n0', 'n1'])
    expect(
      resolveRecents(recents, sources, { attributedOnly: true }).map((r) => r.id),
    ).toEqual(['n1'])
  })

  it('honours the limit', () => {
    const out = resolveRecents(
      [entry('note', 'n1'), entry('doc', 'd1'), entry('board', 'b1')],
      sources,
      { limit: 2 },
    )
    expect(out).toHaveLength(2)
  })
})

describe('openRecent', () => {
  beforeEach(() => useStore.setState({ navSurface: 'project' }))

  it('moves the project before opening the entity, not after', () => {
    const s = useStore.getState()
    const alpha = s.createProject({ name: 'Alpha' })
    s.setActiveProject(alpha)
    const noteId = useStore.getState().createNote()
    const beta = useStore.getState().createProject({ name: 'Beta' })
    useStore.getState().setActiveProject(beta)

    const [resolved] = resolveRecents(
      [entry('note', noteId)],
      { ...sourcesFromStore(), projects: useStore.getState().projects },
      { attributedOnly: true },
    )
    openRecent(resolved)

    const after = useStore.getState()
    // setActiveProject clears every entity slot: open first and the note is
    // wiped by the project switch that follows.
    expect(after.activeProjectId).toBe(alpha)
    expect(openIdOf(after, 'note')).toBe(noteId)
    expect(after.navSurface).toBe('project')
  })

  it('takes a board to its section, since setActiveBoard alone would not', () => {
    const s = useStore.getState()
    const projectId = s.createProject({ name: 'Gamma' })
    s.setActiveProject(projectId)
    const boardId = useStore.getState().activeBoardId
    useStore.setState({ viewMode: 'doc', navSurface: 'dashboard' })

    openRecent({
      kind: 'board',
      id: boardId,
      at: 1,
      title: 'Main board',
      projectId,
      projectName: 'Gamma',
    })

    expect(useStore.getState().viewMode).toBe('board')
    expect(useStore.getState().navSurface).toBe('project')
  })
})

function sourcesFromStore(): RecentSources {
  const s = useStore.getState()
  return {
    notes: s.notes,
    docs: s.docs,
    sheetDocs: s.sheetDocs,
    presentDocs: s.presentDocs,
    codeDocs: s.codeDocs,
    assets: s.assets,
    boards: s.boards,
    projects: s.projects,
  }
}

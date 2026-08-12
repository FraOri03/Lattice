import { describe, expect, it } from 'vitest'
import { collectStarred, groupByDay, workspaceOfProject, type ShelfSources } from './shelves'
import type { Workspace } from '@/types/model'

/**
 * The shelf rules worth asserting without a DOM (13.5 §9): what lands on
 * Starred and in what order, and where a day begins.
 */

const ws = (id: string, name: string, projectIds: string[]) =>
  ({ id, name, projectIds, icon: '🏠', createdAt: 0, updatedAt: 0 }) as unknown as Workspace

const workspaces = {
  w1: ws('w1', 'Studio Nord', ['p1']),
  w2: ws('w2', 'Personal', ['p2']),
}

const empty: ShelfSources = {
  notes: {},
  docs: {},
  sheetDocs: {},
  presentDocs: {},
  codeDocs: {},
  assets: {},
  boards: {},
  projects: {},
}

describe('collectStarred', () => {
  it('spans workspaces and labels every row with the one it came from', () => {
    const items = collectStarred(
      {
        ...empty,
        projects: { p1: { name: 'Acme' }, p2: { name: 'Side' } },
        docs: {
          d1: { title: 'Brief', projectId: 'p1', starred: true },
          d2: { title: 'Recipe', projectId: 'p2', starred: true },
        },
      },
      workspaces,
    )

    expect(items.map((i) => i.workspaceName)).toEqual(['Studio Nord', 'Personal'])
    expect(items.map((i) => i.projectName)).toEqual(['Acme', 'Side'])
  })

  it('takes only what is starred', () => {
    const items = collectStarred(
      {
        ...empty,
        projects: { p1: { name: 'Acme', starred: true }, p2: { name: 'Side' } },
        notes: { n1: { title: 'Kept', projectId: 'p1', starred: true }, n2: { title: 'Not', projectId: 'p1' } },
      },
      workspaces,
    )

    expect(items.map((i) => i.title)).toEqual(['Acme', 'Kept'])
  })

  it('drops a star pointing at an entity that is gone', () => {
    // the star lives on the entity, so this is the case where a map holds a
    // record the describer cannot name — it is skipped, not rendered dead
    const items = collectStarred(
      { ...empty, projects: { p1: { name: 'Acme' } }, codeDocs: {} },
      workspaces,
    )
    expect(items).toEqual([])
  })

  it('never reorders itself when something is edited', () => {
    // the order is kind then title, so nothing an edit changes can move a row.
    // sorting by updatedAt is what this rules out: 13.1 contrasts the shelf
    // with the log precisely because the log reshuffles and the shelf must not
    const src: ShelfSources = {
      ...empty,
      projects: { p1: { name: 'Acme' } },
      docs: {
        d2: { title: 'Zebra', projectId: 'p1', starred: true },
        d1: { title: 'Alpha', projectId: 'p1', starred: true },
      },
      boards: { b1: { name: 'Canvas', projectId: 'p1', starred: true } },
    }

    const before = collectStarred(src, workspaces).map((i) => i.id)
    // boards sort before docs, and titles sort inside a kind
    expect(before).toEqual(['b1', 'd1', 'd2'])
    expect(collectStarred(src, workspaces).map((i) => i.id)).toEqual(before)
  })

  it('does not name a project on its own row', () => {
    const items = collectStarred(
      { ...empty, projects: { p1: { name: 'Acme', starred: true } } },
      workspaces,
    )
    expect(items[0]).toMatchObject({ kind: 'project', title: 'Acme', projectName: null })
  })
})

describe('workspaceOfProject', () => {
  it('answers null for a project no workspace holds', () => {
    expect(workspaceOfProject('orphan', workspaces)).toBeNull()
    expect(workspaceOfProject(null, workspaces)).toBeNull()
  })
})

describe('groupByDay', () => {
  const at = (day: number, hour: number) => new Date(2026, 7, day, hour, 30).getTime()
  const now = at(11, 22) // a late evening, which is where UTC bucketing breaks

  it('groups by LOCAL midnight, not by a UTC day number', () => {
    // 23:30 local on the 11th is already the 12th in UTC east of Greenwich; a
    // `at / 86400000` bucket would label tonight with tomorrow's date
    const days = groupByDay([{ at: at(11, 23) }, { at: at(11, 1) }], now)
    expect(days).toHaveLength(1)
    expect(days[0].daysAgo).toBe(0)
  })

  it('orders days newest first and rows newest first inside a day', () => {
    const days = groupByDay([{ at: at(9, 12) }, { at: at(11, 8) }, { at: at(11, 20) }], now)
    expect(days.map((d) => d.daysAgo)).toEqual([0, 2])
    expect(days[0].items.map((i) => i.at)).toEqual([at(11, 20), at(11, 8)])
  })

  it('counts yesterday as one day ago across a month boundary', () => {
    const endOfMonth = new Date(2026, 7, 1, 9, 0).getTime()
    const previous = new Date(2026, 6, 31, 18, 0).getTime()
    const days = groupByDay([{ at: previous }], endOfMonth)
    expect(days[0].daysAgo).toBe(1)
  })

  it('has no groups when there is nothing to group', () => {
    expect(groupByDay([], now)).toEqual([])
  })
})

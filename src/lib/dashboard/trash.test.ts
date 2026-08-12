import { describe, expect, it } from 'vitest'
import {
  RETENTION_DAYS,
  collectTrash,
  daysLeftOf,
  isExpired,
  isTrashed,
  purgeDateOf,
  trashedBytes,
  type TrashSources,
} from './trash'
import type { Workspace } from '@/types/model'

/**
 * The arithmetic that decides what disappears, asserted without a clock.
 *
 * The flooring rule and the orphan rule are the two that would be wrong in a
 * way nobody notices until something is gone.
 */

const DAY = 86_400_000
// local, not UTC: the countdown counts local calendar days, so a UTC fixture
// would put the boundary in a different place than the code does
const NOW = new Date(2026, 7, 11, 12, 0).getTime()

const empty: TrashSources = {
  notes: {},
  docs: {},
  sheetDocs: {},
  presentDocs: {},
  codeDocs: {},
  assets: {},
  boards: {},
  projects: {},
}

const ws = {
  w1: { id: 'w1', name: 'Personal', projectIds: ['p1', 'p2'] } as unknown as Workspace,
}

describe('retention arithmetic', () => {
  it('keeps an item for exactly 30 days', () => {
    expect(purgeDateOf(NOW)).toBe(NOW + RETENTION_DAYS * DAY)
    expect(RETENTION_DAYS).toBe(30)
  })

  it('counts calendar days, so "just deleted" is the full window', () => {
    // elapsed-time arithmetic gets both ends wrong: flooring says 29 days about
    // something deleted a second ago, ceiling says "in 1 day" about something
    // tonight's sweep will take
    expect(daysLeftOf(NOW - 1_000, NOW)).toBe(RETENTION_DAYS)
    expect(daysLeftOf(NOW - 2 * DAY, NOW)).toBe(RETENTION_DAYS - 2)
  })

  it('says zero once the purge date is today — the "purging tonight" state', () => {
    const purgesToday = new Date(2026, 6, 12, 9, 0).getTime() // 30 days before NOW
    expect(daysLeftOf(purgesToday, NOW)).toBe(0)
  })

  it('never counts below zero, however long the device stayed shut', () => {
    expect(daysLeftOf(NOW - 90 * DAY, NOW)).toBe(0)
  })

  it('expires only once the window has actually passed', () => {
    expect(isExpired(NOW - (RETENTION_DAYS * DAY - 1), NOW)).toBe(false)
    expect(isExpired(NOW - RETENTION_DAYS * DAY, NOW)).toBe(true)
  })

  it('reads a live record as live', () => {
    expect(isTrashed(undefined)).toBe(false)
    expect(isTrashed({})).toBe(false)
    expect(isTrashed({ deletedAt: NOW })).toBe(true)
  })
})

describe('collectTrash', () => {
  it('takes only what was deleted, newest first', () => {
    const items = collectTrash(
      {
        ...empty,
        projects: { p1: { name: 'Live' }, p2: { name: 'Gone', deletedAt: NOW - DAY } },
        notes: {
          n1: { title: 'Kept', projectId: 'p1' },
          n2: { title: 'Trashed', projectId: 'p1', deletedAt: NOW },
        },
      },
      ws,
      NOW,
    )
    expect(items.map((i) => i.name)).toEqual(['Trashed', 'Gone'])
  })

  it('says where a project was, by workspace', () => {
    const items = collectTrash(
      { ...empty, projects: { p1: { name: 'Gone', deletedAt: NOW } } },
      ws,
      NOW,
    )
    expect(items[0]).toMatchObject({ kind: 'project', location: 'Personal', orphaned: false })
  })

  it('marks an entity orphaned when its project is in the trash too', () => {
    // restoring it alone cannot put it back where it came from, because where
    // it came from is not there either
    const items = collectTrash(
      {
        ...empty,
        projects: { p1: { name: 'Acme', deletedAt: NOW } },
        docs: { d1: { title: 'Brief', projectId: 'p1', deletedAt: NOW } },
      },
      ws,
      NOW,
    )
    const doc = items.find((i) => i.kind === 'doc')!
    expect(doc.orphaned).toBe(true)
  })

  it('leaves an entity un-orphaned when its project is still live', () => {
    const items = collectTrash(
      {
        ...empty,
        projects: { p1: { name: 'Acme' } },
        docs: { d1: { title: 'Brief', projectId: 'p1', deletedAt: NOW } },
      },
      ws,
      NOW,
    )
    expect(items[0]).toMatchObject({ orphaned: false, location: 'Acme' })
  })

  it('names a code file with its extension, the way everything else does', () => {
    const items = collectTrash(
      {
        ...empty,
        projects: { p1: { name: 'Acme' } },
        codeDocs: { c1: { title: 'main', extension: 'ts', projectId: 'p1', deletedAt: NOW } },
      },
      ws,
      NOW,
    )
    expect(items[0].name).toBe('main.ts')
  })

  it('carries who deleted it, and null when nobody was recorded', () => {
    const items = collectTrash(
      {
        ...empty,
        projects: {
          p1: { name: 'A', deletedAt: NOW, deletedBy: 'Francesco' },
          p2: { name: 'B', deletedAt: NOW - 1 },
        },
      },
      ws,
      NOW,
    )
    expect(items[0].deletedBy).toBe('Francesco')
    expect(items[1].deletedBy).toBeNull()
  })

  it('counts the bytes still occupied, which only assets contribute', () => {
    const items = collectTrash(
      {
        ...empty,
        projects: { p1: { name: 'Acme' } },
        assets: {
          a1: { name: 'photo.png', projectId: 'p1', deletedAt: NOW, size: 1_000 },
          a2: { name: 'clip.mp4', projectId: 'p1', deletedAt: NOW, size: 2_000 },
        },
        notes: { n1: { title: 'Free', projectId: 'p1', deletedAt: NOW } },
      },
      ws,
      NOW,
    )
    expect(trashedBytes(items)).toBe(3_000)
  })

  it('is empty when nothing was deleted', () => {
    expect(collectTrash({ ...empty, projects: { p1: { name: 'Live' } } }, ws, NOW)).toEqual([])
  })
})

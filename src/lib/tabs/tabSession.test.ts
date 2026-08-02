import { describe, expect, it } from 'vitest'
import {
  activateTab,
  activeTab,
  closeTab,
  cycleTab,
  EMPTY_SESSION,
  openTab,
  pruneTabs,
  slotsFor,
  tabFromSlots,
  tabKey,
  type EntityTab,
  type TabSession,
} from './tabSession'

/**
 * The tab session model (Phase 11.3.1).
 *
 * These lock down the two things that make tabs a single source of truth
 * rather than a seventh place to look: closing the active tab always leaves a
 * defined focus, and `slotsFor` sets exactly one of the six slots — so the
 * "close the tab, the slot survives, the section reopens the entity" bug has
 * nowhere to live.
 */

const note = (id: string): EntityTab => ({ kind: 'note', id })
const doc = (id: string): EntityTab => ({ kind: 'doc', id })

function sessionOf(...tabs: EntityTab[]): TabSession {
  return tabs.reduce(openTab, EMPTY_SESSION)
}

describe('openTab', () => {
  it('appends and focuses', () => {
    const s = sessionOf(note('a'), doc('b'))
    expect(s.tabs).toHaveLength(2)
    expect(activeTab(s)).toEqual(doc('b'))
  })

  it('re-focuses instead of duplicating what is already open', () => {
    const s = openTab(sessionOf(note('a'), doc('b')), note('a'))
    expect(s.tabs).toHaveLength(2)
    expect(activeTab(s)).toEqual(note('a'))
  })

  it('keys by kind and id together, so ids may repeat across kinds', () => {
    const s = sessionOf(note('x'), doc('x'))
    expect(s.tabs).toHaveLength(2)
    expect(tabKey(note('x'))).not.toBe(tabKey(doc('x')))
  })
})

describe('activateTab', () => {
  it('does not open a tab that is not there', () => {
    const s = sessionOf(note('a'))
    expect(activateTab(s, doc('ghost'))).toBe(s)
  })
})

describe('closeTab', () => {
  it('focuses the tab that takes its place', () => {
    const s = activateTab(sessionOf(note('a'), doc('b'), note('c')), doc('b'))
    expect(activeTab(closeTab(s, doc('b')))).toEqual(note('c'))
  })

  it('falls back to the last tab when the end of the strip closes', () => {
    const s = sessionOf(note('a'), doc('b'))
    expect(activeTab(closeTab(s, doc('b')))).toEqual(note('a'))
  })

  it('leaves focus alone when an inactive tab closes', () => {
    const s = sessionOf(note('a'), doc('b'))
    expect(activeTab(closeTab(s, note('a')))).toEqual(doc('b'))
  })

  it('empties the session, active key included', () => {
    const s = closeTab(sessionOf(note('a')), note('a'))
    expect(s.tabs).toEqual([])
    expect(s.activeKey).toBeNull()
    expect(activeTab(s)).toBeNull()
  })

  it('ignores a tab it never had', () => {
    const s = sessionOf(note('a'))
    expect(closeTab(s, doc('ghost'))).toBe(s)
  })
})

describe('cycleTab', () => {
  it('moves forward and back from the active tab', () => {
    const s = activateTab(sessionOf(note('a'), doc('b'), note('c')), doc('b'))
    expect(cycleTab(s, 1)).toEqual(note('c'))
    expect(cycleTab(s, -1)).toEqual(note('a'))
  })

  it('wraps at both ends, so the key never reads as broken', () => {
    const s = sessionOf(note('a'), doc('b')) // 'b' is active, and last
    expect(cycleTab(s, 1)).toEqual(note('a'))
    expect(cycleTab(activateTab(s, note('a')), -1)).toEqual(doc('b'))
  })

  it('answers from the edge when nothing is focused', () => {
    const s = { ...sessionOf(note('a'), doc('b')), activeKey: null }
    expect(cycleTab(s, 1)).toEqual(note('a'))
    expect(cycleTab(s, -1)).toEqual(doc('b'))
  })

  it('has nothing to offer in an empty session', () => {
    expect(cycleTab(EMPTY_SESSION, 1)).toBeNull()
  })
})

describe('pruneTabs', () => {
  it('drops vanished entities and re-focuses when the active one goes', () => {
    const s = sessionOf(note('a'), doc('gone'))
    const pruned = pruneTabs(s, (t) => t.id !== 'gone')
    expect(pruned.tabs).toEqual([note('a')])
    expect(activeTab(pruned)).toEqual(note('a'))
  })

  it('is identity when everything still exists', () => {
    const s = sessionOf(note('a'))
    expect(pruneTabs(s, () => true)).toBe(s)
  })
})

describe('slotsFor', () => {
  it('sets exactly one slot', () => {
    const slots = slotsFor(doc('d1'))
    expect(slots.activeDocId).toBe('d1')
    expect(Object.values(slots).filter(Boolean)).toEqual(['d1'])
  })

  it('clears every slot when nothing is open', () => {
    expect(Object.values(slotsFor(null)).filter(Boolean)).toEqual([])
  })

  it('round-trips through the legacy slot shape', () => {
    expect(tabFromSlots(slotsFor(note('n1')))).toEqual(note('n1'))
    expect(tabFromSlots(slotsFor(null))).toBeNull()
  })
})

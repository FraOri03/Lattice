import { describe, expect, it } from 'vitest'
import { replacesContent, sectionState } from './sectionState'

/**
 * 13.5 §9 names "the state chosen for a given data condition" as a pure unit.
 * These are the precedences that matter, and the two states 13.3 exists to keep
 * apart.
 */

describe('sectionState', () => {
  it('shows content when there is something to show', () => {
    expect(sectionState({ total: 3 })).toBe('content')
    expect(sectionState({ total: 3, filtered: 1 })).toBe('content')
  })

  it('tells "there is nothing" apart from "your filter excludes it"', () => {
    expect(sectionState({ total: 0 })).toBe('empty')
    expect(sectionState({ total: 5, filtered: 0 })).toBe('no-results')
  })

  it('never offers an empty state for a source that does not exist', () => {
    // 13.3: an empty state may only be shown where the section could have had
    // content. This is the false negative the whole rule exists to prevent.
    expect(sectionState({ unavailable: true, total: 0 })).toBe('unavailable')
    expect(sectionState({ unavailable: true, total: 5, filtered: 0 })).toBe('unavailable')
  })

  it('outranks every other state, because a missing source was never read', () => {
    expect(sectionState({ unavailable: true, loading: true, error: true, total: 0 })).toBe(
      'unavailable',
    )
  })

  it('puts failure above counting, because a failed read knows no count', () => {
    expect(sectionState({ loading: true, total: 0 })).toBe('loading')
    expect(sectionState({ error: true, total: 0 })).toBe('error')
    expect(sectionState({ offline: true, total: 0 })).toBe('offline')
  })

  it('orders the three failures loading → error → offline', () => {
    expect(sectionState({ loading: true, error: true, offline: true, total: 1 })).toBe('loading')
    expect(sectionState({ error: true, offline: true, total: 1 })).toBe('error')
  })

  it('knows which states take the section over', () => {
    expect(replacesContent('content')).toBe(false)
    for (const s of ['loading', 'error', 'offline', 'unavailable', 'empty', 'no-results'] as const) {
      expect(replacesContent(s)).toBe(true)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { groupSections, matchTier, rank, type Rankable } from './rank'

/**
 * The ranking rules of 13.4 §3, asserted without a palette.
 *
 * These are the cases `includes()` in insertion order got wrong, which is the
 * whole reason the tiers exist.
 */

const item = (name: string, extra: Partial<Rankable> = {}): Rankable => ({
  key: extra.key ?? name,
  name,
  section: extra.section ?? 'files',
  ...extra,
})

describe('matchTier', () => {
  it('puts an exact name above one that merely starts with the query', () => {
    expect(matchTier('Budget', 'budget')).toBe(0)
    expect(matchTier('Budget 2026', 'budget')).toBe(1)
  })

  it('reaches a word inside a filename before falling back to "anywhere"', () => {
    // the separators filenames actually use, not just spaces
    expect(matchTier('q2-budget.xlsx', 'budget')).toBe(2)
    expect(matchTier('rebudgeting', 'budget')).toBe(3)
  })

  it('answers null when nothing matches, and everything for an empty query', () => {
    expect(matchTier('Budget', 'zzz')).toBeNull()
    expect(matchTier('Budget', '')).toBe(3)
    expect(matchTier('Budget', '   ')).toBe(3)
  })

  it('ignores case and surrounding space on both sides', () => {
    expect(matchTier('  Budget  ', 'BUDGET')).toBe(0)
  })
})

describe('rank', () => {
  it('orders by tier before anything else', () => {
    const out = rank(
      [item('Quarterly budget notes'), item('Budget'), item('Budget 2026')],
      'budget',
    )
    expect(out.map((i) => i.name)).toEqual(['Budget', 'Budget 2026', 'Quarterly budget notes'])
  })

  it('prefers what you opened recently inside a tier', () => {
    const out = rank(
      [item('Budget beta', { recentRank: 3 }), item('Budget alpha'), item('Budget gamma', { recentRank: 0 })],
      'budget',
    )
    expect(out.map((i) => i.name)).toEqual(['Budget gamma', 'Budget beta', 'Budget alpha'])
  })

  it('prefers the open project once recency does not decide it', () => {
    const out = rank(
      [item('Budget zeta'), item('Budget alpha', { inActiveProject: true })],
      'budget',
    )
    expect(out[0].name).toBe('Budget alpha')
  })

  it('breaks an action-versus-thing tie toward the thing', () => {
    // "a document you already made is more specific than a command that would
    // make another one" — 13.4 §3
    const out = rank(
      [item('New note', { section: 'create', isAction: true }), item('New note', { key: 'thing' })],
      'new note',
    )
    expect(out[0].key).toBe('thing')
  })

  it('is a total order, so equals never reshuffle between renders', () => {
    const pool = [item('Same', { key: 'b' }), item('Same', { key: 'a' })]
    expect(rank(pool, 'same').map((i) => i.key)).toEqual(['a', 'b'])
    expect(rank([...pool].reverse(), 'same').map((i) => i.key)).toEqual(['a', 'b'])
  })

  it('drops what does not match at all', () => {
    expect(rank([item('Budget'), item('Roadmap')], 'budget').map((i) => i.name)).toEqual([
      'Budget',
    ])
  })
})

describe('groupSections', () => {
  it('orders sections by their best-scoring member, not by a fixed list', () => {
    // the query starts with "new", so seven create commands would bury an
    // exact-match document under a fixed order
    const out = groupSections(
      rank(
        [
          item('New note', { section: 'create', isAction: true }),
          item('New board', { section: 'create', isAction: true }),
          item('New hire onboarding', { key: 'doc', section: 'files' }),
        ],
        'new hire',
      ),
    )
    expect(out[0].section).toBe('files')
  })

  it('caps each section at five and the whole list at twenty', () => {
    const many = (section: Rankable['section'], n: number) =>
      Array.from({ length: n }, (_, i) => item(`${section} ${i}`, { key: `${section}${i}`, section }))
    const out = groupSections(rank([...many('files', 9), ...many('boards', 9)], ''))
    expect(out.every((g) => g.items.length <= 5)).toBe(true)
    expect(out.reduce((n, g) => n + g.items.length, 0)).toBe(10)
  })

  it('spends the overall budget on the best sections first', () => {
    const many = (section: Rankable['section'], n: number) =>
      Array.from({ length: n }, (_, i) => item(`${section} ${i}`, { key: `${section}${i}`, section }))
    const out = groupSections(rank([...many('files', 4), ...many('boards', 4)], ''), 5, 6)
    expect(out[0].items).toHaveLength(4)
    expect(out[1].items).toHaveLength(2)
  })
})

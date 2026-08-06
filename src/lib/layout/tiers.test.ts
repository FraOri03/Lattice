import { describe, expect, it } from 'vitest'
import {
  atLeast,
  capabilityAt,
  ceilingQuery,
  panelsAreDocked,
  splitAvailable,
  tierForWidth,
  tierFromCeilings,
  TIER_MIN_WIDTH,
  TIERS,
  type ViewportTier,
} from './tiers'
import type { ViewMode } from '@/types/model'

/**
 * The tier model is the one place phase 12 records what the shell does as it
 * narrows. Two things matter most here and neither is about a number being
 * pretty: the boundaries land where 12.0 measured them, and the two ways of
 * asking for a tier — from a width, and from media queries — can never
 * disagree, because the shell will use both.
 */

/** Evaluate a `(max-width: Npx)` query the way a browser would. */
function matcherFor(width: number) {
  return (query: string) => {
    const max = Number(/\(max-width: ([\d.]+)px\)/.exec(query)?.[1])
    return width <= max
  }
}

describe('tierForWidth', () => {
  it.each([
    [320, 'viewer'],
    [767, 'viewer'],
    [768, 'drawer'],
    [1023, 'drawer'],
    [1099, 'drawer'],
    [1100, 'compact'],
    [1439, 'compact'],
    [1440, 'full'],
    [1920, 'full'],
  ] as const)('%ipx is the %s tier', (width, tier) => {
    expect(tierForWidth(width)).toBe(tier)
  })

  it('does not promote a fractional width to the tier above', () => {
    expect(tierForWidth(767.5)).toBe('viewer')
    expect(tierForWidth(1439.99)).toBe('compact')
  })

  it('keeps 1024 inside the drawer tier', () => {
    // the familiar breakpoint is deliberately not a boundary: at a 1024
    // viewport the top bar's box is 784, which is where the shell's overflow
    // actually comes from
    expect(tierForWidth(1024)).toBe('drawer')
  })
})

describe('ceilingQuery', () => {
  it('asks about ceilings, so that no match means the roomiest tier', () => {
    expect(ceilingQuery('viewer')).toBe('(max-width: 767.98px)')
    expect(ceilingQuery('drawer')).toBe('(max-width: 1099.98px)')
    expect(ceilingQuery('compact')).toBe('(max-width: 1439.98px)')
  })

  it('gives the top tier no ceiling', () => {
    expect(ceilingQuery('full')).toBeNull()
  })

  it('resolves to full when nothing matches', () => {
    // the environment that answers false to everything is jsdom's shim, and
    // it must not drop the whole component suite into the viewer tier
    expect(tierFromCeilings(() => false)).toBe('full')
  })
})

describe('the two ways of asking agree', () => {
  const widths = [320, 480, 767, 767.5, 768, 900, 1024, 1099, 1100, 1280, 1439, 1440, 1680, 2560]

  it.each(widths)('%ipx resolves the same from a width and from media queries', (width) => {
    expect(tierFromCeilings(matcherFor(width))).toBe(tierForWidth(width))
  })
})

describe('atLeast', () => {
  it('orders the tiers by room', () => {
    expect(atLeast('full', 'compact')).toBe(true)
    expect(atLeast('compact', 'compact')).toBe(true)
    expect(atLeast('drawer', 'compact')).toBe(false)
  })

  it('agrees with the declared minimum widths', () => {
    const ascending = [...TIERS].sort((a, b) => TIER_MIN_WIDTH[a] - TIER_MIN_WIDTH[b])
    expect(ascending).toEqual([...TIERS])
  })
})

describe('what each tier allows', () => {
  it('docks the panels down to Compact and no further', () => {
    expect(panelsAreDocked('full')).toBe(true)
    expect(panelsAreDocked('compact')).toBe(true)
    expect(panelsAreDocked('drawer')).toBe(false)
    expect(panelsAreDocked('viewer')).toBe(false)
  })

  it('keeps Split a Full-tier layout', () => {
    expect(splitAvailable('full')).toBe(true)
    expect(splitAvailable('compact')).toBe(false)
    expect(splitAvailable('drawer')).toBe(false)
    expect(splitAvailable('viewer')).toBe(false)
  })
})

describe('capabilityAt', () => {
  const editable: ViewMode[] = ['board', 'doc', 'sheet', 'code', 'presentation', 'photo']

  it.each(['full', 'compact', 'drawer'] as ViewportTier[])(
    'edits everything at the %s tier',
    (tier) => {
      for (const mode of editable) expect(capabilityAt(mode, tier)).toBe('edit')
    },
  )

  it('never claims the graph is editable', () => {
    for (const tier of TIERS) expect(capabilityAt('graph', tier)).toBe('navigate')
  })

  it('keeps notes and documents editable in the viewer tier', () => {
    expect(capabilityAt('doc', 'viewer')).toBe('edit')
  })

  it('lets the board be moved around but not laid out', () => {
    expect(capabilityAt('board', 'viewer')).toBe('navigate')
  })

  it.each(['sheet', 'code', 'presentation', 'photo'] as ViewMode[])(
    'is honest that %s does not work in the viewer tier',
    (mode) => {
      expect(capabilityAt(mode, 'viewer')).toBe('desktop-only')
    },
  )
})

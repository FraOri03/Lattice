import { useSyncExternalStore } from 'react'
import { TIERS, ceilingQuery, tierFromCeilings, type ViewportTier } from './tiers'

/**
 * The current viewport tier, as a subscription.
 *
 * `matchMedia` rather than a resize listener: the browser already knows when a
 * threshold is crossed and says so once, where a resize listener fires on every
 * intermediate pixel and then has to compare its way back to the same answer.
 *
 * The queries are the tier *ceilings* built in [`tiers`](./tiers.ts), so an
 * environment without `matchMedia` — or with an inert shim, which is what the
 * test setup installs — resolves to `full` rather than to the narrowest tier.
 * See `ceilingQuery` for why that direction is the safe one.
 */

const CEILINGS: string[] = TIERS.map(ceilingQuery).filter((q): q is string => q !== null)

function canQuery(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/**
 * The tier right now, outside React. For services and event handlers, in the
 * same spirit as the pure form of `openEntity` — anything that needs the tier
 * without being a component reads it here instead of growing its own listener.
 */
export function getViewportTier(): ViewportTier {
  if (!canQuery()) return 'full'
  return tierFromCeilings((query) => window.matchMedia(query).matches)
}

/**
 * Fresh `MediaQueryList`s per subscription rather than module-level ones: a
 * cached list holds the `matchMedia` that existed when this module was first
 * imported, which in a test suite is not the one the test installed.
 */
function subscribe(onChange: () => void): () => void {
  if (!canQuery()) return () => {}
  const lists = CEILINGS.map((query) => window.matchMedia(query))
  for (const list of lists) list.addEventListener('change', onChange)
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange)
  }
}

export function useViewportTier(): ViewportTier {
  // the snapshot is a string, so React's identity check is a value check and
  // there is nothing to memoise
  return useSyncExternalStore(subscribe, getViewportTier, () => 'full' as ViewportTier)
}

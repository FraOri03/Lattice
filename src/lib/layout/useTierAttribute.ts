import { useEffect } from 'react'
import { useViewportTier } from './useViewportTier'
import type { ViewportTier } from './tiers'

/**
 * Publish the current tier on `:root` as `data-tier`, and return it.
 *
 * The same contract the theme has: one writer, mounted once in `AppShell`
 * above the surface switch. A second writer is how CSS and JS start
 * disagreeing about which tier is current — which is the failure 12.0 recorded
 * as F4, one level up: a stylesheet asking the viewport a question the layout
 * was not constrained by.
 *
 * With the tier on the root, a rule can be written against `[data-tier]`
 * instead of against a `min-width` and cannot drift from what the components
 * believe. It is also the fastest way to see, in devtools, which tier the app
 * thinks it is in.
 */
export function useTierAttribute(): ViewportTier {
  const tier = useViewportTier()

  useEffect(() => {
    document.documentElement.dataset.tier = tier
  }, [tier])

  return tier
}

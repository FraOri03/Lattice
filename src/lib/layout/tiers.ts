import type { ViewMode } from '@/types/model'

/**
 * Viewport tiers — the adaptive shell's model, with no React in sight.
 *
 * Phase 12.0 measured what the shell actually does as it narrows
 * (docs/responsive-audit-phase-12.md) and turned the answer into four tiers.
 * This module is that answer in one place: the thresholds, and every rule that
 * reads off them. Nothing here touches the DOM, so the rules can be asserted
 * without mounting anything — which is the point, because a rule that only
 * runs inside a mounted component is a rule nobody can check.
 *
 * The thresholds are widths at which something specific stops fitting, not
 * device sizes:
 *
 * - **1440** — below this the top bar cannot hold its content. It asks for
 *   1400 px in Italian and the box it lives in is the viewport minus the
 *   240 px sidebar, so the page starts scrolling sideways at ~1640.
 * - **1100** — below this the Board is left under 600 px of canvas with the
 *   sidebar and inspector both docked (240 + 280 of permanent chrome).
 * - **768** — below this a docked panel and a usable editor cannot coexist at
 *   any ratio.
 *
 * 1024 is the familiar number and it is deliberately not one of these: at a
 * 1024 viewport the top bar's box is 784, and keying anything to 1024 is how
 * the shell ended up showing eight labels into a box that fits five.
 */

/** Ascending order — least room first. The array *is* the ordering. */
export const TIERS = ['viewer', 'drawer', 'compact', 'full'] as const

export type ViewportTier = (typeof TIERS)[number]

/** Inclusive lower bound of each tier, in CSS px. */
export const TIER_MIN_WIDTH: Record<ViewportTier, number> = {
  viewer: 0,
  drawer: 768,
  compact: 1100,
  full: 1440,
}

export function tierForWidth(width: number): ViewportTier {
  let tier: ViewportTier = 'viewer'
  for (const candidate of TIERS) {
    if (width >= TIER_MIN_WIDTH[candidate]) tier = candidate
  }
  return tier
}

/** True when `tier` has at least as much room as `floor`. */
export function atLeast(tier: ViewportTier, floor: ViewportTier): boolean {
  return TIERS.indexOf(tier) >= TIERS.indexOf(floor)
}

/**
 * The media query for "the viewport is at most this tier", or null for `full`,
 * which has no ceiling.
 *
 * Ceilings rather than floors, and this is not a style choice: where
 * `matchMedia` is missing or inert — jsdom's shim answers `false` to
 * everything — every query failing has to mean *the roomiest* tier, or the
 * entire component suite would silently move into the viewer tier the day the
 * shell starts reading this. With ceilings, "nothing matches" is `full`.
 *
 * The .02 is the standard guard for fractional viewport widths (a zoomed
 * 767.5 px window must still be the viewer tier, not the one above it).
 */
export function ceilingQuery(tier: ViewportTier): string | null {
  const next = TIERS[TIERS.indexOf(tier) + 1]
  if (!next) return null
  return `(max-width: ${TIER_MIN_WIDTH[next] - 0.02}px)`
}

/**
 * Resolve the tier from the ceiling queries: the narrowest tier whose ceiling
 * matches, and `full` when none does. Pure so the resolution can be tested
 * without a DOM; `useViewportTier` supplies the real `matchMedia`.
 */
export function tierFromCeilings(matches: (query: string) => boolean): ViewportTier {
  for (const tier of TIERS) {
    const query = ceilingQuery(tier)
    if (query && matches(query)) return tier
  }
  return 'full'
}

/**
 * Are the sidebar and inspector docked beside the content, or overlaid as
 * drawers? Docked below Compact leaves the Board under 600 px of canvas, which
 * is the measurement 1100 comes from.
 */
export function panelsAreDocked(tier: ViewportTier): boolean {
  return atLeast(tier, 'compact')
}

/**
 * Split is a Full-tier layout (settled in 12.0). Two panes at 1100 px leave
 * roughly 290 px each once the chrome is paid for — under the width at which
 * any editor is usable — so allowing it there produces two broken panes
 * instead of one working one.
 */
export function splitAvailable(tier: ViewportTier): boolean {
  return atLeast(tier, 'full')
}

/**
 * What a section offers at a given tier.
 *
 * - `edit` — the section works as it does on a desktop.
 * - `navigate` — you can move around and comment, but not modify.
 * - `desktop-only` — an honest panel instead of an editor that cannot work
 *   here. Monaco, the 26-column grid and the 960×540 slide stage do not become
 *   usable at 390 px, and rendering them anyway is the failure 12.0 recorded as
 *   F6: the app zooming itself to 39% rather than admitting the limit.
 */
export type SectionCapability = 'edit' | 'navigate' | 'desktop-only'

const VIEWER_CAPABILITY: Record<ViewMode, SectionCapability> = {
  // notes and rich documents are the two editors that genuinely work under a
  // thumb, and writing one down is the realistic phone job
  doc: 'edit',
  // the canvas pans, zooms and opens a card; it does not lay one out
  board: 'navigate',
  // a read-only view by nature — the tier changes nothing about it
  graph: 'navigate',
  sheet: 'desktop-only',
  code: 'desktop-only',
  presentation: 'desktop-only',
  // Photo is a planning surface that docks three panels of its own; it is in
  // this list by the same rule as the grid, not by a separate decision
  photo: 'desktop-only',
}

export function capabilityAt(mode: ViewMode, tier: ViewportTier): SectionCapability {
  if (atLeast(tier, 'drawer')) return mode === 'graph' ? 'navigate' : 'edit'
  return VIEWER_CAPABILITY[mode]
}

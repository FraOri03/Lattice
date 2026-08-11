/**
 * The settings screen's sections (Phase 14.1).
 *
 * One flat, ordered list: the side navigation renders it, the URL addresses it
 * (`?s=<section>`) and `resolveNav` validates against it, so a link can point
 * at the exact panel that fixes a problem instead of at "settings, go find it".
 *
 * Deliberately flat. A two-level settings tree needs more than nine leaves to
 * earn its extra click, and every grouping proposed for these nine put
 * "Storage and sync" in a different place depending on who was asked.
 *
 * Pure on purpose — no React, no store — so ordering and validation can be
 * asserted without a DOM, the way `lib/layout/tiers` and `lib/nav/navUrl` are.
 */

export type SettingsSection =
  | 'account'
  | 'profile'
  | 'appearance'
  | 'notifications'
  | 'security'
  | 'connections'
  | 'storage'
  | 'billing'
  | 'developer'

/** Render order of the side navigation. The first entry is the default. */
export const SETTINGS_SECTIONS = [
  'account',
  'profile',
  'appearance',
  'notifications',
  'security',
  'connections',
  'storage',
  'billing',
  'developer',
] as const satisfies readonly SettingsSection[]

/** Where the screen opens when nothing more specific is asked for. */
export const DEFAULT_SETTINGS_SECTION: SettingsSection = SETTINGS_SECTIONS[0]

export function isSettingsSection(x: string | undefined | null): x is SettingsSection {
  return !!x && (SETTINGS_SECTIONS as readonly string[]).includes(x)
}

/**
 * The section a deep link resolves to: an unknown value opens the screen at
 * its default rather than refusing to open it. A stale link is still a request
 * to see settings — the same degradation rule the rest of the URL contract
 * follows (an unknown mode becomes `board`, an unknown project becomes Home).
 */
export function resolveSettingsSection(raw: string | undefined | null): SettingsSection {
  return isSettingsSection(raw) ? raw : DEFAULT_SETTINGS_SECTION
}

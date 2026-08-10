import type { Theme } from '@/types/model'

/**
 * Appearance preferences (Phase 14.3).
 *
 * Five settings, one rule: **the preference and the applied value are
 * different things.** `theme` stays the resolved 'dark' | 'light' every
 * consumer already reads; `themePreference` is what the user asked for, and
 * 'system' is a live answer, not a one-off copy of the OS at the moment you
 * clicked. The same split lets `motion: 'system'` defer to the media query
 * while `'reduce'` overrides it — a preference can only be honoured by JS
 * timings if something other than the media query can say so.
 *
 * Pure: the resolution rules are asserted without a DOM, and the DOM writer
 * (`useAppearanceAttributes`) is the only place that touches the document.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ContrastPreference = 'normal' | 'high'
export type DensityPreference = 'comfortable' | 'compact'
export type UiScalePreference = 'small' | 'default' | 'large'
export type MotionPreference = 'system' | 'reduce'

export interface Appearance {
  theme: ThemePreference
  contrast: ContrastPreference
  density: DensityPreference
  uiScale: UiScalePreference
  motion: MotionPreference
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  contrast: 'normal',
  density: 'comfortable',
  uiScale: 'default',
  motion: 'system',
}

/** What each UI size actually does. `zoom` scales layout, so px sizes follow. */
export const UI_SCALE_FACTOR: Record<UiScalePreference, number> = {
  small: 0.9,
  default: 1,
  large: 1.15,
}

/**
 * The theme to apply. 'system' follows the OS, which is why the caller passes
 * the current media-query answer rather than this module reading it: the
 * listener that re-runs on change lives with the DOM writer.
 */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/**
 * Whether motion should be reduced, given the preference and what the OS says.
 *
 * 'system' defers; 'reduce' overrides. There is deliberately no 'full' that
 * overrides the OS the other way: someone who asked their operating system for
 * less motion did not ask an app to argue.
 */
export function motionReduced(preference: MotionPreference, systemReduced: boolean): boolean {
  return preference === 'reduce' || systemReduced
}

/** Preference → the `data-*` attributes the stylesheet keys off. */
export function appearanceAttributes(
  appearance: Appearance,
  resolved: { theme: Theme; motionReduced: boolean },
): Record<string, string> {
  return {
    theme: resolved.theme,
    contrast: appearance.contrast,
    density: appearance.density,
    motion: resolved.motionReduced ? 'reduce' : 'full',
  }
}

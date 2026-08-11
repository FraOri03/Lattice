import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import {
  UI_SCALE_FACTOR,
  appearanceAttributes,
  motionReduced,
  resolveTheme,
} from './appearance'
import { setMotionOverride } from './animateTheme'

/**
 * Publishes the appearance preferences on the document (Phase 14.3) — the one
 * place that touches the DOM for them, the way `useTierAttribute` owns
 * `data-tier`.
 *
 * Three jobs:
 *  - keep the resolved theme in step with the OS while the preference is
 *    'system' (a live answer, not a copy taken at click time);
 *  - write `data-contrast`, `data-density` and `data-motion` for the
 *    stylesheet, and the UI scale as a `zoom` on the root;
 *  - tell `animateTheme` about the motion preference, because a JS timer
 *    cannot be shortened by a media query the stylesheet honours.
 */

const DARK_QUERY = '(prefers-color-scheme: dark)'
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.(query).matches

export function useAppearance(): void {
  const appearance = useStore((s) => s.appearance)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  // 'system' is a subscription, not a snapshot: switching the OS to light in
  // the middle of a session has to reach a window that is already open
  useEffect(() => {
    if (appearance.theme !== 'system') return
    const media = window.matchMedia?.(DARK_QUERY)
    if (!media) return
    const sync = () => {
      const next = resolveTheme('system', media.matches)
      if (next !== useStore.getState().theme) setTheme(next)
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [appearance.theme, setTheme])

  // an explicit light/dark preference wins over whatever the theme was left at
  useEffect(() => {
    if (appearance.theme === 'system') return
    if (appearance.theme !== theme) setTheme(appearance.theme)
  }, [appearance.theme, theme, setTheme])

  useEffect(() => {
    const media = window.matchMedia?.(REDUCE_QUERY)
    const publish = () => {
      const reduced = motionReduced(appearance.motion, matches(REDUCE_QUERY))
      const attrs = appearanceAttributes(appearance, {
        theme: useStore.getState().theme,
        motionReduced: reduced,
      })
      const root = document.documentElement
      for (const [key, value] of Object.entries(attrs)) root.dataset[key] = value
      // zoom scales layout, so the app's fixed px sizes follow it — a root
      // font-size would not, since almost nothing here is sized in rem
      const factor = UI_SCALE_FACTOR[appearance.uiScale]
      root.style.setProperty('--ui-scale', String(factor))
      setMotionOverride(appearance.motion === 'reduce')
    }
    publish()
    media?.addEventListener('change', publish)
    return () => media?.removeEventListener('change', publish)
  }, [appearance, theme])
}

import type { Theme } from '@/types/model'

/**
 * Day ⇄ night as a transition rather than a flip.
 *
 * Two paths, picked by what the browser can do:
 *
 * 1. **View Transitions** (Chromium today) — the outgoing theme is frozen
 *    as a snapshot and the incoming one is revealed by a circle growing
 *    from wherever the user clicked. Nothing cross-fades, so there is no
 *    washed-out midpoint where text sits on the wrong background.
 * 2. **Everything else** — a class on `<html>` that transitions the
 *    colour-carrying properties for the length of the switch, then comes
 *    off so no other interaction in the app pays for it.
 *
 * Both are skipped for `prefers-reduced-motion: reduce`: the stylesheet
 * can flatten a CSS duration, but a JS-driven clip-path has to opt out
 * here.
 *
 * The DOM attribute is written directly instead of waiting for React's
 * effect, because a view transition captures the DOM synchronously inside
 * its callback — a state update that lands a tick later would be captured
 * as "no change". The store is updated in the same breath, and the shell's
 * effect then writes the identical value: idempotent, no flicker.
 */

/**
 * The DOM lib types `startViewTransition` as always present; browsers do
 * not, so every use goes through this runtime check rather than the type.
 */
function viewTransitions(): Document['startViewTransition'] | null {
  return typeof document.startViewTransition === 'function'
    ? document.startViewTransition.bind(document)
    : null
}

/** How long the reveal (or the crossfade) runs. */
export const THEME_ANIM_MS = 420

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export interface ThemeOrigin {
  x: number
  y: number
}

/** Distance from a point to the furthest corner of the viewport. */
function coverRadius({ x, y }: ThemeOrigin): number {
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
}

export function setThemeAnimated(
  next: Theme,
  commit: (theme: Theme) => void,
  origin?: ThemeOrigin,
): void {
  const root = document.documentElement
  const apply = () => {
    root.dataset.theme = next
    commit(next)
  }

  if (typeof document === 'undefined' || prefersReducedMotion()) {
    apply()
    return
  }

  const start = origin ? viewTransitions() : null
  if (origin && start) {
    const transition = start(apply)
    void transition.ready
      .then(() => {
        const radius = coverRadius(origin)
        root.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration: THEME_ANIM_MS,
            easing: 'cubic-bezier(.4, 0, .2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        )
      })
      // a skipped transition rejects `ready`; the theme still changed
      .catch(() => {})
    return
  }

  root.classList.add('theme-anim')
  apply()
  window.setTimeout(() => root.classList.remove('theme-anim'), THEME_ANIM_MS)
}

/** The other half of the switch: which theme a click should move to. */
export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}

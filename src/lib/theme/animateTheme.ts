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

/** How long the fallback crossfade runs, and how long its class stays on. */
export const THEME_ANIM_MS = 420

/** How long the circular reveal runs. */
export const THEME_REVEAL_MS = 460

/**
 * Quick out of the control, then a short settle.
 *
 * The tail is the part to be careful with. An ease-out steep enough to be
 * exciting (`cubic-bezier(.16, 1, .3, 1)`, say) puts ~95% of the distance in
 * the first third and then creeps through the rest: the circle appears to
 * stop just short of the edges and the theme then changes when the animation
 * ends, which reads as a stall, not as a reveal. This curve keeps some slope
 * at the end so the circle is still visibly moving when it leaves the screen.
 */
const REVEAL_EASING = 'cubic-bezier(.22, .68, .3, 1)'

/**
 * How far past the furthest corner the circle finishes. The reveal is over
 * for the viewer once the circle clears the screen; running to exactly the
 * corner spends the least readable part of the curve on the most visible
 * moment. The overshoot is off-screen, so it costs nothing to watch.
 */
const COVER_SLACK = 1.12

/**
 * The app's own reduced-motion preference (14.3), when the user set one.
 *
 * A stylesheet's `@media (prefers-reduced-motion)` cannot shorten a JS timer,
 * so the preference has to be readable from code as well — this is where the
 * two meet. `useAppearance` keeps it in step; nothing else writes it.
 */
let motionOverride = false

export function setMotionOverride(reduce: boolean): void {
  motionOverride = reduce
}

export function prefersReducedMotion(): boolean {
  if (motionOverride) return true
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export interface ThemeOrigin {
  x: number
  y: number
  /**
   * Radius the reveal starts at. Given the pressed control's own radius, the
   * circle leaves the button at the size of the button instead of appearing
   * out of a mathematical point — the first frames are the ones the eye is
   * on, and starting at zero spends them on something too small to read.
   */
  r?: number
}

/** Radius that clears the whole viewport from a point, with room to spare. */
function coverRadius({ x, y }: ThemeOrigin): number {
  const corner = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )
  return corner * COVER_SLACK
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
              `circle(${origin.r ?? 0}px at ${origin.x}px ${origin.y}px)`,
              `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration: THEME_REVEAL_MS,
            easing: REVEAL_EASING,
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

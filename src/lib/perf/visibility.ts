/**
 * Pure visibility helpers for the off-screen animation pausing (PERF-2).
 * Kept separate so the "should this keep animating?" decision is testable
 * without a DOM, IntersectionObserver or WebGL.
 */

/** A viewer should run its animation loop only when it is on-screen AND the
 *  page (tab) is visible. Either being false must fully suspend the loop. */
export function computeActive(onScreen: boolean, pageVisible: boolean): boolean {
  return onScreen && pageVisible
}

/** A loop should run only when the viewer is active AND holds a budget slot. */
export function shouldAnimate(active: boolean, hasSlot: boolean): boolean {
  return active && hasSlot
}

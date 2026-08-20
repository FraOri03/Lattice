import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * The observed width of an element, or `null` until it has been measured.
 *
 * `useViewportTier` answers "how big is the window"; this answers "how big is
 * this box", which is the question a control inside the shell actually has —
 * the window is the same width whether the sidebar is docked, collapsed or
 * drawn over the content, and the box is not.
 *
 * Only ever read the width of a box whose size does NOT depend on the children
 * being measured, or the observer feeds itself: measure → hide a child → the
 * box shrinks → measure. The top bar qualifies (it is a full-width row in a
 * column), and that is the constraint, not a style preference.
 *
 * `useLayoutEffect` so the first real measurement lands before the browser
 * paints; on the server the effect never runs and the width stays `null`,
 * which callers must read as "assume it fits".
 *
 * Zero is reported as `null` for the same reason. jsdom has no layout engine
 * and answers 0 for every box, and a display:none ancestor does the same in a
 * real browser — in neither case is 0 a measurement, and treating it as one
 * makes every consumer collapse to its narrowest form in the test suite.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null)
  const measured = (w: number) => setWidth(w > 0 ? w : null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // ResizeObserver is absent in jsdom and in very old browsers; measuring
    // once is still better than never, and `null` stays the safe fallback.
    measured(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    // border box, matching the initial rect — `contentRect` would drop the
    // element's own padding and quietly shift every threshold by it
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        measured(entry.borderBoxSize?.[0]?.inlineSize ?? el.getBoundingClientRect().width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return width
}

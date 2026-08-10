import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * How many toolbar items still fit (Phase 11.1.2a, wired in 12.4).
 *
 * The caller renders the first `visible` items and hands the rest to
 * `ToolbarOverflow`. The decision stays with the caller on purpose — a
 * primitive that silently reflowed its own children would be impossible to
 * test and surprising to debug.
 *
 * Item widths are cached the first time every item is on screen, so folding
 * items away does not destroy the measurement needed to bring them back when
 * the pane widens again. Without that cache the bar oscillates: fold, become
 * narrow enough to unfold, unfold, overflow, fold.
 */

/**
 * The pure half: given the items' widths and the room available, how many fit?
 *
 * Split out so the fold/unfold boundary can be asserted without a layout —
 * `ResizeObserver` and `clientWidth` do nothing in jsdom, which is exactly why
 * this decision spent a phase untested.
 */
export function fitCount(
  widths: number[],
  available: number,
  gap = 0,
  /** room to keep for the overflow trigger itself */
  reserve = 0,
): number {
  if (!widths.length) return 0
  const total = widths.reduce((sum, w) => sum + w + gap, 0)
  if (total <= available) return widths.length
  let used = 0
  let fits = 0
  for (const w of widths) {
    used += w + gap
    if (used > available - reserve) break
    fits++
  }
  // always keep one real control beside the overflow trigger: a bar that is
  // nothing but a "···" is a menu wearing a toolbar's clothes
  return Math.max(fits, 1)
}

export function useToolbarOverflow(
  rootRef: RefObject<HTMLElement | null>,
  count: number,
  /** room to keep for the overflow trigger itself */
  reserve = 32,
  /**
   * Where the available width comes from, when it is not the root's own.
   *
   * A toolbar that sizes to its content (`w-max`, or a floating pill centred
   * over a canvas) has a `clientWidth` equal to what it wants, never to what
   * it may have — measuring it against itself would find that everything
   * always fits. The board passes its canvas pane here.
   */
  boundsRef?: RefObject<HTMLElement | null>,
): number {
  const [visible, setVisible] = useState(count)
  const widths = useRef<number[] | null>(null)
  const overhead = useRef(0)

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const bounds = boundsRef?.current ?? root

    const measure = () => {
      const available = bounds.clientWidth
      // no layout (jsdom, display:none): never hide anything
      if (!available) {
        setVisible(count)
        return
      }
      const items = [...root.querySelectorAll<HTMLElement>('[data-toolbar-item]')]
      if (items.length === count) {
        widths.current = items.map((el) => el.offsetWidth)
        /**
         * Everything in the bar that is NOT a foldable item and still has to
         * fit: the pill's padding and border, the separators, and any control
         * the caller deliberately kept out of the fold. Measured the same way
         * and at the same time as the widths — when all the items are on
         * screen, the difference between the bar and their sum IS the chrome.
         *
         * Without it the hook compares the items against the pane and finds
         * room that the bar does not have: 252px of tools inside a 361px bar
         * looked like a comfortable fit in a 340px pane, and the bar was
         * clipped 11px each side while nothing folded.
         */
        overhead.current = Math.max(
          0,
          root.getBoundingClientRect().width -
            widths.current.reduce((sum, w) => sum + w, 0),
        )
      }
      const known = widths.current
      if (!known || known.length !== count) return
      const gap = parseFloat(getComputedStyle(root).columnGap || '0') || 0
      setVisible(fitCount(known, available - overhead.current, gap, reserve))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    if (bounds !== root) observer.observe(bounds)
    return () => observer.disconnect()
  }, [rootRef, boundsRef, count, reserve])

  return Math.min(visible, count)
}

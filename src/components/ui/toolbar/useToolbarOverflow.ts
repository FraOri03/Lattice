import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * How many toolbar items still fit (Phase 11.1.2a).
 *
 * The caller renders the first `visible` items and hands the rest to
 * `ToolbarOverflow`. The decision stays with the caller on purpose — a
 * primitive that silently reflowed its own children would be impossible to
 * test and surprising to debug.
 *
 * Item widths are cached the first time every item is on screen, so folding
 * items away does not destroy the measurement needed to bring them back when
 * the pane widens again.
 */
export function useToolbarOverflow(
  rootRef: RefObject<HTMLElement | null>,
  count: number,
  /** room to keep for the overflow trigger itself */
  reserve = 32,
): number {
  const [visible, setVisible] = useState(count)
  const widths = useRef<number[] | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      const available = root.clientWidth
      // no layout (jsdom, display:none): never hide anything
      if (!available) {
        setVisible(count)
        return
      }
      const items = [...root.querySelectorAll<HTMLElement>('[data-toolbar-item]')]
      if (items.length === count) {
        widths.current = items.map((el) => el.offsetWidth)
      }
      const known = widths.current
      if (!known || known.length !== count) return
      const gap = parseFloat(getComputedStyle(root).columnGap || '0') || 0
      const total = known.reduce((sum, w) => sum + w + gap, 0)
      if (total <= available) {
        setVisible(count)
        return
      }
      let used = 0
      let fits = 0
      for (const w of known) {
        used += w + gap
        if (used > available - reserve) break
        fits++
      }
      // always keep one real control beside the overflow trigger
      setVisible(Math.max(fits, 1))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [rootRef, count, reserve])

  return Math.min(visible, count)
}

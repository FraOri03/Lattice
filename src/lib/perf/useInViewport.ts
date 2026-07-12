import { useEffect, useRef, useState } from 'react'
import { computeActive } from './visibility'

/**
 * useInViewport — reports whether the attached element is on-screen (via
 * IntersectionObserver) and whether the page/tab is visible. `active` is the
 * conjunction: a viewer should keep animating only while `active` is true.
 *
 * The observer is disconnected on unmount (PERF-2 requires clean teardown of
 * observers and frames). Where IntersectionObserver is unavailable (older
 * environments / tests) it degrades to "always on-screen" so nothing breaks.
 */
export function useInViewport<T extends Element>(opts?: { rootMargin?: string }) {
  const ref = useRef<T | null>(null)
  const [onScreen, setOnScreen] = useState(false)
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setOnScreen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setOnScreen(entry.isIntersecting)
      },
      { rootMargin: opts?.rootMargin ?? '200px', threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [opts?.rootMargin])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVis = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return { ref, onScreen, pageVisible, active: computeActive(onScreen, pageVisible) }
}

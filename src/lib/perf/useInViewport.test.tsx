import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useInViewport } from './useInViewport'

/**
 * PERF-2 requires clean teardown of observers. This confirms useInViewport
 * observes its element on mount and disconnects the IntersectionObserver on
 * unmount (no leaked observers when cards remount during virtualization).
 */
function Probe() {
  const { ref } = useInViewport<HTMLDivElement>()
  return <div ref={ref} data-testid="probe" />
}

describe('useInViewport — observer lifecycle', () => {
  it('observes on mount and disconnects on unmount', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    const original = globalThis.IntersectionObserver
    class SpyObserver {
      constructor(_cb: IntersectionObserverCallback) {}
      observe = observe
      unobserve = vi.fn()
      disconnect = disconnect
      takeRecords = () => []
      root = null
      rootMargin = ''
      thresholds = []
    }
    globalThis.IntersectionObserver = SpyObserver as unknown as typeof IntersectionObserver

    const { unmount } = render(<Probe />)
    expect(observe).toHaveBeenCalledTimes(1)
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)

    globalThis.IntersectionObserver = original
  })
})

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getViewportTier, useViewportTier } from './useViewportTier'

/**
 * The hook is thin on purpose — the resolution lives in `tiers` and is tested
 * there without a DOM. What has to hold here is the wiring: it reports the
 * width it is given, it *re-reports* when a threshold is crossed, and it falls
 * back to the roomiest tier rather than the narrowest when the environment
 * cannot answer.
 */

const realMatchMedia = window.matchMedia

/** A `matchMedia` backed by a width you can move, with working listeners. */
function withViewport(initialWidth: number) {
  let width = initialWidth
  const listeners = new Set<() => void>()

  window.matchMedia = ((query: string) => ({
    get matches() {
      const max = Number(/\(max-width: ([\d.]+)px\)/.exec(query)?.[1])
      return width <= max
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia

  return {
    resizeTo(next: number) {
      width = next
      act(() => {
        for (const fn of listeners) fn()
      })
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

afterEach(() => {
  window.matchMedia = realMatchMedia
})

describe('useViewportTier', () => {
  it('reports the tier of the current viewport', () => {
    withViewport(1280)
    expect(renderHook(() => useViewportTier()).result.current).toBe('compact')
  })

  it('follows the viewport across a threshold', () => {
    const viewport = withViewport(1680)
    const { result } = renderHook(() => useViewportTier())
    expect(result.current).toBe('full')

    viewport.resizeTo(900)
    expect(result.current).toBe('drawer')

    viewport.resizeTo(390)
    expect(result.current).toBe('viewer')
  })

  it('unsubscribes on unmount', () => {
    const viewport = withViewport(1280)
    const { unmount } = renderHook(() => useViewportTier())
    expect(viewport.listenerCount).toBeGreaterThan(0)
    unmount()
    expect(viewport.listenerCount).toBe(0)
  })

  it('falls back to full where matchMedia cannot answer', () => {
    // jsdom's shim answers false to every query; the component suite must keep
    // seeing the desktop shell rather than silently move into the viewer tier
    expect(renderHook(() => useViewportTier()).result.current).toBe('full')
  })
})

describe('getViewportTier', () => {
  it('answers outside React for services and handlers', () => {
    withViewport(800)
    expect(getViewportTier()).toBe('drawer')
  })

  it('answers full when there is no matchMedia at all', () => {
    // @ts-expect-error — deleting the API is exactly the case under test
    delete window.matchMedia
    expect(getViewportTier()).toBe('full')
  })
})

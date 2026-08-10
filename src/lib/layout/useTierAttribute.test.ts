import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useTierAttribute } from './useTierAttribute'

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
  }
}

afterEach(() => {
  window.matchMedia = realMatchMedia
  delete document.documentElement.dataset.tier
})

describe('useTierAttribute', () => {
  it('publishes the tier on the root element', () => {
    withViewport(1280)
    renderHook(() => useTierAttribute())
    expect(document.documentElement.dataset.tier).toBe('compact')
  })

  it('keeps the attribute in step with the viewport', () => {
    const viewport = withViewport(1680)
    renderHook(() => useTierAttribute())
    expect(document.documentElement.dataset.tier).toBe('full')

    viewport.resizeTo(800)
    expect(document.documentElement.dataset.tier).toBe('drawer')

    viewport.resizeTo(390)
    expect(document.documentElement.dataset.tier).toBe('viewer')
  })

  it('returns the same tier it publishes, so callers need no second read', () => {
    withViewport(900)
    const { result } = renderHook(() => useTierAttribute())
    expect(result.current).toBe('drawer')
    expect(document.documentElement.dataset.tier).toBe(result.current)
  })
})

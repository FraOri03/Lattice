import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * jsdom lacks a few browser APIs the app touches (reduced-motion queries,
 * element measurement, viewport observers). Component tests never rely on
 * their behaviour — they only need them to exist so a mount doesn't throw.
 * The real logic lives in pure modules that are tested directly, so these
 * shims stay intentionally inert (no fake timers, no cloud, no flakiness).
 */

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopObserver
}
if (!('IntersectionObserver' in globalThis)) {
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    NoopObserver
}

afterEach(() => {
  cleanup()
})

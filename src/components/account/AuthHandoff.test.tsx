import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthHandoff, useAuthHandoff } from './AuthHandoff'

/**
 * The handoff is a timer that decides which surface is mounted, so getting
 * it wrong does not look like a broken animation — it looks like the app
 * failing to start. What matters: it only runs on the crossing, it always
 * reaches 'done', and reduced motion never gets stuck behind a cover.
 */

function withReducedMotion(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(() => {
  withReducedMotion(false)
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('useAuthHandoff', () => {
  it('does not cover an app that boots already signed in', () => {
    const { result } = renderHook(() => useAuthHandoff(true))
    expect(result.current).toBe('done')
    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current).toBe('done')
  })

  it('covers, swaps, then gets out of the way when the gate opens', () => {
    const { result, rerender } = renderHook(({ open }) => useAuthHandoff(open), {
      initialProps: { open: false },
    })
    expect(result.current).toBe('done')

    rerender({ open: true })
    expect(result.current).toBe('cover')

    act(() => void vi.advanceTimersByTime(220))
    expect(result.current).toBe('reveal')

    act(() => void vi.advanceTimersByTime(320))
    expect(result.current).toBe('done')
  })

  it('skips the whole sequence under reduced motion', () => {
    withReducedMotion(true)
    const { result, rerender } = renderHook(({ open }) => useAuthHandoff(open), {
      initialProps: { open: false },
    })
    rerender({ open: true })
    expect(result.current).toBe('done')
  })
})

describe('AuthHandoff', () => {
  it('renders nothing once the handoff is done', () => {
    const { container } = render(<AuthHandoff phase="done" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is hidden from assistive tech while it covers the screen', () => {
    render(<AuthHandoff phase="cover" />)
    // the brand mark is decoration between two surfaces that both name
    // themselves; announcing it would interrupt the handoff
    expect(screen.queryByRole('img')).toBeNull()
    expect(document.querySelector('.auth-cover')).toHaveAttribute('aria-hidden', 'true')
  })
})

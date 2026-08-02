import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTheme, setThemeAnimated, THEME_ANIM_MS } from './animateTheme'

/**
 * The theme switch has three paths and the wrong one is invisible until
 * someone with reduced motion, or a browser without View Transitions, is
 * watching. These pin which path runs, and that all three end with the
 * theme actually changed — the animation is decoration, the commit is not.
 */

const root = () => document.documentElement

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
  root().className = ''
  root().removeAttribute('style')
  root().dataset.theme = 'dark'
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'startViewTransition')
  // the stub is an own property on <html>, and jsdom shares one per file
  Reflect.deleteProperty(root(), 'animate')
})

describe('setThemeAnimated', () => {
  it('crossfades when the browser has no view transitions', () => {
    vi.useFakeTimers()
    const commit = vi.fn()

    setThemeAnimated('light', commit)

    expect(root().classList.contains('theme-anim')).toBe(true)
    expect(root().dataset.theme).toBe('light')
    expect(commit).toHaveBeenCalledWith('light')

    // the transition rule comes off again, so nothing else in the app pays
    vi.advanceTimersByTime(THEME_ANIM_MS + 10)
    expect(root().classList.contains('theme-anim')).toBe(false)
  })

  it('reveals through a view transition when one is available and a click point is known', () => {
    const start = vi.fn((update: () => void) => {
      update()
      return { ready: Promise.resolve(), finished: Promise.resolve() }
    })
    Object.defineProperty(document, 'startViewTransition', {
      value: start,
      configurable: true,
    })
    const commit = vi.fn()

    setThemeAnimated('light', commit, { x: 10, y: 10 })

    expect(start).toHaveBeenCalledOnce()
    expect(root().dataset.theme).toBe('light')
    expect(commit).toHaveBeenCalledWith('light')
    // the view transition owns the visuals, so no crossfade class is added
    expect(root().classList.contains('theme-anim')).toBe(false)
  })

  it('grows the circle out of the control and clear off the screen', async () => {
    const frames: Keyframe[] = []
    root().animate = ((k: Keyframe[] | PropertyIndexedKeyframes) => {
      frames.push(k as Keyframe)
      return { finished: Promise.resolve() } as unknown as Animation
    }) as Element['animate']
    Object.defineProperty(document, 'startViewTransition', {
      value: (update: () => void) => {
        update()
        return { ready: Promise.resolve(), finished: Promise.resolve() }
      },
      configurable: true,
    })

    setThemeAnimated('light', vi.fn(), { x: 0, y: 0, r: 14 })
    await Promise.resolve()

    const [from, to] = (frames[0] as unknown as { clipPath: string[] }).clipPath
    // it leaves the button at the button's own size, not from a point
    expect(from).toContain('circle(14px')
    // and finishes past the furthest corner: a circle that ends exactly on it
    // spends the flattest part of the easing on the last visible pixels, so
    // the reveal reads as stopping short of the edges
    const corner = Math.hypot(window.innerWidth, window.innerHeight)
    const radius = Number(/circle\(([\d.]+)px/.exec(to)![1])
    expect(radius).toBeGreaterThan(corner)
  })

  it('changes the theme with no animation at all under reduced motion', () => {
    withReducedMotion(true)
    const start = vi.fn()
    Object.defineProperty(document, 'startViewTransition', {
      value: start,
      configurable: true,
    })
    const commit = vi.fn()

    setThemeAnimated('light', commit, { x: 10, y: 10 })

    expect(start).not.toHaveBeenCalled()
    expect(root().classList.contains('theme-anim')).toBe(false)
    expect(root().dataset.theme).toBe('light')
    expect(commit).toHaveBeenCalledWith('light')
  })
})

describe('nextTheme', () => {
  it('flips between the two themes', () => {
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
  })
})

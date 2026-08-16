import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRANSITION_MS,
  formatElapsed,
  keyAction,
  presenterSlides,
  reduce,
  startIndex,
  transitionPlan,
  type PresenterState,
} from './presenter'
import { createSlide, type PresentationBody } from './presentModel'

const deck = (slides: { id: string; hidden?: boolean }[]): PresentationBody => ({
  app: 'lattice-present',
  version: 7,
  theme: 'plain',
  slides: slides.map((s) => createSlide({ id: s.id, hidden: s.hidden })),
})

const state = (at: number, black = false): PresenterState => ({ at, black })

describe('what gets presented', () => {
  it('runs only the slides the deck says are presentable', () => {
    const body = deck([{ id: 'a' }, { id: 'b', hidden: true }, { id: 'c' }])
    expect(presenterSlides(body).map((s) => s.id)).toEqual(['a', 'c'])
  })
})

describe('starting from where the editor was', () => {
  const body = deck([{ id: 'a' }, { id: 'b', hidden: true }, { id: 'c' }])

  it('translates a deck index into a presentable one', () => {
    expect(startIndex(body, 0)).toBe(0)
    expect(startIndex(body, 2)).toBe(1)
  })

  it('starts at the next shown slide when the editor sat on a hidden one', () => {
    expect(startIndex(body, 1)).toBe(1) // 'b' is hidden → start at 'c'
  })

  it('lands somewhere real for an index that does not exist', () => {
    expect(startIndex(body, 99)).toBe(0)
  })

  it('falls back to the last slide when everything after is hidden', () => {
    const trailing = deck([{ id: 'a' }, { id: 'b', hidden: true }])
    expect(startIndex(trailing, 1)).toBe(0)
  })
})

describe('navigation', () => {
  it('moves forward and back', () => {
    expect(reduce(state(0), 'next', 3).at).toBe(1)
    expect(reduce(state(1), 'prev', 3).at).toBe(0)
  })

  it('stops at the ends instead of wrapping', () => {
    expect(reduce(state(2), 'next', 3).at).toBe(2)
    expect(reduce(state(0), 'prev', 3).at).toBe(0)
  })

  it('jumps to the first and last', () => {
    expect(reduce(state(1), 'first', 5).at).toBe(0)
    expect(reduce(state(1), 'last', 5).at).toBe(4)
  })

  it('blanks and restores the screen without losing the place', () => {
    const blacked = reduce(state(2), 'black', 5)
    expect(blacked).toMatchObject({ at: 2, black: true })
    expect(reduce(blacked, 'black', 5).black).toBe(false)
  })

  it('lifts the black screen as soon as you navigate', () => {
    expect(reduce(state(1, true), 'next', 5)).toMatchObject({ at: 2, black: false })
  })

  it('handles a one-slide deck without going anywhere', () => {
    expect(reduce(state(0), 'next', 1).at).toBe(0)
  })
})

describe('keys', () => {
  it('advances on the keys a presenter actually presses', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']) {
      expect(keyAction(k)).toBe('next')
    }
  })

  it('goes back, blanks and exits', () => {
    expect(keyAction('ArrowLeft')).toBe('prev')
    expect(keyAction('Backspace')).toBe('prev')
    expect(keyAction('b')).toBe('black')
    expect(keyAction('B')).toBe('black')
    expect(keyAction('Escape')).toBe('exit')
  })

  it('ignores a key that means nothing here', () => {
    expect(keyAction('q')).toBeNull()
  })
})

describe('transitions', () => {
  it('does nothing for a slide that asked for nothing', () => {
    expect(transitionPlan(undefined, false)).toMatchObject({ animation: null, suppressed: 'set-to-none' })
  })

  it('names the animation and its duration', () => {
    const plan = transitionPlan({ transition: 'fade', transitionMs: 500 }, false)
    expect(plan).toMatchObject({ animation: 'present-fade', durationMs: 500, suppressed: null })
  })

  it('uses the default duration when none was set', () => {
    expect(transitionPlan({ transition: 'slide' }, false).durationMs).toBe(DEFAULT_TRANSITION_MS)
  })

  it('clamps a duration nobody could sit through', () => {
    expect(transitionPlan({ transition: 'fade', transitionMs: 99999 }, false).durationMs).toBe(2000)
    expect(transitionPlan({ transition: 'fade', transitionMs: 0 }, false).durationMs).toBe(60)
  })

  /**
   * The reduced-motion path is a real path, not a slower animation — and it
   * says why it did nothing, so the editor can tell you the transition is set
   * but will not run for you.
   */
  it('runs nothing at all under reduced motion, and says so', () => {
    const plan = transitionPlan({ transition: 'dissolve', transitionMs: 400 }, true)
    expect(plan).toMatchObject({ animation: null, durationMs: 0, suppressed: 'reduced-motion' })
  })
})

describe('the elapsed clock', () => {
  it('counts from zero in minutes and seconds', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(65_000)).toBe('1:05')
  })

  it('grows an hours field only once there are hours', () => {
    expect(formatElapsed(59 * 60_000)).toBe('59:00')
    expect(formatElapsed(3_661_000)).toBe('1:01:01')
  })

  it('never shows a negative clock', () => {
    expect(formatElapsed(-5000)).toBe('0:00')
  })
})

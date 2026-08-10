import { describe, expect, it } from 'vitest'
import { fitCount } from './useToolbarOverflow'

/**
 * The fold/unfold boundary — the thing issue #47 asked for tests on, and the
 * reason the primitive spent a phase unwired: `ResizeObserver` and
 * `clientWidth` are inert in jsdom, so the decision could only be exercised
 * once it stopped living inside the effect that measures.
 */

const BOARD = [96, 120, 120] // section · create · media, roughly

describe('fitCount', () => {
  it('keeps everything when everything fits', () => {
    expect(fitCount(BOARD, 400)).toBe(3)
  })

  it('keeps everything at exactly the width it needs', () => {
    expect(fitCount(BOARD, 336)).toBe(3)
  })

  it('folds the tail first', () => {
    // 336 of content, 300 of room, 40 reserved for the trigger
    expect(fitCount(BOARD, 300, 0, 40)).toBe(2)
  })

  it('folds further as the room shrinks', () => {
    expect(fitCount(BOARD, 180, 0, 40)).toBe(1)
  })

  it('never folds the last real control away', () => {
    // a bar that is nothing but a "···" is a menu wearing a toolbar's clothes
    expect(fitCount(BOARD, 10, 0, 40)).toBe(1)
    expect(fitCount(BOARD, 0, 0, 40)).toBe(1)
  })

  it('counts the gap between items', () => {
    // 3 items of 100 with a 20px gap need 360, not 300
    expect(fitCount([100, 100, 100], 330, 20)).toBe(2)
    expect(fitCount([100, 100, 100], 360, 20)).toBe(3)
  })

  it('reserves room for the trigger only once folding has started', () => {
    // it fits without a trigger, so the trigger is not rendered and not paid for
    expect(fitCount([100, 100], 200, 0, 40)).toBe(2)
  })

  it('answers 0 for an empty toolbar rather than inventing a control', () => {
    expect(fitCount([], 500)).toBe(0)
  })

  it('unfolds again when the room comes back — the same widths, both ways', () => {
    const narrow = fitCount(BOARD, 200, 0, 40)
    const wide = fitCount(BOARD, 800, 0, 40)
    expect(narrow).toBeLessThan(wide)
    expect(wide).toBe(BOARD.length)
  })
})

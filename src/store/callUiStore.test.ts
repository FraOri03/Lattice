import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampCallRect,
  defaultCallRect,
  floatingRectFrom,
  MIN_CALL_H,
  MIN_CALL_W,
  DEFAULT_CALL_H,
  DEFAULT_CALL_W,
  resizeCallRect,
  useCallUiStore,
  type CallRect,
} from './callUiStore'

/**
 * The free call window is only as good as its geometry: it must never leave
 * the screen, never collapse to nothing, and never move the edge the user is
 * NOT dragging. Those three promises are what these assertions are about.
 */

const VP = { width: 1200, height: 800 }
const rect = (x: number, y: number, w: number, h: number): CallRect => ({ x, y, w, h })

describe('clampCallRect', () => {
  it('keeps the whole window on screen', () => {
    expect(clampCallRect(rect(-200, -200, 400, 300), VP)).toEqual(rect(0, 0, 400, 300))
    expect(clampCallRect(rect(5000, 5000, 400, 300), VP)).toEqual(rect(800, 500, 400, 300))
  })

  it('holds the minimum size and never exceeds the viewport', () => {
    expect(clampCallRect(rect(0, 0, 10, 10), VP)).toEqual(rect(0, 0, MIN_CALL_W, MIN_CALL_H))
    const huge = clampCallRect(rect(0, 0, 9000, 9000), VP)
    expect(huge).toEqual(rect(0, 0, VP.width, VP.height))
  })

  it('survives a viewport smaller than the minimum window', () => {
    const tiny = clampCallRect(rect(0, 0, 400, 300), { width: 180, height: 120 })
    expect(tiny).toEqual(rect(0, 0, MIN_CALL_W, MIN_CALL_H))
  })

  it('falls back rather than propagating NaN', () => {
    const broken = clampCallRect(rect(Number.NaN, Number.NaN, Number.NaN, Number.NaN), VP)
    expect(broken).toEqual(rect(0, 0, DEFAULT_CALL_W, DEFAULT_CALL_H))
  })
})

describe('resizeCallRect', () => {
  const start = rect(400, 300, 400, 300)

  it('moves only the dragged edge', () => {
    expect(resizeCallRect(start, 'e', 100, 999, VP)).toEqual(rect(400, 300, 500, 300))
    expect(resizeCallRect(start, 's', 999, 100, VP)).toEqual(rect(400, 300, 400, 400))
  })

  it('pins the far edge when dragging west or north', () => {
    const w = resizeCallRect(start, 'w', -150, 0, VP)
    expect(w).toEqual(rect(250, 300, 550, 300))
    // the right edge did not move
    expect(w.x + w.w).toBe(start.x + start.w)

    const n = resizeCallRect(start, 'n', 0, -100, VP)
    expect(n.y + n.h).toBe(start.y + start.h)
  })

  it('stops at the minimum size instead of inverting the window', () => {
    const shrunk = resizeCallRect(start, 'w', 9999, 9999, VP)
    expect(shrunk.w).toBe(MIN_CALL_W)
    // shrinking from the west pushes the origin, never past the right edge
    expect(shrunk.x + shrunk.w).toBe(start.x + start.w)
  })

  it('resizes a corner on both axes at once', () => {
    expect(resizeCallRect(start, 'se', 100, 50, VP)).toEqual(rect(400, 300, 500, 350))
  })

  it('never grows past the screen', () => {
    const wide = resizeCallRect(start, 'se', 9999, 9999, VP)
    expect(wide.x + wide.w).toBe(VP.width)
    expect(wide.y + wide.h).toBe(VP.height)
  })
})

describe('undocking geometry', () => {
  it('opens bottom-right by default, inside the screen', () => {
    const d = defaultCallRect(VP)
    expect(d.w).toBe(DEFAULT_CALL_W)
    expect(d.x + d.w).toBeLessThanOrEqual(VP.width)
    expect(d.y + d.h).toBeLessThanOrEqual(VP.height)
  })

  it('grows out of the docked island, keeping its bottom-right corner', () => {
    const docked = rect(860, 690, 340, 52)
    const floated = floatingRectFrom(docked, VP)
    expect(floated.x + floated.w).toBe(docked.x + docked.w)
    expect(floated.y + floated.h).toBe(docked.y + docked.h)
    expect(floated.w).toBe(DEFAULT_CALL_W)
    expect(floated.h).toBe(DEFAULT_CALL_H)
  })

  it('never shrinks a window that is already bigger than the default', () => {
    const big = floatingRectFrom(rect(100, 100, 700, 500), VP)
    expect(big.w).toBe(700)
    expect(big.h).toBe(500)
  })
})

describe('call ui store', () => {
  beforeEach(() =>
    useCallUiStore.setState({
      expanded: false,
      mode: 'docked',
      rect: rect(0, 0, DEFAULT_CALL_W, DEFAULT_CALL_H),
    }),
  )

  it('starts docked', () => {
    expect(useCallUiStore.getState().mode).toBe('docked')
  })

  it('undocks to the given geometry and docks back without losing it', () => {
    const target = rect(120, 90, 520, 380)
    useCallUiStore.getState().float(target)
    expect(useCallUiStore.getState().mode).toBe('floating')
    expect(useCallUiStore.getState().rect).toEqual(target)

    useCallUiStore.getState().dock()
    expect(useCallUiStore.getState().mode).toBe('docked')
    // the window the user placed survives a trip to the corner and back
    expect(useCallUiStore.getState().rect).toEqual(target)
  })

  it('keeps the filmstrip preference independent of the window mode', () => {
    useCallUiStore.getState().setExpanded(true)
    useCallUiStore.getState().float(defaultCallRect(VP))
    useCallUiStore.getState().dock()
    expect(useCallUiStore.getState().expanded).toBe(true)
  })
})

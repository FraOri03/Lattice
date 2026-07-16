import { describe, expect, it } from 'vitest'
import {
  clampPosition,
  marqueeRect,
  normalizedZ,
  rectOf,
  rectsIntersect,
  resizeRect,
  unionBounds,
  type Rect,
} from './geometry'
import type { PresentElement } from './presentModel'

describe('present geometry', () => {
  it('clamps a position so 8px stays on the slide', () => {
    expect(clampPosition(-500, 0, 100, 50)).toEqual({ x: -92, y: 0 })
    expect(clampPosition(2000, 0, 100, 50).x).toBe(952)
    expect(clampPosition(100, 100, 100, 50)).toEqual({ x: 100, y: 100 })
  })

  it('computes union bounds', () => {
    const r: Rect[] = [
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 200, y: 100, w: 100, h: 100 },
    ]
    expect(unionBounds(r)).toEqual({ x: 0, y: 0, w: 300, h: 200 })
    expect(unionBounds([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  it('detects rect intersection for marquee selection', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    expect(rectsIntersect(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true)
    expect(rectsIntersect(a, { x: 200, y: 0, w: 50, h: 50 })).toBe(false)
    expect(marqueeRect(120, 40, 20, 90)).toEqual({ x: 20, y: 40, w: 100, h: 50 })
  })

  it('resizes from the SE corner (grow) and NW corner (move + shrink)', () => {
    const orig = { x: 100, y: 100, w: 200, h: 100 }
    expect(resizeRect(orig, 'se', 50, 20)).toEqual({ x: 100, y: 100, w: 250, h: 120 })
    expect(resizeRect(orig, 'nw', 10, 10)).toEqual({ x: 110, y: 110, w: 190, h: 90 })
  })

  it('locks aspect ratio with the aspect option', () => {
    const orig = { x: 100, y: 100, w: 200, h: 100 } // ratio 2:1
    expect(resizeRect(orig, 'e', 100, 0, { aspect: true })).toEqual({
      x: 100,
      y: 100,
      w: 300,
      h: 150,
    })
  })

  it('resizes symmetrically from center with the fromCenter option', () => {
    const orig = { x: 100, y: 100, w: 200, h: 100 }
    expect(resizeRect(orig, 'se', 50, 0, { fromCenter: true })).toEqual({
      x: 50,
      y: 100,
      w: 300,
      h: 100,
    })
  })

  it('never resizes below the minimum size', () => {
    const orig = { x: 0, y: 0, w: 20, h: 20 }
    const r = resizeRect(orig, 'se', -100, -100)
    expect(r.w).toBeGreaterThanOrEqual(8)
    expect(r.h).toBeGreaterThanOrEqual(8)
  })

  it('normalizes z-order to a contiguous 0..n-1 sequence', () => {
    const els = [
      { id: 'a', z: 5 },
      { id: 'b', z: 2 },
      { id: 'c', z: 9 },
    ] as PresentElement[]
    const z = normalizedZ(els)
    expect(z.get('b')).toBe(0)
    expect(z.get('a')).toBe(1)
    expect(z.get('c')).toBe(2)
  })

  it('rectOf extracts geometry', () => {
    expect(rectOf({ x: 1, y: 2, w: 3, h: 4 })).toEqual({ x: 1, y: 2, w: 3, h: 4 })
  })
})

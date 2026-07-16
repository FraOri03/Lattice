import { describe, expect, it } from 'vitest'
import { computeSnap } from './snapping'
import type { Rect } from './geometry'

describe('present snapping', () => {
  it('snaps the left edge to the slide left within threshold', () => {
    const r = computeSnap({ x: 3, y: 100, w: 100, h: 50 }, [], 6)
    expect(r.dx).toBe(-3)
    expect(r.guides.some((g) => g.axis === 'x' && g.pos === 0)).toBe(true)
  })

  it('snaps the center to the slide horizontal center', () => {
    // center at 478, slide center 480 → +2 correction
    const r = computeSnap({ x: 428, y: 100, w: 100, h: 50 }, [], 6)
    expect(r.dx).toBe(2)
  })

  it("snaps to another element's left edge", () => {
    const others: Rect[] = [{ x: 200, y: 0, w: 100, h: 100 }]
    const r = computeSnap({ x: 197, y: 300, w: 50, h: 50 }, others, 6)
    expect(r.dx).toBe(3)
  })

  it('does not snap beyond the threshold', () => {
    const r = computeSnap({ x: 100, y: 200, w: 50, h: 50 }, [], 6)
    expect(r.dx).toBe(0)
    expect(r.dy).toBe(0)
    expect(r.guides).toHaveLength(0)
  })

  it('snaps independently on each axis', () => {
    // left near 0 (x), top near slide middle 270 (y)
    const r = computeSnap({ x: 4, y: 268, w: 100, h: 50 }, [], 6)
    expect(r.dx).toBe(-4)
    expect(r.dy).toBe(2)
    expect(r.guides).toHaveLength(2)
  })
})
